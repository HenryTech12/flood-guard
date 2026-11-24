// Citizen portal + authority dashboard services (Guardy features on the FloodGuard pipeline):
//   • flood events (weather / upload / zone) with nearby-subscriber notifications
//   • web emergency reports (form + voice) → help requests, nearest-centre notification
//   • authority report list and status updates (pending → responded → resolved)
import { randomUUID } from "node:crypto";
import type { Sql } from "../db/client";
import { pt } from "../db/client";
import { getRegion } from "../../../config/regions";
import { shouldSendAlert } from "../core/policy";
import { isValidPhone, maskPhone, normalizePhone } from "../core/phone";
import type { Lang, RiskLevel } from "../core/types";
import { env } from "../env";
import { t } from "../i18n/templates";
import { isEmail } from "../messaging/email";
import { renderEmail } from "../messaging/emailTemplate";
import { enqueue, processOutbox, type OutboundMessage } from "../messaging/outbox";
import { publishChange } from "../realtime/server";
import { audit } from "./audit";
import { closeRequest, notifyRescued, setRequestStatus } from "./dispatch";
import { unsubscribeUrl } from "./emailSignup";
import { createOrMergeHelpRequest } from "./helpRequests";
import { alertEmail } from "./notify";
import { reverseGeocode } from "./weather";

export type EventSeverity = "low" | "medium" | "high";
export const NOTIFY_RADIUS_KM = 20;
export const CENTRE_RADIUS_KM = 10;

export interface FloodEventInput {
  location: string;
  latitude: number;
  longitude: number;
  severity: EventSeverity;
  rainfall?: number | null;
  description?: string | null;
  source: "weather" | "manual" | "upload" | "zone" | "demo";
  zoneId?: string | null;
  timestamp?: string | Date | null;
}

const SEV_TO_LEVEL: Record<EventSeverity, RiskLevel> = { low: "low", medium: "medium", high: "high" };

export async function listFloodEvents(sql: Sql, limit = 50) {
  return sql<{ id: string; location: string; latitude: number; longitude: number; severity: EventSeverity; rainfall: number | null; description: string | null; source: string; notified_count: number; timestamp: Date }[]>`
    select id, location, latitude, longitude, severity, rainfall, description, source, notified_count, timestamp
    from flood_events order by timestamp desc limit ${limit}`;
}

/**
 * Record a flood event and alert registered people within 20 km (SMS + confirmed email),
 * in their language, with the same de-duplication as zone alerts. Weather events for the
 * same place are collapsed to one per hour.
 */
export async function createFloodEvent(sql: Sql, ev: FloodEventInput, { notify = true, actor = "system" } = {}) {
  if (ev.source === "weather") {
    const [recent] = await sql<{ id: string }[]>`
      select id from flood_events where source = 'weather' and lower(location) = lower(${ev.location})
        and created_at > now() - interval '60 minutes' limit 1`;
    if (recent) return { id: recent.id, created: false, notified: 0, subscribers: 0 };
  }
  const [row] = await sql<{ id: string }[]>`
    insert into flood_events (location, latitude, longitude, severity, rainfall, description, source, zone_id, timestamp)
    values (${ev.location}, ${ev.latitude}, ${ev.longitude}, ${ev.severity}, ${ev.rainfall ?? null}, ${ev.description ?? null}, ${ev.source},
            ${ev.zoneId ?? null}, ${ev.timestamp ? new Date(ev.timestamp) : new Date()})
    returning id`;
  await audit(sql, actor, "flood_event", row.id, "created", null, ev.severity, { location: ev.location, source: ev.source });

  let notified = 0;
  let subscribers = 0;
  if (notify && ev.severity !== "low") {
    const r = await notifyNearby(sql, row.id, ev);
    notified = r.sent;
    subscribers = r.subscribers;
    await sql`update flood_events set notified_count = ${notified} where id = ${row.id}`;
  }
  await publishChange("floods");
  return { id: row.id, created: true, notified, subscribers };
}

