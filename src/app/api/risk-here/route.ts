// FloodGuard zone risk for a point (public): which covered area it is in and why.
import { error, handle, json } from "@/lib/api";
import { getSql } from "@/lib/db/client";
import { zoneForPoint } from "@/lib/services/reference";

export const dynamic = "force-dynamic";

export const GET = handle(async (req: Request) => {
  const u = new URL(req.url);
  const lat = Number(u.searchParams.get("lat"));
  const lon = Number(u.searchParams.get("lon"));
  if (!isFinite(lat) || !isFinite(lon)) return error(400, "lat/lon required");
  const sql = getSql();
  const zoneId = await zoneForPoint(sql, [lon, lat]);
  if (!zoneId) return json({ zone: null });
  const [z] = await sql<{ id: string; name: string; current_risk_level: string; current_risk_score: number; risk_reasons: string[]; rain_24h_mm: number }[]>`
    select id, name, current_risk_level, current_risk_score, risk_reasons, rain_24h_mm from zones where id = ${zoneId}`;
  return json({ zone: z ? { id: z.id, name: z.name, level: z.current_risk_level, score: z.current_risk_score, reasons: z.risk_reasons, rain24h: z.rain_24h_mm } : null });
});
