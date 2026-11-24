import { z } from "zod";
import { handle, json, requireVolunteer } from "@/lib/api";
import { getSql, pt } from "@/lib/db/client";
import { publishChange } from "@/lib/realtime/server";
import { audit } from "@/lib/services/audit";
import { runDispatch } from "@/lib/services/dispatch";

export const dynamic = "force-dynamic";
const Body = z.object({ available: z.boolean(), lngLat: z.tuple([z.number(), z.number()]).optional() });

export const POST = handle(async (req: Request) => {
  const s = await requireVolunteer();
  const { available, lngLat } = Body.parse(await req.json());
  const sql = getSql();
  // Location is shared once when going on duty (so dispatch can find you), not tracked.
  if (lngLat) await sql`update volunteers set current_location = ${pt(sql, lngLat)} where id = ${s.volunteerId}`;
  await sql`update volunteers set is_available = ${available}, last_seen_at = now() where id = ${s.volunteerId}`;
  if (!available) await sql`update rescue_jobs set status = 'declined' where volunteer_id = ${s.volunteerId} and status = 'offered'`;
  await audit(sql, `volunteer:${s.volunteerId}`, "volunteer", s.volunteerId, available ? "on_duty" : "off_duty");
  await runDispatch(sql);
  await publishChange("volunteers");
  return json({ ok: true });
});
