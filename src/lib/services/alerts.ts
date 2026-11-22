// Multilingual alerts: SMS + voice per resident in their language, de-duplicated per
// resident (see core/policy.shouldSendAlert), plus a community radio script per zone.
import type { Sql } from "../db/client";
import { getRegion } from "../../../config/regions";
import { formatDistance } from "../core/geo";
import { shouldSendAlert } from "../core/policy";
import { type Lang, type RiskLevel, levelIndex, LANG_NAMES } from "../core/types";
import { env } from "../env";
import { t, tx as tr } from "../i18n/templates";
import { enqueue, processOutbox, type OutboundMessage } from "../messaging/outbox";
import { publishChange } from "../realtime/server";
import { audit } from "./audit";
import { isEmail } from "../messaging/email";
import { unsubscribeUrl } from "./emailSignup";
import { alertEmail } from "./notify";
import { nearestShelters } from "./reference";

export interface AlertSummary {
  zoneId: string;
  level: RiskLevel;
  sms: number;
  voice: number;
  email: number;
  skipped: number;
  byLanguage: Record<string, { sms: number; voice: number; email: number; fallback: boolean }>;
  skippedReasons: Record<string, number>;
}

async function zoneInfo(sql: Sql, zoneId: string) {
  const [z] = await sql<{ id: string; name: string; short_name: string; lng: number; lat: number; current_risk_level: RiskLevel; risk_reasons: string[] }[]>`
    select id, name, short_name, ST_X(centroid) lng, ST_Y(centroid) lat, current_risk_level, risk_reasons from zones where id = ${zoneId}`;
  return z ?? null;
}

export function voiceAudioUrl(lang: Lang, level: RiskLevel) {
  return `${env.publicBaseUrl}/audio/${lang}/alert_${level}.mp3`;
}

