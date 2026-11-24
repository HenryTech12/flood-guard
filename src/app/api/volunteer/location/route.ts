import { z } from "zod";
import { error, handle, json, requireVolunteer } from "@/lib/api";
import { getSql } from "@/lib/db/client";
import { publishChange } from "@/lib/realtime/server";
import { updateVolunteerLocation } from "@/lib/services/dispatch";

export const dynamic = "force-dynamic";
const Body = z.object({ lngLat: z.tuple([z.number().min(-180).max(180), z.number().min(-90).max(90)]) });

export const POST = handle(async (req: Request) => {
  const s = await requireVolunteer();
  const { lngLat } = Body.parse(await req.json());
  const sql = getSql();
  // Privacy: live location is only accepted while on an active job.
  const [job] = await sql`select 1 from rescue_jobs where volunteer_id = ${s.volunteerId} and status = 'accepted'`;
  if (!job) return error(409, "Location is only shared during an active job");
  await updateVolunteerLocation(sql, s.volunteerId, lngLat);
  await publishChange("volunteers");
  return json({ ok: true });
});
