import { z } from "zod";
import { error, handle, json, requireDemo } from "@/lib/api";
import { getSql } from "@/lib/db/client";
import { getRegion } from "../../../../../config/regions";
import { RISK_LEVELS } from "@/lib/core/types";
import { clearOverrides, injectHelpRequests, raiseZone, resetDemo, sendAlertsFor, setDemoFlags, startReplay, stopReplay } from "@/lib/services/demo";
import { runTick } from "@/lib/services/tick";

export const dynamic = "force-dynamic";

const Body = z
  .object({
    zoneId: z.string().optional(),
    level: z.enum(RISK_LEVELS).optional(),
    count: z.number().int().min(1).max(50).optional(),
    force: z.boolean().optional(),
    speed: z.number().min(0.1).max(48).optional(),
    autopilot: z.boolean().optional(),
    moveVolunteers: z.boolean().optional(),
    autoAlerts: z.boolean().optional(),
  })
  .partial();

export const POST = handle(async (req: Request, ctx: { params: Promise<{ action: string }> }) => {
  await requireDemo();
  const { action } = await ctx.params;
  const b = Body.parse(await req.json().catch(() => ({})));
  const sql = getSql();
  switch (action) {
    case "start-replay":
      await startReplay(sql, b.speed);
      return json({ ok: true });
    case "stop-replay":
      await stopReplay(sql);
      return json({ ok: true });
    case "raise-zone":
      return json(await raiseZone(sql, b.zoneId ?? getRegion().demoZones[0], b.level ?? "high"));
    case "clear-overrides":
      await clearOverrides(sql);
      return json({ ok: true });
    case "send-alerts":
      return json({ summaries: await sendAlertsFor(sql, b.zoneId ?? "all", !!b.force) });
    case "inject":
      return json({ refs: await injectHelpRequests(sql, b.count ?? 10) });
    case "flags":
      await setDemoFlags(sql, b);
      return json({ ok: true });
    case "tick":
      return json(await runTick(sql, { force: true }));
    case "reset":
      await resetDemo(sql);
      return json({ ok: true });
    default:
      return error(404, `Unknown demo action ${action}`);
  }
});