/** Send alerts to every registered resident in a zone (respecting de-dup unless forced). */
export async function sendZoneAlerts(
  sql: Sql,
  zoneId: string,
  { level, force = false, actor = "system", channels = ["sms", "voice", "email"] as ("sms" | "voice" | "email")[] }: { level?: RiskLevel; force?: boolean; actor?: string; channels?: ("sms" | "voice" | "email")[] } = {},
): Promise<AlertSummary> {
  const region = getRegion();
  const z = await zoneInfo(sql, zoneId);
  if (!z) throw new Error(`Unknown zone ${zoneId}`);
  const lvl = level ?? z.current_risk_level;
  const summary: AlertSummary = { zoneId, level: lvl, sms: 0, voice: 0, email: 0, skipped: 0, byLanguage: {}, skippedReasons: {} };
  if (levelIndex(lvl) < levelIndex("medium")) {
    summary.skippedReasons["zone below MEDIUM"] = 1;
    return summary;
  }
  const [shelter] = await nearestShelters(sql, [z.lng, z.lat], { needSpace: 10, limit: 1 });
  const vars = { zone: z.short_name, shelter: shelter?.name ?? "the nearest high ground", shortcode: region.smsShortcode, ussd: region.ussdCode };

  const residents = await sql<{ id: string; phone: string; email: string | null; email_ok: boolean; preferred_language: Lang; alerts_opt_out: boolean }[]>`
    select id, phone, email, (email_verified_at is not null and not email_opt_out) email_ok, preferred_language, alerts_opt_out
    from residents where zone_id = ${zoneId}`;
  const last = await sql<{ resident_id: string; channel: string; level: RiskLevel; sent_at: Date }[]>`
    select resident_id, channel, level, sent_at from alert_deliveries where resident_id = any(${residents.map((r) => r.id)}::uuid[])`;
  const lastBy = new Map(last.map((l) => [`${l.resident_id}:${l.channel}`, l]));
  const now = new Date();
  const msgs: OutboundMessage[] = [];
  const deliveries: { resident_id: string; channel: string }[] = [];

  for (const r of residents) {
    if (r.alerts_opt_out) {
      summary.skipped++;
      summary.skippedReasons["opted out (STOP)"] = (summary.skippedReasons["opted out (STOP)"] ?? 0) + 1;
      continue;
    }
    for (const ch of channels) {
      if (ch === "voice" && levelIndex(lvl) < levelIndex("high")) continue; // voice only for HIGH+
      if (ch === "email" && !(r.email_ok && isEmail(r.email))) continue; // only confirmed, subscribed addresses
      const prev = lastBy.get(`${r.id}:${ch}`);
      const decision = shouldSendAlert(lvl, prev ? { level: prev.level, sentAt: prev.sent_at } : null, now, { force, cooldownMin: env.alertCooldownMin });
      if (!decision.send) {
        summary.skipped++;
        const key = decision.reason.replace(/\d+ min ago/, "recently");
        summary.skippedReasons[key] = (summary.skippedReasons[key] ?? 0) + 1;
        continue;
      }
      const lang = r.preferred_language;
      const key = ch === "sms" ? `alert.${lvl}` : `voice.${lvl}`;
      const rendered = t(lang, key, vars);
      const bucket = (summary.byLanguage[lang] ??= { sms: 0, voice: 0, email: 0, fallback: false });
      bucket.fallback ||= rendered.fallback;
      if (ch === "email") {
        bucket.email++;
        summary.email++;
        const e = alertEmail(lang, lvl, { zone: z.short_name, shelter: vars.shelter }, await unsubscribeUrl(r.id, r.email!));
        msgs.push({ channel: "email", to: r.email!, subject: e.subject, body: e.text, html: e.html, language: rendered.lang, purpose: "alert", refType: "zone", refId: zoneId });
      } else if (ch === "sms") {
        bucket.sms++;
        summary.sms++;
        msgs.push({ channel: "sms", to: r.phone, body: rendered.text, language: rendered.lang, purpose: "alert", refType: "zone", refId: zoneId });
      } else {
        bucket.voice++;
        summary.voice++;
        // Audio is chosen by the *requested* language: recordings are made by native speakers.
        msgs.push({ channel: "voice", to: r.phone, body: rendered.text, audioUrl: voiceAudioUrl(lang, lvl), language: lang, purpose: "alert", refType: "zone", refId: zoneId });
      }
      deliveries.push({ resident_id: r.id, channel: ch });
    }
  }

  await enqueue(sql, msgs);
  if (deliveries.length) {
    await sql`
      insert into alert_deliveries (resident_id, channel, zone_id, level, sent_at)
      select x.resident_id, x.channel, ${zoneId}, ${lvl}, now() from jsonb_to_recordset(${JSON.stringify(deliveries)}::text::jsonb) as x(resident_id uuid, channel text)
      on conflict (resident_id, channel) do update set zone_id = excluded.zone_id, level = excluded.level, sent_at = excluded.sent_at`;
  }
  for (const [lang, b] of Object.entries(summary.byLanguage)) {
    for (const ch of ["sms", "voice", "email"] as const) {
      if (!b[ch]) continue;
      const r = t(lang as Lang, ch === "sms" ? `alert.${lvl}` : `voice.${lvl}`, vars);
      await sql`insert into alerts (zone_id, level, language, channel, message, sent_count, fallback_from, created_by)
                values (${zoneId}, ${lvl}, ${lang}, ${ch}, ${r.text}, ${b[ch]}, ${r.fallback ? lang : null}, ${actor})`;
    }
  }
  // Always (re)generate the radio script for the operator.
  const script = await buildRadioScript(sql, zoneId, "en", lvl);
  await sql`insert into alerts (zone_id, level, language, channel, message, sent_count, created_by) values (${zoneId}, ${lvl}, 'en', 'radio_script', ${script}, 0, ${actor})`;
  await audit(sql, actor, "zone", zoneId, "alerts_sent", null, lvl, { sms: summary.sms, voice: summary.voice, email: summary.email, skipped: summary.skipped, force });
  // Send the first batch straight away; the tick drains the rest with retries.
  await processOutbox(sql, { limit: 150 });
  await publishChange("alerts");
  return summary;
}

export async function buildRadioScript(sql: Sql, zoneId: string, lang: Lang = "en", level?: RiskLevel): Promise<string> {
  const region = getRegion();
  const z = await zoneInfo(sql, zoneId);
  if (!z) throw new Error(`Unknown zone ${zoneId}`);
  const lvl = (level ?? z.current_risk_level) === "low" ? "medium" : (level ?? z.current_risk_level);
  const lms = await sql<{ name: string }[]>`select name from landmarks where zone_id = ${zoneId} order by id limit 4`;
  const shelters = await nearestShelters(sql, [z.lng, z.lat], { needSpace: 10, limit: 3 });
  const time = new Date().toLocaleString("en-NG", { dateStyle: "medium", timeStyle: "short", timeZone: "Africa/Lagos" });
  return tr(lang, "radio.script", {
    level_word: tr(lang, `radio.level_word.${lvl}`),
    level_body: tr(lang, `radio.level_body.${lvl}`),
    zone: `${z.name} (${region.name})`,
    time,
    reasons: (z.risk_reasons ?? []).join("; ") || "rising flood risk",
    landmarks: lms.map((l) => l.name).join(", "),
    shelters: shelters.map((s) => `${s.name} (${formatDistance(s.distanceM ?? 0)}, space for ${s.capacity - s.occupancy})`).join("; ") || "the nearest high ground",
    shortcode: region.smsShortcode,
    ussd: region.ussdCode,
  });
}

export function languageLabel(l: Lang) {
  return LANG_NAMES[l];
}
