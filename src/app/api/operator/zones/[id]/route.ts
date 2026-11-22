import { z } from "zod";
import { handle, json, requireOperator } from "@/lib/api";
import { actorOf } from "@/lib/auth/session";
import { getSql } from "@/lib/db/client";
import { isLang, RISK_LEVELS } from "@/lib/core/types";
import { buildRadioScript, sendZoneAlerts } from "@/lib/services/alerts";
import { recomputeAllZones, setZoneOverride } from "@/lib/services/risk";

export const dynamic = "force-dynamic";

// GET → radio script for the zone (?lang=en|pcm)
export const GET = handle(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  await requireOperator();
  const { id } = await ctx.params;
  const lang = new URL(req.url).searchParams.get("lang");
  const script = await buildRadioScript(getSql(), id, isLang(lang) ? lang : "en");
  return json({ script });
});

const Body = z.object({
  action: z.enum(["alert", "override", "clear_override"]),
  level: z.enum(RISK_LEVELS).optional(),
  force: z.boolean().optional(),
});

export const POST = handle(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const s = await requireOperator();
  const { id } = await ctx.params;
  const b = Body.parse(await req.json());
  const sql = getSql();
  if (b.action === "alert") return json(await sendZoneAlerts(sql, id, { force: !!b.force, actor: actorOf(s) }));
  await setZoneOverride(sql, id, b.action === "override" ? (b.level ?? "high") : null, actorOf(s));
  const [st] = await sql<{ sim_time: Date | null; auto_alerts: boolean }[]>`select sim_time, auto_alerts from demo_state where id = 1`;
  const changes = await recomputeAllZones(sql, { simTime: st.sim_time, autoAlerts: st.auto_alerts, actor: actorOf(s) });
  return json({ ok: true, changes });
});
