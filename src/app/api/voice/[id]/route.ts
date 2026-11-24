// Voice message attached to a help request: operators, or the volunteer assigned to it.
import { getOperatorSession, getVolunteerSession } from "@/lib/auth/session";
import { getSql } from "@/lib/db/client";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const sql = getSql();
  const op = await getOperatorSession();
  if (!op) {
    const v = await getVolunteerSession();
    const [job] = v ? await sql`select 1 from rescue_jobs where help_request_id = ${id} and volunteer_id = ${v.volunteerId!} and status in ('offered', 'accepted')` : [];
    if (!job) return new Response("Unauthorized", { status: 401 });
  }
  const [rec] = await sql<{ mime: string; data: Buffer }[]>`select mime, data from voice_recordings where help_request_id = ${id}`;
  if (!rec) return new Response("Not found", { status: 404 });
  return new Response(new Uint8Array(rec.data), { headers: { "Content-Type": rec.mime, "Cache-Control": "private, max-age=3600", "Content-Length": String(rec.data.length) } });
}
