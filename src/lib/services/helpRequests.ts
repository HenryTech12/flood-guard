// Help request intake: create, merge duplicates (same phone within 30 min), locate,
// score urgency, then hand over to dispatch.
import type { Sql } from "../db/client";
import { pt } from "../db/client";
import { getRegion } from "../../../config/regions";
import { findMergeTarget } from "../core/policy";
import { computeUrgency } from "../core/urgency";
import type { LocationSource, LngLat, RiskLevel, VulnerableType } from "../core/types";
import { publishChange } from "../realtime/server";
import { audit } from "./audit";
import { runDispatch } from "./dispatch";
import { getResidentByPhone, insideFlood, zoneForPoint, type ResidentRef } from "./reference";

export interface HelpLocation {
  lngLat: LngLat;
  source: LocationSource;
  landmarkId?: string | null;
  zoneId?: string | null;
}

export interface HelpInput {
  phone: string;
  channel: "sms" | "ussd" | "web" | "demo";
  message: string | null;
  peopleCount: number | null;
  location?: HelpLocation | null;
  extraVulnerable?: { type: VulnerableType; count: number }[];
  actor?: string;
  /** Skip dispatch (bulk demo injection dispatches once at the end). */
  skipDispatch?: boolean;
  createdAt?: Date;
}

export interface HelpResult {
  id: string;
  ref: string;
  merged: boolean;
  located: boolean;
  peopleCount: number;
  resident: ResidentRef | null;
}

const SOURCE_RANK: Record<LocationSource, number> = { gps: 4, ussd_landmark: 3, registered: 2, zone_centroid: 1, unknown: 0 };

function mergeVulnerable(a: { type: VulnerableType; count: number }[], b: { type: VulnerableType; count: number }[]) {
  const m = new Map<VulnerableType, number>();
  for (const v of [...a, ...b]) m.set(v.type, Math.max(m.get(v.type) ?? 0, v.count || 1));
  return [...m].map(([type, count]) => ({ type, count }));
}

async function resolveLocation(sql: Sql, resident: ResidentRef | null, given?: HelpLocation | null): Promise<HelpLocation> {
  if (given) return given;
  if (resident?.home) return { lngLat: resident.home, source: "registered", zoneId: resident.zoneId };
  if (resident?.zoneId) {
    const [z] = await sql<{ lng: number; lat: number }[]>`select ST_X(centroid) lng, ST_Y(centroid) lat from zones where id = ${resident.zoneId}`;
    if (z) return { lngLat: [z.lng, z.lat], source: "zone_centroid", zoneId: resident.zoneId };
  }
  return { lngLat: getRegion().center, source: "unknown", zoneId: null };
}

