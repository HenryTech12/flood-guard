// Inbound SMS + USSD handling — shared by the Africa's Talking webhooks and the /sim
// phone simulator. Idempotent: a provider retry with the same message id returns the
// stored reply and changes nothing.
import type { Sql } from "../db/client";
import { getRegion } from "../../../config/regions";
import { formatDistance } from "../core/geo";
import { normalizePhone } from "../core/phone";
import { matchPlace, parseSms } from "../core/smsParser";
import { runUssd, type UssdLocation } from "../core/ussd";
import { LANG_NAMES, type Lang, type LngLat } from "../core/types";
import { tx as tr } from "../i18n/templates";
import { sendNow } from "../messaging/outbox";
import { createOrMergeHelpRequest, updateRequestLocation, type HelpLocation } from "./helpRequests";
import { getResidentByPhone, getShelters, getZones, nearestShelters, type ZoneRef } from "./reference";
import { createCrowdReport } from "./reports";
import { deleteResidentData, recordCheckin, registerResident, setAlertsOptOut, setLanguage } from "./residents";

async function claimInbound(sql: Sql, provider: string, providerMessageId: string, channel: string, from: string, body: string) {
  const [row] = await sql<{ id: number }[]>`
    insert into inbound_messages (provider, provider_message_id, channel, from_phone, body)
    values (${provider}, ${providerMessageId}, ${channel}, ${from}, ${body})
    on conflict (provider, provider_message_id) do nothing returning id`;
  if (row) return { duplicate: false as const, id: row.id };
  const [ex] = await sql<{ id: number; response: string | null; result: unknown }[]>`
    select id, response, result from inbound_messages where provider = ${provider} and provider_message_id = ${providerMessageId}`;
  return { duplicate: true as const, id: ex.id, response: ex.response, result: ex.result };
}

async function finishInbound(sql: Sql, id: number, response: string | null, result: Record<string, unknown>) {
  await sql`update inbound_messages set response = ${response}, result = ${JSON.stringify(result)}::text::jsonb where id = ${id}`;
}

/** Find a landmark or zone mentioned in free text. */
function placeFromText(text: string, zones: ZoneRef[], preferZone?: string | null): HelpLocation | null {
  if (!text.trim()) return null;
  const landmarks = zones.flatMap((z) => z.landmarks.map((l) => ({ ...l, zoneId: z.id })));
  const ordered = preferZone ? [...landmarks.filter((l) => l.zoneId === preferZone), ...landmarks.filter((l) => l.zoneId !== preferZone)] : landmarks;
  const lm = matchPlace(text, ordered);
  if (lm) return { lngLat: lm.location, source: "ussd_landmark", landmarkId: lm.id, zoneId: lm.zoneId };
  const z = matchPlace(
    text,
    zones.flatMap((z) => [
      { id: z.id, name: z.name },
      { id: z.id, name: z.shortName },
    ]),
  );
  if (z) {
    const zone = zones.find((x) => x.id === z.id)!;
    return { lngLat: zone.centroid, source: "zone_centroid", zoneId: zone.id };
  }
  return null;
}

function placeLabel(loc: HelpLocation, zones: ZoneRef[]) {
  const z = zones.find((x) => x.id === loc.zoneId);
  return z?.landmarks.find((l) => l.id === loc.landmarkId)?.name ?? z?.shortName ?? "your area";
}

export interface InboundSms {
  provider: string;
  providerMessageId: string;
  from: string;
  text: string;
  channel?: "sms" | "demo";
}

export interface InboundResult {
  duplicate: boolean;
  reply: string | null;
  kind: string;
  ref?: string;
}