async function notifyNearby(sql: Sql, eventId: string, ev: FloodEventInput) {
  const region = getRegion();
  const level = SEV_TO_LEVEL[ev.severity];
  const people = await sql<{ id: string; phone: string; email: string | null; email_ok: boolean; preferred_language: Lang; alerts_opt_out: boolean; km: number }[]>`
    select r.id, r.phone, r.email, (r.email_verified_at is not null and not r.email_opt_out) email_ok, r.preferred_language, r.alerts_opt_out,
           ST_Distance(coalesce(r.home, z.centroid)::geography, ${pt(sql, [ev.longitude, ev.latitude])}::geography) / 1000 km
    from residents r left join zones z on z.id = r.zone_id
    where coalesce(r.home, z.centroid) is not null
      and ST_DWithin(coalesce(r.home, z.centroid)::geography, ${pt(sql, [ev.longitude, ev.latitude])}::geography, ${NOTIFY_RADIUS_KM * 1000})`;
  const last = await sql<{ resident_id: string; channel: string; level: RiskLevel; sent_at: Date }[]>`
    select resident_id, channel, level, sent_at from alert_deliveries where resident_id = any(${people.map((p) => p.id)}::uuid[])`;
  const lastBy = new Map(last.map((l) => [`${l.resident_id}:${l.channel}`, l]));
  const now = new Date();
  const msgs: OutboundMessage[] = [];
  const deliveries: { resident_id: string; channel: string }[] = [];
  const vars = { zone: ev.location, shelter: "the nearest high ground or shelter", shortcode: region.smsShortcode, ussd: region.ussdCode };

  for (const p of people) {
    if (p.alerts_opt_out) continue;
    for (const ch of ["sms", "email"] as const) {
      if (ch === "email" && !(p.email_ok && isEmail(p.email))) continue;
      const prev = lastBy.get(`${p.id}:${ch}`);
      if (!shouldSendAlert(level, prev ? { level: prev.level, sentAt: prev.sent_at } : null, now, { cooldownMin: env.alertCooldownMin }).send) continue;
      if (ch === "sms") {
        const r = t(p.preferred_language, `alert.${level}`, vars);
        msgs.push({ channel: "sms", to: p.phone, body: r.text, language: r.lang, purpose: "flood_event", refType: "flood_event", refId: eventId });
      } else {
        const e = alertEmail(p.preferred_language, level, { zone: ev.location, shelter: vars.shelter }, await unsubscribeUrl(p.id, p.email!));
        msgs.push({ channel: "email", to: p.email!, subject: e.subject, body: e.text, html: e.html, language: p.preferred_language, purpose: "flood_event", refType: "flood_event", refId: eventId });
      }
      deliveries.push({ resident_id: p.id, channel: ch });
    }
  }
  await enqueue(sql, msgs);
  if (deliveries.length) {
    await sql`
      insert into alert_deliveries (resident_id, channel, zone_id, level, sent_at)
      select x.resident_id, x.channel, ${`event:${eventId}`}, ${level}, now() from jsonb_to_recordset(${JSON.stringify(deliveries)}::text::jsonb) as x(resident_id uuid, channel text)
      on conflict (resident_id, channel) do update set zone_id = excluded.zone_id, level = excluded.level, sent_at = excluded.sent_at`;
  }
  await processOutbox(sql, { limit: 150 });
  return { sent: msgs.length, subscribers: people.length };
}

// ---------------------------------------------------------------------------------------
// Web emergency reports
// ---------------------------------------------------------------------------------------

export { NEED_TYPES } from "../core/needs";

export const MAX_VOICE_BYTES = 3 * 1024 * 1024;

export interface WebReportInput {
  name: string;
  phone?: string | null;
  typeOfNeed: string;
  comments?: string | null;
  peopleCount?: number | null;
  latitude: number;
  longitude: number;
  voice?: { mime: string; data: Buffer } | null;
}

