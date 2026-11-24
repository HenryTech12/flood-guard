import { z } from "zod";
import { handle, json, requireVolunteer } from "@/lib/api";
import { getSql } from "@/lib/db/client";
import { acceptOffer, completeJob, declineOffer, markArrived } from "@/lib/services/dispatch";

export const dynamic = "force-dynamic";
const Body = z.object({ action: z.enum(["accept", "decline", "arrived", "rescued", "could_not_reach"]), shelterId: z.string().nullish() });

export const POST = handle(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const s = await requireVolunteer();
  const { id } = await ctx.params;
  const { action, shelterId } = Body.parse(await req.json());
  const sql = getSql();
  if (action === "accept") await acceptOffer(sql, s.volunteerId, id);
  else if (action === "decline") await declineOffer(sql, s.volunteerId, id);
  else if (action === "arrived") await markArrived(sql, s.volunteerId, id);
  else await completeJob(sql, s.volunteerId, id, action, { shelterId: shelterId ?? null });
  return json({ ok: true });
});
