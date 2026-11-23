// Read helpers for reference data (zones, landmarks, shelters) and residents.
import type { Db } from "../db/client";
import { getRegion } from "../../../config/regions";
import { pt } from "../db/client";
import type { Lang, LngLat, RiskLevel, VulnerableType } from "../core/types";

export interface ZoneRef {
  id: string;
  name: string;
  shortName: string;
  centroid: LngLat;
  baseRisk: number;
  level: RiskLevel;
  landmarks: { id: string; name: string; location: LngLat }[];
}

export async function getZones(db: Db): Promise<ZoneRef[]> {
  const zones = await db<{ id: string; name: string; short_name: string; lng: number; lat: number; base_risk_score: number; current_risk_level: RiskLevel }[]>`
    select id, name, short_name, ST_X(centroid) lng, ST_Y(centroid) lat, base_risk_score, current_risk_level from zones order by id`;
  const lms = await db<{ id: string; zone_id: string; name: string; lng: number; lat: number }[]>`
    select id, zone_id, name, ST_X(geom) lng, ST_Y(geom) lat from landmarks order by zone_id, id`;
  // Keep region-config order for USSD lists.
  const pos = new Map(getRegion().zones.map((z, i) => [z.id, i]));
  const lmPos = new Map(getRegion().zones.flatMap((z) => z.landmarks.map((l, i) => [l.id, i] as const)));
  return zones
    .map((z) => ({
      id: z.id,
      name: z.name,
      shortName: z.short_name,
      centroid: [z.lng, z.lat] as LngLat,
      baseRisk: z.base_risk_score,
      level: z.current_risk_level,
      landmarks: lms
        .filter((l) => l.zone_id === z.id)
        .sort((a, b) => (lmPos.get(a.id) ?? 99) - (lmPos.get(b.id) ?? 99))
        .map((l) => ({ id: l.id, name: l.name, location: [l.lng, l.lat] as LngLat })),
    }))
    .sort((a, b) => (pos.get(a.id) ?? 0) - (pos.get(b.id) ?? 0));
}

export async function zoneForPoint(db: Db, p: LngLat): Promise<string | null> {
  const [r] = await db<{ id: string }[]>`select id from zones where ST_Contains(geom, ${pt(db, p)}) limit 1`;
  if (r) return r.id;
  // Outside every zone polygon: snap to the nearest zone within ~1.5 km.
  const [n] = await db<{ id: string }[]>`
    select id from zones where ST_DWithin(geom::geography, ${pt(db, p)}::geography, 1500)
    order by ST_Distance(geom::geography, ${pt(db, p)}::geography) limit 1`;
  return n?.id ?? null;
}

export async function insideFlood(db: Db, p: LngLat): Promise<boolean> {
  const [r] = await db<{ inside: boolean }[]>`select exists(select 1 from flood_extents where active and ST_Intersects(geom, ${pt(db, p)})) inside`;
  return !!r?.inside;
}

export interface ShelterRef {
  id: string;
  name: string;
  location: LngLat;
  capacity: number;
  occupancy: number;
  phone: string;
  distanceM?: number;
}

export async function getShelters(db: Db): Promise<ShelterRef[]> {
  const rows = await db<{ id: string; name: string; lng: number; lat: number; capacity: number; current_occupancy: number; contact_phone: string }[]>`
    select id, name, ST_X(geom) lng, ST_Y(geom) lat, capacity, current_occupancy, contact_phone from shelters where type = 'shelter' order by name`;
  return rows.map((s) => ({ id: s.id, name: s.name, location: [s.lng, s.lat], capacity: s.capacity, occupancy: s.current_occupancy, phone: s.contact_phone }));
}

export async function nearestShelters(db: Db, p: LngLat, { needSpace = 1, limit = 3 } = {}): Promise<ShelterRef[]> {
  const rows = await db<{ id: string; name: string; lng: number; lat: number; capacity: number; current_occupancy: number; contact_phone: string; d: number }[]>`
    select id, name, ST_X(geom) lng, ST_Y(geom) lat, capacity, current_occupancy, contact_phone,
           ST_Distance(geom::geography, ${pt(db, p)}::geography) d
    from shelters where type = 'shelter' and capacity - current_occupancy >= ${needSpace}
    order by d limit ${limit}`;
  return rows.map((s) => ({ id: s.id, name: s.name, location: [s.lng, s.lat], capacity: s.capacity, occupancy: s.current_occupancy, phone: s.contact_phone, distanceM: Math.round(s.d) }));
}

export interface ResidentRef {
  id: string;
  phone: string;
  name: string | null;
  lang: Lang;
  zoneId: string | null;
  home: LngLat | null;
  optOut: boolean;
  vulnerable: { type: VulnerableType; count: number }[];
  family: { phone: string; name: string | null; email: string | null }[];
}

export async function getResidentByPhone(db: Db, phone: string): Promise<ResidentRef | null> {
  const [r] = await db<{ id: string; phone: string; name: string | null; preferred_language: Lang; zone_id: string | null; lng: number | null; lat: number | null; alerts_opt_out: boolean }[]>`
    select id, phone, name, preferred_language, zone_id, ST_X(home) lng, ST_Y(home) lat, alerts_opt_out from residents where phone = ${phone}`;
  if (!r) return null;
  return hydrateResident(db, r);
}

export async function getResidentById(db: Db, id: string): Promise<ResidentRef | null> {
  const [r] = await db<{ id: string; phone: string; name: string | null; preferred_language: Lang; zone_id: string | null; lng: number | null; lat: number | null; alerts_opt_out: boolean }[]>`
    select id, phone, name, preferred_language, zone_id, ST_X(home) lng, ST_Y(home) lat, alerts_opt_out from residents where id = ${id}`;
  if (!r) return null;
  return hydrateResident(db, r);
}

async function hydrateResident(
  db: Db,
  r: { id: string; phone: string; name: string | null; preferred_language: Lang; zone_id: string | null; lng: number | null; lat: number | null; alerts_opt_out: boolean },
): Promise<ResidentRef> {
  const vulnerable = await db<{ type: VulnerableType; count: number }[]>`select type, count from vulnerable_members where resident_id = ${r.id}`;
  const family = await db<{ phone: string; name: string | null; email: string | null }[]>`select phone, name, email from family_contacts where resident_id = ${r.id}`;
  return {
    id: r.id,
    phone: r.phone,
    name: r.name,
    lang: r.preferred_language,
    zoneId: r.zone_id,
    home: r.lng !== null && r.lat !== null ? [r.lng, r.lat] : null,
    optOut: r.alerts_opt_out,
    vulnerable: [...vulnerable],
    family: [...family],
  };
}
