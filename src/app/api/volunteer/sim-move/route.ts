// Demo only: let the tick drive this volunteer towards their job (for a presenter on stage).
import { z } from "zod";
import { error, handle, json, requireVolunteer } from "@/lib/api";
import { getSql } from "@/lib/db/client";
import { env } from "@/lib/env";

export const dynamic = "force-dynamic";

export const POST = handle(async (req: Request) => {
  if (!env.demoMode) return error(403, "Demo mode only");
  const s = await requireVolunteer();
  const { on } = z.object({ on: z.boolean() }).parse(await req.json());
  await getSql()`update volunteers set sim_move = ${on} where id = ${s.volunteerId}`;
  return json({ ok: true });
});
