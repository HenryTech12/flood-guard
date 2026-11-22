// Outbound message log (the mock provider's "sent items").
import { handle, json, requireOperator } from "@/lib/api";
import { maskPhone } from "@/lib/core/phone";
import { maskEmail } from "@/lib/messaging/email";
import { getSql } from "@/lib/db/client";
import { env } from "@/lib/env";

export const dynamic = "force-dynamic";

export const GET = handle(async (req: Request) => {
  await requireOperator();
  const u = new URL(req.url);
  const limit = Math.min(500, Number(u.searchParams.get("limit") ?? 80));
  const purpose = u.searchParams.get("purpose");
  const sql = getSql();
  const rows = await sql<{ id: number; channel: string; to_phone: string | null; to_email: string | null; subject: string | null; body: string; audio_url: string | null; language: string | null; purpose: string; status: string; attempts: number; provider: string | null; last_error: string | null; created_at: Date }[]>`
    select id, channel, to_phone, to_email, subject, body, audio_url, language, purpose, status, attempts, provider, last_error, created_at from outbound_messages
    ${purpose ? sql`where purpose = ${purpose}` : sql``}
    order by id desc limit ${limit}`;
  const [counts] = await sql<{ total: number; queued: number; failed: number }[]>`
    select count(*)::int total, count(*) filter (where status = 'queued')::int queued, count(*) filter (where status = 'failed')::int failed from outbound_messages`;
  // In demo mode all numbers are fake, so showing them helps judges follow along.
  return json({ provider: env.messagingProvider, counts, messages: rows.map((r) => ({
      ...r,
      to: r.channel === "email" ? (env.demoMode ? r.to_email : maskEmail(r.to_email ?? "")) : env.demoMode ? r.to_phone : maskPhone(r.to_phone ?? ""),
      to_phone: undefined,
      to_email: undefined,
    })),
    emailProvider: env.emailProvider,
  });
});
