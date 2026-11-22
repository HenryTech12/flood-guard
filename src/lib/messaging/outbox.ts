// Outbound message queue with retries + exponential backoff. Every SMS/voice call goes
// through here so nothing is lost when the provider hiccups and every message is visible
// in the demo log.
import type { Db, Sql } from "../db/client";
import { getEmailProvider } from "./email";
import { getProvider } from "./provider";

export interface OutboundMessage {
  channel: "sms" | "voice" | "email";
  /** Phone number (sms/voice) or email address (email). */
  to: string;
  /** SMS text, voice transcript, or the plain-text email body. */
  body: string;
  subject?: string | null;
  html?: string | null;
  audioUrl?: string | null;
  language?: string | null;
  purpose: string;
  refType?: string | null;
  refId?: string | null;
}

export const MAX_ATTEMPTS = 5;

export async function enqueue(db: Db, msgs: OutboundMessage[]): Promise<number[]> {
  if (!msgs.length) return [];
  const rows = msgs.map((m) => ({
    channel: m.channel,
    to_phone: m.channel === "email" ? null : m.to,
    to_email: m.channel === "email" ? m.to : null,
    subject: m.subject ?? null,
    html_body: m.html ?? null,
    body: m.body,
    audio_url: m.audioUrl ?? null,
    language: m.language ?? null,
    purpose: m.purpose,
    ref_type: m.refType ?? null,
    ref_id: m.refId ?? null,
  }));
  const res = await db<{ id: number }[]>`
    insert into outbound_messages (channel, to_phone, to_email, subject, html_body, body, audio_url, language, purpose, ref_type, ref_id)
    select x.channel, x.to_phone, x.to_email, x.subject, x.html_body, x.body, x.audio_url, x.language, x.purpose, x.ref_type, x.ref_id
    from jsonb_to_recordset(${JSON.stringify(rows)}::text::jsonb)
      as x(channel text, to_phone text, to_email text, subject text, html_body text, body text, audio_url text, language text, purpose text, ref_type text, ref_id text)
    returning id`;
  return res.map((r) => Number(r.id));
}

type Claimed = { id: number; channel: "sms" | "voice" | "email"; to_phone: string | null; to_email: string | null; subject: string | null; html_body: string | null; purpose: string; body: string; attempts: number };

/** Claim and send due messages. Safe to call concurrently (SKIP LOCKED). */
export async function processOutbox(sql: Sql, { limit = 100, ids }: { limit?: number; ids?: number[] } = {}): Promise<{ sent: number; failed: number; retrying: number }> {
  // Recover messages stuck in 'sending' (crashed worker).
  await sql`update outbound_messages set status = 'queued' where status = 'sending' and next_attempt_at < now() - interval '2 minutes'`;

  const idFilter = ids?.length ? sql`and id = any(${ids}::bigint[])` : sql``;
  const claimed = await sql<Claimed[]>`
    update outbound_messages set status = 'sending', attempts = attempts + 1, next_attempt_at = now()
    where id in (
      select id from outbound_messages
      where status = 'queued' and next_attempt_at <= now() ${idFilter}
      order by id limit ${limit} for update skip locked)
    returning id, channel, to_phone, to_email, subject, html_body, purpose, body, attempts`;
  if (!claimed.length) return { sent: 0, failed: 0, retrying: 0 };

  const provider = getProvider();
  const emailProvider = getEmailProvider();
  let sent = 0,
    failed = 0,
    retrying = 0;
  const CONCURRENCY = 10;
  for (let i = 0; i < claimed.length; i += CONCURRENCY) {
    await Promise.all(
      claimed.slice(i, i + CONCURRENCY).map(async (m) => {
        const via = m.channel === "email" ? emailProvider.name : provider.name;
        const r =
          m.channel === "email"
            ? await emailProvider.send({ to: m.to_email!, subject: m.subject ?? "FloodGuard", text: m.body, html: m.html_body, tags: ["floodguard", m.purpose] })
            : m.channel === "voice"
              ? await provider.startVoiceCall(m.to_phone!)
              : await provider.sendSms(m.to_phone!, m.body);
        if (r.ok) {
          sent++;
          await sql`update outbound_messages set status = 'sent', provider = ${via}, provider_message_id = ${r.providerMessageId ?? null}, sent_at = now(), last_error = null where id = ${m.id}`;
        } else if (r.retryable === false || m.attempts >= MAX_ATTEMPTS) {
          failed++;
          await sql`update outbound_messages set status = 'failed', provider = ${via}, last_error = ${r.error ?? "unknown"} where id = ${m.id}`;
        } else {
          retrying++;
          const backoffSec = Math.min(600, 5 * 2 ** (m.attempts - 1)); // 5s, 10s, 20s, 40s …
          await sql`update outbound_messages set status = 'queued', provider = ${via}, last_error = ${r.error ?? "unknown"},
                    next_attempt_at = now() + make_interval(secs => ${backoffSec}) where id = ${m.id}`;
        }
      }),
    );
  }
  return { sent, failed, retrying };
}

/** Enqueue then immediately try to send just those messages (used for replies). */
export async function sendNow(sql: Sql, msgs: OutboundMessage[]) {
  const ids = await enqueue(sql, msgs);
  if (ids.length) await processOutbox(sql, { ids, limit: ids.length });
  return ids;
}
