// Email notifications (sent through the outbox → Brevo or mock).
//   • ops: SEMA staff in OPS_NOTIFY_EMAILS — zone escalations and critical help requests
//   • residents: flood alerts (built in alerts.ts with alertEmail())
//   • family: "X is safe" after a rescue or a SAFE check-in
import type { Db } from "../db/client";
import { getRegion } from "../../../config/regions";
import type { Lang, Reason, RiskLevel } from "../core/types";
import { env } from "../env";
import { tx as tr } from "../i18n/templates";
import { isEmail } from "../messaging/email";
import { renderEmail } from "../messaging/emailTemplate";
import { enqueue, type OutboundMessage } from "../messaging/outbox";

const LEVEL_ACCENT: Record<RiskLevel, string> = { low: "#22c55e", medium: "#f59e0b", high: "#ef4444", severe: "#a855f7" };

function opsMessages(subject: string, content: Parameters<typeof renderEmail>[0], purpose: string, refType: string, refId: string): OutboundMessage[] {
  const { text, html } = renderEmail({ ...content, footer: content.footer ?? "FloodGuard operational notification for SEMA staff. Manage recipients with OPS_NOTIFY_EMAILS." });
  return env.opsNotifyEmails.filter(isEmail).map((to) => ({ channel: "email" as const, to, subject: `[FloodGuard] ${subject}`, body: text, html, purpose, refType, refId, language: "en" }));
}

/** Zone rose to HIGH or SEVERE. */
export async function notifyOpsZoneEscalation(db: Db, z: { zoneId: string; zoneName: string; from: RiskLevel; to: RiskLevel; reasons: string[]; residents: number; vulnerable: number }) {
  if (!env.opsNotifyEmails.length) return 0;
  const msgs = opsMessages(
    `${z.zoneName} is now ${z.to.toUpperCase()}`,
    {
      title: `${z.zoneName}: risk ${z.from.toUpperCase()} → ${z.to.toUpperCase()}`,
      accent: LEVEL_ACCENT[z.to],
      paragraphs: [`${z.residents} registered residents in this zone, ${z.vulnerable} households with vulnerable members.`, "Why:"],
      bullets: z.reasons,
      cta: { label: "Open the command map", url: `${env.publicBaseUrl}/command` },
    },
    "ops_zone",
    "zone",
    z.zoneId,
  );
  await enqueue(db, msgs);
  return msgs.length;
}

/** A new help request at or above OPS_NOTIFY_MIN_URGENCY. */
export async function notifyOpsCriticalRequest(db: Db, r: { id: string; ref: string; urgency: number; reasons: Reason[]; people: number; zoneName: string | null; place: string | null; locationSource: string }) {
  if (!env.opsNotifyEmails.length || r.urgency < env.opsNotifyMinUrgency) return 0;
  const msgs = opsMessages(
    `Critical help request ${r.ref} (urgency ${r.urgency})`,
    {
      title: `Critical: ${r.ref} — urgency ${r.urgency}/100`,
      accent: "#dc2626",
      paragraphs: [`${r.people} people · ${r.place ?? r.zoneName ?? "location unknown"} (${r.locationSource.replace("_", " ")}).`, "Urgency breakdown:"],
      bullets: r.reasons.map((x) => `${x.label} (+${x.points})`),
      cta: { label: "Open in the command map", url: `${env.publicBaseUrl}/command` },
    },
    "ops_critical_request",
    "help_request",
    r.id,
  );
  await enqueue(db, msgs);
  return msgs.length;
}

/** Resident flood-alert email in the resident's language (English fallback). */
export function alertEmail(lang: Lang, level: RiskLevel, vars: Record<string, string>, unsubscribeUrl?: string): { subject: string; text: string; html: string } {
  const region = getRegion();
  const all = { ...vars, shortcode: region.smsShortcode, ussd: region.ussdCode };
  const { text, html } = renderEmail({
    title: tr(lang, `email.alert_title.${level}`, all),
    accent: LEVEL_ACCENT[level],
    paragraphs: [tr(lang, `voice.${level}`, all)],
    footer: tr(lang, "email.footer", all),
    unsubscribe: unsubscribeUrl ? { label: tr(lang, "email.unsubscribe", all), url: unsubscribeUrl } : undefined,
  });
  return { subject: `FloodGuard: ${tr(lang, `email.alert_subject.${level}`, all)}`, text, html };
}

/** "X is safe" email to a family contact. */
export function safeEmail(lang: Lang, kind: "rescued" | "checkin", vars: { name: string; ref?: string; time?: string }): { subject: string; text: string; html: string } {
  const region = getRegion();
  const all = { ...vars, shortcode: region.smsShortcode };
  const { text, html } = renderEmail({
    title: tr(lang, "email.safe_subject", all),
    accent: "#22c55e",
    paragraphs: [tr(lang, kind === "rescued" ? "email.safe_rescued" : "email.safe_checkin", all)],
    footer: "FloodGuard · flood early warning and rescue",
  });
  return { subject: `FloodGuard: ${tr(lang, "email.safe_subject", all)}`, text, html };
}
