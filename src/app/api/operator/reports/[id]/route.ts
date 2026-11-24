import { z } from "zod";
import { error, handle, json, requireOperator } from "@/lib/api";
import { actorOf } from "@/lib/auth/session";
import { getSql } from "@/lib/db/client";
import { reviewCrowdReport } from "@/lib/services/reports";

export const dynamic = "force-dynamic";

export const POST = handle(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const s = await requireOperator();
  const { id } = await ctx.params;
  const { status } = z.object({ status: z.enum(["consistent", "suspicious", "unverified"]) }).parse(await req.json());
  if (!(await reviewCrowdReport(getSql(), id, status, actorOf(s)))) return error(404, "not found");
  return json({ ok: true });
});
