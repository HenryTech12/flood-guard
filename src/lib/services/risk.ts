// Applies the risk engine (core/risk.ts) to every zone using rainfall at the current
// (possibly simulated) time, credible crowd reports and the current satellite extent.
import type { Sql } from "../db/client";
import { computeRisk } from "../core/risk";
import { type RiskLevel, levelIndex } from "../core/types";
import { publishChange } from "../realtime/server";
import { sendZoneAlerts } from "./alerts";
import { audit } from "./audit";
import { notifyOpsZoneEscalation } from "./notify";

/** A satellite extent counts as "current" for this many days after it was observed. */
export const EXTENT_VALID_DAYS = 14;

export interface ZoneRiskChange {
  zoneId: string;
  from: RiskLevel;
  to: RiskLevel;
  reasons: string[];
}

export async function recomputeAllZones(sql: Sql, { simTime, autoAlerts = false, actor = "system" }: { simTime: Date | null; autoAlerts?: boolean; actor?: string }): Promise<ZoneRiskChange[]> {
  const at = simTime ?? new Date();
  const zones = await sql<{
    id: string;
    base_risk_score: number;
    historically_flooded: boolean;
    current_risk_level: RiskLevel;
    current_risk_score: number;
    override_level: RiskLevel | null;
    flood_overlap: number;
    rain24: number;
    rain72: number;
    reports: number;
    extent_label: string | null;
  }[]>`
    select z.id, z.base_risk_score, z.historically_flooded, z.current_risk_level, z.current_risk_score, z.override_level, z.flood_overlap,
      coalesce((select sum(mm) from rainfall_readings r where r.zone_id = z.id and r.ts > ${at}::timestamptz - interval '24 hours' and r.ts <= ${at}::timestamptz), 0)::float8 rain24,
      coalesce((select sum(mm) from rainfall_readings r where r.zone_id = z.id and r.ts > ${at}::timestamptz - interval '72 hours' and r.ts <= ${at}::timestamptz), 0)::float8 rain72,
      (select count(*) from crowd_reports c where c.zone_id = z.id and c.type = 'water_level' and c.verification_status <> 'suspicious'
         and c.created_at > now() - interval '24 hours')::int reports,
      (select 'Sentinel-1, ' || to_char(f.observed_at, 'DD Mon YYYY') from flood_extents f
         where f.active and ST_Intersects(f.geom, z.geom)
           and ${at}::timestamptz between f.observed_at and f.observed_at + make_interval(days => ${EXTENT_VALID_DAYS})
         order by f.observed_at desc limit 1) extent_label
    from zones z`;

  const changes: ZoneRiskChange[] = [];
  for (const z of zones) {
    const r = computeRisk({
      baseRisk: z.base_risk_score,
      rain24h: z.rain24,
      rain72h: z.rain72,
      reportCount: z.reports,
      satelliteOverlap: z.extent_label ? z.flood_overlap : null,
      satelliteLabel: z.extent_label ?? undefined,
      historicallyFlooded: z.historically_flooded,
      previousLevel: z.current_risk_level,
      overrideLevel: z.override_level,
    });
    const changedLevel = r.level !== z.current_risk_level;
    await sql`update zones set current_risk_level = ${r.level}, current_risk_score = ${r.score}, risk_reasons = ${JSON.stringify(r.reasons)}::text::jsonb,
              rain_24h_mm = ${z.rain24}, rain_72h_mm = ${z.rain72}, updated_at = now() where id = ${z.id}`;
    if (changedLevel) {
      await sql`insert into zone_risk_snapshots (zone_id, level, score, reasons, rain_24h_mm, sim_time) values (${z.id}, ${r.level}, ${r.score}, ${JSON.stringify(r.reasons)}::text::jsonb, ${z.rain24}, ${simTime})`;
      await audit(sql, actor, "zone", z.id, "risk_level", z.current_risk_level, r.level, { score: r.score, reasons: r.reasons });
      changes.push({ zoneId: z.id, from: z.current_risk_level, to: r.level, reasons: r.reasons });
    }
  }

  if (changes.length) {
    // Zone level feeds urgency; keep the queue ranking current.
    const { recomputeUrgency } = await import("./helpRequests");
    await recomputeUrgency(sql);
    await publishChange("zones");
    // Rising zones also appear as flood events in the citizen portal (no extra messages —
    // zone alerts below already notify residents).
    for (const c of changes) {
      if (levelIndex(c.to) > levelIndex(c.from) && levelIndex(c.to) >= levelIndex("medium")) {
        const [z] = await sql<{ name: string; lng: number; lat: number; rain: number }[]>`
          select name, ST_X(centroid) lng, ST_Y(centroid) lat, rain_24h_mm rain from zones where id = ${c.zoneId}`;
        if (z) {
          const { createFloodEvent } = await import("./citizen");
          await createFloodEvent(
            sql,
            { location: z.name, latitude: z.lat, longitude: z.lng, severity: c.to === "medium" ? "medium" : "high", rainfall: z.rain || null, description: c.reasons.join(" · "), source: "zone", zoneId: c.zoneId, timestamp: simTime ?? new Date() },
            { notify: false, actor },
          );
        }
      }
    }
    for (const c of changes) {
      if (levelIndex(c.to) > levelIndex(c.from) && levelIndex(c.to) >= levelIndex("high")) {
        const [z] = await sql<{ name: string; residents: number; vulnerable: number }[]>`
          select z.name, (select count(*) from residents r where r.zone_id = z.id)::int residents,
                 (select count(distinct r.id) from residents r join vulnerable_members v on v.resident_id = r.id where r.zone_id = z.id)::int vulnerable
          from zones z where z.id = ${c.zoneId}`;
        if (z) await notifyOpsZoneEscalation(sql, { zoneId: c.zoneId, zoneName: z.name, from: c.from, to: c.to, reasons: c.reasons, residents: z.residents, vulnerable: z.vulnerable });
      }
    }
    if (autoAlerts) {
      for (const c of changes) {
        if (levelIndex(c.to) > levelIndex(c.from) && levelIndex(c.to) >= levelIndex("medium")) await sendZoneAlerts(sql, c.zoneId, { actor: "risk-engine" });
      }
    }
  }
  return changes;
}

export async function setZoneOverride(sql: Sql, zoneId: string, level: RiskLevel | null, actor: string) {
  await sql`update zones set override_level = ${level} where id = ${zoneId}`;
  await audit(sql, actor, "zone", zoneId, "override", null, level ?? "cleared");
}