export async function submitWebReport(sql: Sql, input: WebReportInput) {
  const phone = input.phone && isValidPhone(input.phone) ? normalizePhone(input.phone) : `web-${randomUUID().slice(0, 12)}`;
  const message = [input.typeOfNeed, input.comments?.trim()].filter(Boolean).join(": ");
  const locationName = await reverseGeocode(sql, input.latitude, input.longitude);

  const r = await createOrMergeHelpRequest(sql, {
    phone,
    channel: "web",
    message,
    peopleCount: input.peopleCount ?? null,
    location: { lngLat: [input.longitude, input.latitude], source: "gps" },
    actor: `web:${input.name}`,
    skipDispatch: true,
  });
  await sql`update help_requests set reporter_name = ${input.name}, type_of_need = ${input.typeOfNeed}, location_name = ${locationName},
            has_voice = has_voice or ${!!input.voice} where id = ${r.id}`;
  if (input.voice) {
    await sql`insert into voice_recordings (help_request_id, mime, size_bytes, data) values (${r.id}, ${input.voice.mime}, ${input.voice.data.length}, ${input.voice.data})
              on conflict (help_request_id) do update set mime = excluded.mime, size_bytes = excluded.size_bytes, data = excluded.data, created_at = now()`;
  }

  // Notify the nearest emergency centres (shelters + hospitals) within 10 km.
  const centres = await sql<{ id: string; name: string; type: string; contact_phone: string; email: string | null; km: number }[]>`
    select id, name, type, contact_phone, email, ST_Distance(geom::geography, ${pt(sql, [input.longitude, input.latitude])}::geography) / 1000 km
    from shelters where ST_DWithin(geom::geography, ${pt(sql, [input.longitude, input.latitude])}::geography, ${CENTRE_RADIUS_KM * 1000})
    order by km limit 3`;
  const msgs: OutboundMessage[] = [];
  for (const c of centres) {
    const body = `FloodGuard EMERGENCY ${r.ref}: ${input.name} reports "${input.typeOfNeed}". Location: ${locationName} (${input.latitude.toFixed(4)}, ${input.longitude.toFixed(4)}), ${c.km.toFixed(1)} km from you.${input.comments ? ` Note: ${input.comments.slice(0, 120)}` : ""}`;
    msgs.push({ channel: "sms", to: c.contact_phone, body, purpose: "centre_notify", refType: "help_request", refId: r.id, language: "en" });
    if (isEmail(c.email)) {
      const e = renderEmail({
        title: `Emergency report ${r.ref}`,
        accent: "#dc2626",
        paragraphs: [`${input.name} needs help: ${input.typeOfNeed}.`, `Location: ${locationName} — ${c.km.toFixed(1)} km from ${c.name}.`, ...(input.comments ? [`Comments: ${input.comments}`] : [])],
        cta: { label: "Open the authority dashboard", url: `${env.publicBaseUrl}/authority` },
        footer: "FloodGuard emergency notification for registered emergency centres.",
      });
      msgs.push({ channel: "email", to: c.email, subject: `[FloodGuard] Emergency ${r.ref}: ${input.typeOfNeed}`, body: e.text, html: e.html, purpose: "centre_notify", refType: "help_request", refId: r.id, language: "en" });
    }
  }
  await enqueue(sql, msgs);
  const nearbyCenters = centres.map((c) => ({ id: c.id, name: c.name, type: c.type, phone: c.contact_phone, distanceKm: Math.round(c.km * 10) / 10 }));
  await sql`update help_requests set notified_centers = ${JSON.stringify(nearbyCenters)}::text::jsonb where id = ${r.id}`;
  await processOutbox(sql, { limit: 20 });

  const { runDispatch } = await import("./dispatch");
  await runDispatch(sql);
  await publishChange("requests");
  return { id: r.id, ref: r.ref, merged: r.merged, locationName, nearbyCenters, smsReplies: isValidPhone(phone) };
}