export async function createOrMergeHelpRequest(sql: Sql, input: HelpInput): Promise<HelpResult> {
  const now = input.createdAt ?? new Date();
  const actor = input.actor ?? `resident:${input.phone}`;
  const resident = await getResidentByPhone(sql, input.phone);
  const loc = await resolveLocation(sql, resident, input.location);
  const zoneId = loc.zoneId ?? (loc.source === "unknown" ? null : await zoneForPoint(sql, loc.lngLat));
  const inside = loc.source === "unknown" ? false : await insideFlood(sql, loc.lngLat);
  const vulnerable = mergeVulnerable(resident?.vulnerable ?? [], input.extraVulnerable ?? []);

  const result = await sql.begin(async (tx) => {
    await tx`select pg_advisory_xact_lock(hashtext(${input.phone}))`;
    const recent = await tx<{ id: string; phone: string; status: string; created_at: Date }[]>`
      select id, phone, status, created_at from help_requests where phone = ${input.phone} and created_at > ${now}::timestamptz - interval '30 minutes'`;
    const target = findMergeTarget(recent.map((r) => ({ id: r.id, phone: r.phone, status: r.status, createdAt: r.created_at })), input.phone, now);

    if (target) {
      const [ex] = await tx<{ id: string; ref_code: string; people_count: number; message: string | null; vulnerable: { type: VulnerableType; count: number }[]; location_source: LocationSource }[]>`
        select id, ref_code, people_count, message, vulnerable, location_source from help_requests where id = ${target.id} for update`;
      const people = Math.max(ex.people_count, input.peopleCount ?? 0);
      const message = [ex.message, input.message].filter((m) => m && m.trim()).join(" | ") || null;
      const vuln = mergeVulnerable(ex.vulnerable ?? [], vulnerable);
      const better = input.location && SOURCE_RANK[loc.source] > SOURCE_RANK[ex.location_source];
      if (better) {
        await tx`update help_requests set location = ${pt(tx, loc.lngLat)}, location_source = ${loc.source}, landmark_id = ${loc.landmarkId ?? null},
                 zone_id = ${zoneId}, inside_flood = ${inside} where id = ${ex.id}`;
      }
      await tx`update help_requests set people_count = ${people}, message = ${message}, vulnerable = ${JSON.stringify(vuln)}::text::jsonb,
               vulnerable_flag = ${vuln.length > 0}, merged_count = merged_count + 1, updated_at = now() where id = ${ex.id}`;
      await audit(tx, actor, "help_request", ex.id, "merged", null, null, { channel: input.channel, message: input.message, people_count: input.peopleCount });
      return { id: ex.id, ref: ex.ref_code, merged: true, located: (better ? loc.source : ex.location_source) !== "unknown", peopleCount: people };
    }

    const [zone] = zoneId ? await tx<{ current_risk_level: RiskLevel }[]>`select current_risk_level from zones where id = ${zoneId}` : [];
    const people = input.peopleCount ?? 1;
    const urgency = computeUrgency({ zoneLevel: zone?.current_risk_level ?? null, vulnerable, peopleCount: people, message: input.message, createdAt: now, now });
    const [row] = await tx<{ id: string; ref_code: string }[]>`
      insert into help_requests (resident_id, phone, location, location_source, landmark_id, zone_id, people_count, vulnerable_flag, vulnerable,
                                 message, channel, urgency_score, urgency_reasons, inside_flood, created_at, updated_at)
      values (${resident?.id ?? null}, ${input.phone}, ${pt(tx, loc.lngLat)}, ${loc.source}, ${loc.landmarkId ?? null}, ${zoneId}, ${people},
              ${vulnerable.length > 0}, ${JSON.stringify(vulnerable)}::text::jsonb, ${input.message}, ${input.channel}, ${urgency.score},
              ${JSON.stringify(urgency.reasons)}::text::jsonb, ${inside}, ${now}, ${now})
      returning id, ref_code`;
    await audit(tx, actor, "help_request", row.id, "status", null, "new", { channel: input.channel, location_source: loc.source, urgency: urgency.score });
    return { id: row.id, ref: row.ref_code, merged: false, located: loc.source !== "unknown", peopleCount: people };
  });

  if (result.merged) await recomputeUrgency(sql, [result.id]);
  await publishChange("requests");
  if (!input.skipDispatch) await runDispatch(sql);
  return { ...result, resident };
}

/** Attach a better location to an existing request (e.g. SMS follow-up naming a landmark). */
export async function updateRequestLocation(sql: Sql, requestId: string, loc: HelpLocation, actor: string) {
  const zoneId = loc.zoneId ?? (await zoneForPoint(sql, loc.lngLat));
  const inside = await insideFlood(sql, loc.lngLat);
  await sql`update help_requests set location = ${pt(sql, loc.lngLat)}, location_source = ${loc.source}, landmark_id = ${loc.landmarkId ?? null},
            zone_id = ${zoneId}, inside_flood = ${inside}, updated_at = now() where id = ${requestId}`;
  await audit(sql, actor, "help_request", requestId, "located", null, loc.source, { landmark: loc.landmarkId ?? null });
  await recomputeUrgency(sql, [requestId]);
  await publishChange("requests");
}

/** Recompute urgency for open requests (all, or the given ids). Returns how many changed. */
export async function recomputeUrgency(sql: Sql, ids?: string[], now = new Date()): Promise<number> {
  const filter = ids?.length ? sql`and h.id = any(${ids}::uuid[])` : sql``;
  const rows = await sql<{ id: string; urgency_score: number; vulnerable: { type: VulnerableType; count: number }[]; people_count: number; message: string | null; created_at: Date; failed_attempts: number; level: RiskLevel | null }[]>`
    select h.id, h.urgency_score, h.vulnerable, h.people_count, h.message, h.created_at, h.failed_attempts, z.current_risk_level level
    from help_requests h left join zones z on z.id = h.zone_id
    where h.status in ('new', 'assigned', 'en_route') ${filter}`;
  let changed = 0;
  for (const r of rows) {
    const u = computeUrgency({ zoneLevel: r.level, vulnerable: r.vulnerable ?? [], peopleCount: r.people_count, message: r.message, createdAt: r.created_at, now, failedAttempts: r.failed_attempts });
    if (u.score !== r.urgency_score || ids?.length) {
      await sql`update help_requests set urgency_score = ${u.score}, urgency_reasons = ${JSON.stringify(u.reasons)}::text::jsonb where id = ${r.id}`;
      if (u.score !== r.urgency_score) changed++;
    }
  }
  return changed;
}