export async function handleInboundSms(sql: Sql, msg: InboundSms): Promise<InboundResult> {
  const from = normalizePhone(msg.from);
  const claim = await claimInbound(sql, msg.provider, msg.providerMessageId, "sms", from, msg.text);
  if (claim.duplicate) return { duplicate: true, reply: claim.response ?? null, kind: "duplicate" };

  const region = getRegion();
  const resident = await getResidentByPhone(sql, from);
  let lang: Lang = resident?.lang ?? "en";
  const parsed = parseSms(msg.text);
  const zones = await getZones(sql);
  let reply: string | null = null;
  let ref: string | undefined;
  const common = { shortcode: region.smsShortcode, ussd: region.ussdCode };

  switch (parsed.kind) {
    case "help": {
      const loc = placeFromText(parsed.note, zones, resident?.zoneId);
      const r = await createOrMergeHelpRequest(sql, { phone: from, channel: msg.channel ?? "sms", message: msg.text, peopleCount: parsed.peopleCount, location: loc, actor: `resident:${from}` });
      ref = r.ref;
      reply = r.merged
        ? tr(lang, "sms.help_merged", { ref: r.ref, people: r.peopleCount })
        : r.located
          ? tr(lang, "sms.help_ack", { ref: r.ref, people: r.peopleCount })
          : tr(lang, "sms.help_ack_unlocated", { ref: r.ref });
      break;
    }
    case "safe": {
      const c = await recordCheckin(sql, from, "sms");
      reply = c.closedRef ? tr(lang, "sms.safe_ack_closed", { ...common, ref: c.closedRef }) : tr(lang, "sms.safe_ack", common);
      break;
    }
    case "report": {
      const loc = placeFromText(parsed.landmarkText, zones, resident?.zoneId) ??
        (resident?.home ? { lngLat: resident.home, source: "registered" as const, zoneId: resident.zoneId } : null) ??
        (resident?.zoneId ? { lngLat: zones.find((z) => z.id === resident.zoneId)!.centroid, source: "zone_centroid" as const, zoneId: resident.zoneId } : null);
      if (loc) {
        await createCrowdReport(sql, { phone: from, location: loc.lngLat, locationSource: loc.source, zoneId: loc.zoneId, landmarkId: loc.landmarkId, type: parsed.reportType, depthCm: parsed.depthCm, description: msg.text, channel: "sms" });
        reply = tr(lang, "sms.report_ack", { place: ` near ${placeLabel(loc, zones)}` });
      } else {
        reply = tr(lang, "sms.report_ack", { place: " (add a landmark next time, e.g. WATER knee Kpata Market)" });
      }
      break;
    }
    case "shelter": {
      const from_: LngLat | null = resident?.home ?? zones.find((z) => z.id === resident?.zoneId)?.centroid ?? null;
      const list = from_ ? await nearestShelters(sql, from_, { limit: 1 }) : (await getShelters(sql)).filter((s) => s.capacity > s.occupancy).slice(0, 1);
      const s = list[0];
      reply = s
        ? tr(lang, "sms.shelter_info", { name: s.name, distance: s.distanceM !== undefined ? formatDistance(s.distanceM) : "?", space: s.capacity - s.occupancy, phone: s.phone })
        : tr(lang, "sms.shelter_none", common);
      break;
    }
    case "stop":
      await setAlertsOptOut(sql, from, true);
      reply = tr(lang, "sms.stop_ack");
      break;
    case "start":
      await setAlertsOptOut(sql, from, false);
      reply = tr(lang, "sms.start_ack");
      break;
    case "delete":
      await deleteResidentData(sql, from);
      reply = tr(lang, "sms.delete_ack");
      break;
    case "lang":
      await setLanguage(sql, from, parsed.lang);
      lang = parsed.lang;
      reply = tr(lang, "sms.lang_ack", { language: LANG_NAMES[parsed.lang] });
      break;
    case "unknown": {
      // A follow-up to a recent help request: treat as extra details / location.
      const [open] = await sql<{ id: string; ref_code: string; location_source: string }[]>`
        select id, ref_code, location_source from help_requests
        where phone = ${from} and status in ('new', 'assigned', 'en_route') and created_at > now() - interval '30 minutes'
        order by created_at desc limit 1`;
      if (open) {
        const loc = placeFromText(parsed.note, zones, resident?.zoneId);
        if (loc && ["unknown", "zone_centroid", "registered"].includes(open.location_source)) {
          await updateRequestLocation(sql, open.id, loc, `resident:${from}`);
          reply = tr(lang, "sms.location_updated", { ref: open.ref_code, place: placeLabel(loc, zones) });
        } else {
          const r = await createOrMergeHelpRequest(sql, { phone: from, channel: "sms", message: msg.text, peopleCount: null, actor: `resident:${from}` });
          reply = tr(lang, "sms.help_merged", { ref: r.ref, people: r.peopleCount });
        }
        ref = open.ref_code;
      } else {
        reply = tr(lang, "sms.unknown");
      }
      break;
    }
  }

  if (reply) await sendNow(sql, [{ channel: "sms", to: from, body: reply, language: lang, purpose: `reply_${parsed.kind}`, refType: "inbound", refId: String(claim.id) }]);
  await finishInbound(sql, claim.id, reply, { kind: parsed.kind, ref: ref ?? null });
  return { duplicate: false, reply, kind: parsed.kind, ref };
}

