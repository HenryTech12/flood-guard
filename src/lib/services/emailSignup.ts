// Email double opt-in for residents who sign up on the landing page (or the register form).
//   1. registration stores the address unconfirmed
//   2. we email a signed confirmation link (rate-limited per address)
//   3. /api/email/verify marks it confirmed → flood alerts are emailed from then on
//   4. every alert email carries a signed one-click unsubscribe link
import type { Sql } from "../db/client";
import { signToken, verifyToken } from "../auth/session";
import type { Lang } from "../core/types";
import { env } from "../env";
import { tx as tr } from "../i18n/templates";
import { isEmail } from "../messaging/email";
import { renderEmail } from "../messaging/emailTemplate";
import { sendNow } from "../messaging/outbox";
import { audit } from "./audit";

const VERIFY = "email-verify";
const UNSUB = "email-unsub";
export const VERIFY_RESEND_MIN = 10;

interface EmailToken {
  p: string;
  rid: string;
  email: string;
}

export async function verifyUrl(residentId: string, email: string) {
  return `${env.publicBaseUrl}/api/email/verify?token=${await signToken({ p: VERIFY, rid: residentId, email }, "7d")}`;
}

export async function unsubscribeUrl(residentId: string, email: string) {
  return `${env.publicBaseUrl}/api/email/unsubscribe?token=${await signToken({ p: UNSUB, rid: residentId, email }, "400d")}`;
}

/**
 * Send the confirmation email if the resident has an unconfirmed address and we have not
 * sent one to that address in the last VERIFY_RESEND_MIN minutes (stops the public form
 * being used to flood someone's inbox).
 */
export async function sendVerificationIfNeeded(sql: Sql, residentId: string): Promise<{ sent: boolean; url?: string; reason?: string }> {
  const [r] = await sql<{ name: string | null; email: string | null; email_verified_at: Date | null; preferred_language: Lang; zone: string | null }[]>`
    select r.name, r.email, r.email_verified_at, r.preferred_language, z.short_name zone
    from residents r left join zones z on z.id = r.zone_id where r.id = ${residentId}`;
  if (!r || !isEmail(r.email)) return { sent: false, reason: "no email" };
  if (r.email_verified_at) return { sent: false, reason: "already confirmed" };
  const [recent] = await sql`
    select 1 from outbound_messages where purpose = 'email_verify' and lower(to_email) = lower(${r.email})
      and created_at > now() - make_interval(mins => ${VERIFY_RESEND_MIN})`;
  if (recent) return { sent: false, reason: "recently sent" };

  const url = await verifyUrl(residentId, r.email);
  const lang = r.preferred_language;
  const vars = { name: r.name ?? "there", zone: r.zone ?? "your area" };
  const { text, html } = renderEmail({
    title: tr(lang, "email.verify_title", vars),
    paragraphs: [tr(lang, "email.verify_body", vars)],
    cta: { label: tr(lang, "email.verify_cta", vars), url },
    footer: tr(lang, "email.verify_ignore", vars),
  });
  await sendNow(sql, [{ channel: "email", to: r.email, subject: `FloodGuard: ${tr(lang, "email.verify_subject", vars)}`, body: text, html, language: lang, purpose: "email_verify", refType: "resident", refId: residentId }]);
  return { sent: true, url };
}

async function readToken(token: string | null, purpose: string): Promise<EmailToken | null> {
  const t = await verifyToken<EmailToken>(token ?? undefined);
  return t && t.p === purpose && t.rid && t.email ? t : null;
}

/** Returns true when the address was confirmed (or already was). Fails if the email has since changed. */
export async function confirmEmail(sql: Sql, token: string | null): Promise<boolean> {
  const t = await readToken(token, VERIFY);
  if (!t) return false;
  const [r] = await sql<{ id: string }[]>`
    update residents set email_verified_at = coalesce(email_verified_at, now()), email_opt_out = false
    where id = ${t.rid} and lower(email) = lower(${t.email}) returning id`;
  if (r) await audit(sql, `resident:${t.rid}`, "resident", t.rid, "email_confirmed");
  return !!r;
}

export async function unsubscribeEmail(sql: Sql, token: string | null): Promise<boolean> {
  const t = await readToken(token, UNSUB);
  if (!t) return false;
  const [r] = await sql<{ id: string }[]>`
    update residents set email_opt_out = true where id = ${t.rid} and lower(email) = lower(${t.email}) returning id`;
  if (r) await audit(sql, `resident:${t.rid}`, "resident", t.rid, "email_unsubscribed");
  return !!r;
}
