import { z } from "zod";
import { error, handle, json, requireOperator } from "@/lib/api";
import { actorOf } from "@/lib/auth/session";
import { getSql } from "@/lib/db/client";
import { setReportStatus } from "@/lib/services/citizen";

export const dynamic = "force-dynamic";

export const PATCH = handle(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const s = await requireOperator();
  const { id } = await ctx.params;
  const { status } = z.object({ status: z.enum(["responded", "resolved"]) }).parse(await req.json());
  if (!(await setReportStatus(getSql(), id, status, actorOf(s)))) return error(404, "Report not found");
  return json({ ok: true });
});