export interface InboundUssd {
  provider: string;
  sessionId: string;
  phone: string;
  text: string;
}

export async function handleUssd(sql: Sql, req: InboundUssd): Promise<{ response: string; duplicate: boolean; step: string }> {
  const phone = normalizePhone(req.phone);
  const claim = await claimInbound(sql, req.provider, `ussd:${req.sessionId}:${req.text}`, "ussd", phone, req.text);
  if (claim.duplicate && claim.response) return { response: claim.response, duplicate: true, step: "duplicate" };

  const region = getRegion();
  const resident = await getResidentByPhone(sql, phone);
  const zones = await getZones(sql);
  const shelters = await getShelters(sql);
  const result = runUssd(req.text, {
    lang: resident?.lang ?? "en",
    regionName: region.name,
    ussdCode: region.ussdCode,
    shortcode: region.smsShortcode,
    resident: resident ? { name: resident.name, zoneId: resident.zoneId, home: resident.home } : null,
    zones: zones.map((z) => ({ id: z.id, name: z.name, shortName: z.shortName, centroid: z.centroid, landmarks: z.landmarks })),
    shelters: shelters.map((s) => ({ name: s.name, location: s.location, capacity: s.capacity, occupancy: s.occupancy, phone: s.phone })),
  });

  let response = result.response;
  const toHelpLocation = (loc: UssdLocation): HelpLocation | null => {
    if (loc.kind === "home") return resident?.home ? { lngLat: resident.home, source: "registered", zoneId: resident.zoneId } : null;
    const z = zones.find((x) => x.id === loc.zoneId)!;
    if (loc.kind === "zone") return { lngLat: z.centroid, source: "zone_centroid", zoneId: z.id };
    const l = z.landmarks.find((x) => x.id === loc.landmarkId)!;
    return { lngLat: l.location, source: "ussd_landmark", landmarkId: l.id, zoneId: z.id };
  };

  const a = result.action;
  if (a?.type === "help") {
    const r = await createOrMergeHelpRequest(sql, {
      phone,
      channel: "ussd",
      // Vulnerability is passed structurally (extraVulnerable) — keep it out of the free text so
      // keyword scoring does not count it twice.
      message: `USSD: ${a.peopleCount} people`,
      peopleCount: a.peopleCount,
      location: toHelpLocation(a.location),
      extraVulnerable: a.vulnerableType ? [{ type: a.vulnerableType, count: 1 }] : [],
      actor: `resident:${phone}`,
    });
    response = response.replace("{ref}", r.ref);
    await sendNow(sql, [{ channel: "sms", to: phone, body: tr(resident?.lang ?? "en", "sms.help_ack", { ref: r.ref, people: r.peopleCount }), language: resident?.lang ?? "en", purpose: "reply_help", refType: "inbound", refId: String(claim.id) }]);
  } else if (a?.type === "safe") {
    await recordCheckin(sql, phone, "ussd");
  } else if (a?.type === "report") {
    const loc = a.location ? toHelpLocation(a.location) : null;
    const fallback: HelpLocation | null = resident?.home ? { lngLat: resident.home, source: "registered", zoneId: resident.zoneId } : null;
    const l = loc ?? fallback;
    if (l) await createCrowdReport(sql, { phone, location: l.lngLat, locationSource: l.source, zoneId: l.zoneId, landmarkId: l.landmarkId, type: a.reportType, depthCm: a.depthCm, description: "USSD report", channel: "ussd" });
  } else if (a?.type === "register") {
    const z = zones.find((x) => x.id === a.zoneId)!;
    const home = a.landmarkId ? z.landmarks.find((l) => l.id === a.landmarkId)?.location ?? null : null;
    await registerResident(sql, {
      phone,
      name: a.name,
      lang: a.lang,
      zoneId: a.zoneId,
      home, // approximate (landmark), stored with the consent given on the last screen
      consent: true,
      registeredBy: "ussd",
      vulnerable: a.vulnerableType ? [{ type: a.vulnerableType, count: 1 }] : [],
      family: a.familyPhone ? [{ phone: a.familyPhone }] : [],
      mode: "append",
    });
    await sendNow(sql, [{ channel: "sms", to: phone, body: tr(a.lang, "sms.register_ack", { name: a.name, zone: z.shortName, language: LANG_NAMES[a.lang] }), language: a.lang, purpose: "register_ack" }]);
  }

  await finishInbound(sql, claim.id, response, { step: result.step, action: a?.type ?? null });
  return { response, duplicate: false, step: result.step };
}
