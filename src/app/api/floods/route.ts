// GET  /api/floods  — recent flood events (public)
// POST /api/floods  — operators record events (single object or array, e.g. uploaded JSON);
//                     nearby subscribers are alerted.
import { z } from "zod";
import { handle, json, requireOperator } from "@/lib/api";
import { actorOf } from "@/lib/auth/session";
import { getSql } from "@/lib/db/client";
import { createFloodEvent, listFloodEvents } from "@/lib/services/citizen";

export const dynamic = "force-dynamic";

export const GET = handle(async () => {
  const rows = await listFloodEvents(getSql(), 50);
  return json({ data: rows.map((r) => ({ ...r, timestamp: r.timestamp.toISOString() })) }, { headers: { "Cache-Control": "no-store" } });
});

const Event = z.object({
  location: z.string().trim().min(1).max(120),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  severity: z.enum(["low", "medium", "high"]),
  rainfall: z.number().min(0).max(2000).nullish(),
  description: z.string().max(500).nullish(),
  timestamp: z.string().datetime({ offset: true }).nullish(),
});

export const POST = handle(async (req: Request) => {
  const s = await requireOperator();
  const body = await req.json();
  const events = z.array(Event).min(1).max(50).parse(Array.isArray(body) ? body : [body]);
  const sql = getSql();
  let notificationsSent = 0;
  let totalSubscribers = 0;
  const created = [];
  for (const e of events) {
    const r = await createFloodEvent(sql, { ...e, source: Array.isArray(body) ? "upload" : "manual" }, { actor: actorOf(s) });
    notificationsSent += r.notified;
    totalSubscribers = Math.max(totalSubscribers, r.subscribers);
    created.push(r.id);
  }
  return json({ ok: true, created, notificationsSent, totalSubscribers });
});
