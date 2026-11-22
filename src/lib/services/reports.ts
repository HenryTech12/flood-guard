// Crowd reports: residents tell us where water is. Labelled, never auto-deleted.
import type { Sql } from "../db/client";
import { pt } from "../db/client";
import { verifyReport } from "../core/crowd";
import type { LngLat, ReportType, RiskLevel } from "../core/types";
import { publishChange } from "../realtime/server";
import { audit } from "./audit";
import { insideFlood, zoneForPoint } from "./reference";

export interface ReportInput {
  phone: string | null;
  location: LngLat;
  locationSource: string;
  zoneId?: string | null;
  landmarkId?: string | null;
  type: ReportType;
  depthCm?: number | null;
  description?: string | null;
  photoUrl?: string | null;
  channel: "sms" | "ussd" | "web" | "demo";
  createdAt?: Date;
}

export async function createCrowdReport(sql: Sql, input: ReportInput) {
  const zoneId = input.zoneId ?? (await zoneForPoint(sql, input.location));
  const [zone] = zoneId ? await sql<{ current_risk_level: RiskLevel; base_risk_score: number }[]>`select current_risk_level, base_risk_score from zones where id = ${zoneId}` : [];
  const inside = await insideFlood(sql, input.location);
  const [{ n }] = await sql<{ n: number }[]>`
    select count(*)::int n from crowd_reports
    where created_at > now() - interval '6 hours' and verification_status <> 'suspicious'
      and ST_DWithin(location::geography, ${pt(sql, input.location)}::geography, 1000)`;
  const v = verifyReport({ zoneLevel: zone?.current_risk_level ?? null, zoneBaseRisk: zone?.base_risk_score ?? null, insideFloodExtent: inside, nearbyReports: n });
  const [resident] = input.phone ? await sql<{ id: string }[]>`select id from residents where phone = ${input.phone}` : [];
  const [row] = await sql<{ id: string }[]>`
    insert into crowd_reports (phone, resident_id, location, location_source, zone_id, landmark_id, type, water_depth_estimate, description, photo_url, channel,
                               verification_status, verification_reason, created_at)
    values (${input.phone}, ${resident?.id ?? null}, ${pt(sql, input.location)}, ${input.locationSource}, ${zoneId}, ${input.landmarkId ?? null}, ${input.type},
            ${input.depthCm ?? null}, ${input.description ?? null}, ${input.photoUrl ?? null}, ${input.channel}, ${v.status}, ${v.reason}, ${input.createdAt ?? new Date()})
    returning id`;
  await audit(sql, input.phone ? `resident:${input.phone}` : "web", "crowd_report", row.id, "created", null, v.status, { type: input.type, zone: zoneId });
  await publishChange("reports");
  return { id: row.id, verification: v.status, zoneId };
}

export async function reviewCrowdReport(sql: Sql, id: string, status: "consistent" | "suspicious" | "unverified", actor: string) {
  const [r] = await sql<{ verification_status: string }[]>`select verification_status from crowd_reports where id = ${id}`;
  if (!r) return false;
  await sql`update crowd_reports set verification_status = ${status}, verification_reason = ${"Reviewed by operator"}, reviewed_by = ${actor}, reviewed_at = now() where id = ${id}`;
  await audit(sql, actor, "crowd_report", id, "reviewed", r.verification_status, status);
  await publishChange("reports");
  return true;
}