// ---------------------------------------------------------------------------------------
// Authority dashboard
// ---------------------------------------------------------------------------------------

export type ReportStatus = "pending" | "responded" | "resolved" | "closed";
export function reportStatus(s: string): ReportStatus {
  return s === "new" ? "pending" : s === "assigned" || s === "en_route" ? "responded" : s === "rescued" ? "resolved" : "closed";
}

export async function listReports(sql: Sql, limit = 300) {
  const rows = await sql<{ id: string; ref_code: string; phone: string; reporter_name: string | null; resident_name: string | null; type_of_need: string | null; message: string | null; channel: string; lng: number; lat: number; location_name: string | null; landmark: string | null; zone: string | null; status: string; urgency_score: number; people_count: number; has_voice: boolean; created_at: Date; updated_at: Date; notified_centers: unknown; volunteer: string | null }[]>`
    select h.id, h.ref_code, h.phone, h.reporter_name, r.name resident_name, h.type_of_need, h.message, h.channel, ST_X(h.location) lng, ST_Y(h.location) lat,
           h.location_name, l.name landmark, z.name zone, h.status, h.urgency_score, h.people_count, h.has_voice, h.created_at, h.updated_at, h.notified_centers,
           v.name volunteer
    from help_requests h left join residents r on r.id = h.resident_id left join landmarks l on l.id = h.landmark_id
    left join zones z on z.id = h.zone_id left join volunteers v on v.id = h.assigned_volunteer_id
    order by h.created_at desc limit ${limit}`;
  return rows.map((h) => ({
    id: h.id,
    ref: h.ref_code,
    name: h.reporter_name ?? h.resident_name ?? "Unregistered caller",
    phoneMasked: h.phone.startsWith("web-") ? null : maskPhone(h.phone),
    typeOfNeed: h.type_of_need ?? (h.channel === "web" ? "Emergency" : "Rescue request"),
    comments: h.type_of_need && h.message?.startsWith(h.type_of_need) ? h.message.slice(h.type_of_need.length).replace(/^:\s*/, "") || null : h.message,
    channel: h.channel,
    latitude: h.lat,
    longitude: h.lng,
    locationName: h.location_name ?? ([h.landmark ? `Near ${h.landmark}` : null, h.zone].filter(Boolean).join(", ") || null),
    status: reportStatus(h.status),
    rawStatus: h.status,
    urgency: h.urgency_score,
    people: h.people_count,
    hasVoice: h.has_voice,
    volunteer: h.volunteer,
    notifiedCenters: (h.notified_centers as { name: string; distanceKm: number }[]) ?? [],
    timestamp: h.created_at.toISOString(),
  }));
}

export async function setReportStatus(sql: Sql, id: string, status: "responded" | "resolved", actor: string) {
  const [h] = await sql<{ status: string }[]>`select status from help_requests where id = ${id}`;
  if (!h) return false;
  if (status === "responded") {
    if (h.status !== "new") return true;
    // An authority team is handling it outside the volunteer app: withdraw pending offers.
    await sql`update rescue_jobs set status = 'cancelled', outcome = 'reassigned' where help_request_id = ${id} and status = 'offered'`;
    await setRequestStatus(sql, id, "new", "assigned", actor, { via: "authority dashboard" });
  } else {
    if (["rescued", "cancelled", "duplicate"].includes(h.status)) return true;
    await sql`update rescue_jobs set status = 'cancelled', outcome = 'cancelled', completed_at = now() where help_request_id = ${id} and status in ('offered', 'accepted')`;
    await sql`update help_requests set rescued_at = now(), close_reason = ${"Resolved by authority"} where id = ${id}`;
    await setRequestStatus(sql, id, h.status, "rescued", actor, { via: "authority dashboard" });
    await notifyRescued(sql, id);
  }
  await publishChange("requests");
  return true;
}

export { closeRequest };
