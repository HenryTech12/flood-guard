// Phone simulator thread: messages from and to one phone number (demo mode only — the
// simulator only ever shows fake seeded numbers).
import { error, handle, json } from "@/lib/api";
import { normalizePhone } from "@/lib/core/phone";
import { getSql } from "@/lib/db/client";
import { env } from "@/lib/env";

export const dynamic = "force-dynamic";

export const GET = handle(async (req: Request) => {
  if (!env.demoMode) return error(403, "Demo mode only");
  const phone = normalizePhone(new URL(req.url).searchParams.get("phone") ?? "");
  if (!phone) return error(400, "phone required");
  const sql = getSql();
  const [inbound, outbound] = await Promise.all([
    sql<{ id: number; body: string; received_at: Date }[]>`select id, body, received_at from inbound_messages where from_phone = ${phone} and channel = 'sms' order by received_at desc limit 50`,
    sql<{ id: number; channel: string; body: string; audio_url: string | null; status: string; purpose: string; created_at: Date }[]>`
      select id, channel, body, audio_url, status, purpose, created_at from outbound_messages where to_phone = ${phone} order by created_at desc limit 50`,
  ]);
  const [res] = await sql<{ name: string | null; preferred_language: string; zone: string | null }[]>`
    select r.name, r.preferred_language, z.short_name zone from residents r left join zones z on z.id = r.zone_id where r.phone = ${phone}`;
  const thread = [
    ...inbound.map((m) => ({ id: `in-${m.id}`, dir: "out" as const, channel: "sms", body: m.body, at: m.received_at })),
    ...outbound.map((m) => ({ id: `out-${m.id}`, dir: "in" as const, channel: m.channel, body: m.body, audioUrl: m.audio_url, status: m.status, purpose: m.purpose, at: m.created_at })),
  ].sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime());
  return json({ phone, resident: res ?? null, thread });
});
