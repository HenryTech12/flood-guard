import { createHash, randomInt } from "node:crypto";
import type { Sql } from "../db/client";
import { env } from "../env";
import { tx as tr } from "../i18n/templates";
import { sendNow } from "../messaging/outbox";

const hash = (phone: string, code: string) => createHash("sha256").update(`${env.authSecret}:${phone}:${code}`).digest("hex");

export async function requestOtp(sql: Sql, phone: string): Promise<{ ok: boolean; demoCode?: string }> {
  const [v] = await sql<{ id: string }[]>`select id from volunteers where phone = ${phone}`;
  // Same response whether or not the number is registered (no account enumeration).
  if (!v) return { ok: true };
  const code = env.demoMode ? env.demoOtp : String(randomInt(0, 1_000_000)).padStart(6, "0");
  await sql`insert into otp_codes (phone, code_hash, expires_at, attempts) values (${phone}, ${hash(phone, code)}, now() + interval '5 minutes', 0)
            on conflict (phone) do update set code_hash = excluded.code_hash, expires_at = excluded.expires_at, attempts = 0`;
  await sendNow(sql, [{ channel: "sms", to: phone, body: tr("en", "sms.otp", { code }), purpose: "otp" }]);
  return { ok: true, demoCode: env.demoMode ? code : undefined };
}

export async function verifyOtp(sql: Sql, phone: string, code: string): Promise<{ id: string; name: string } | null> {
  const [row] = await sql<{ code_hash: string; expires_at: Date; attempts: number }[]>`select code_hash, expires_at, attempts from otp_codes where phone = ${phone}`;
  if (!row || row.expires_at.getTime() < Date.now() || row.attempts >= 5) return null;
  if (row.code_hash !== hash(phone, code.trim())) {
    await sql`update otp_codes set attempts = attempts + 1 where phone = ${phone}`;
    return null;
  }
  await sql`delete from otp_codes where phone = ${phone}`;
  const [v] = await sql<{ id: string; name: string }[]>`select id, name from volunteers where phone = ${phone}`;
  return v ?? null;
}
