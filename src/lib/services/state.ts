// Builds the dashboard snapshot. Phone numbers are masked; full numbers are only shown to
// the assigned volunteer (volunteer API) or via an audited operator "reveal".
import type { Sql } from "../db/client";
import { getRegion } from "../../../config/regions";
import { detectHotspots } from "../core/hotspots";
import { maskPhone } from "../core/phone";
import { LANGS, type Lang, type LngLat, type RiskLevel, type VulnerableType } from "../core/types";
import { VULNERABLE_LABELS } from "../core/urgency";
import { env } from "../env";
import { languageStatus } from "../i18n/templates";
import type { LiveState, TimelineData } from "../types/state";

const iso = (d: Date | string | null | undefined) => (d ? new Date(d).toISOString() : null);

export async function buildState(sql: Sql): Promise<LiveState> {
  const region = getRegion();
  const [demo] = await sql<{ sim_time: Date | null; replay_running: boolean; replay_sim_start: Date | null; replay_sim_end: Date | null; autopilot: boolean; move_volunteers: boolean; auto_alerts: boolean; demo_started_at: Date }[]>`
    select sim_time, replay_running, replay_sim_start, replay_sim_end, autopilot, move_volunteers, auto_alerts, demo_started_at from demo_state where id = 1`;

  const [zones, requests, offers, volunteers, shelters, reports, checkins, vulnHomes, alerts, extent] = await Promise.all([
    sql<{ id: string; name: string; short_name: string; current_risk_level: RiskLevel; current_risk_score: number; risk_reasons: string[]; rain_24h_mm: number; rain_72h_mm: number; base_risk_score: number; override_level: RiskLevel | null; geom: string; clng: number; clat: number; residents: number; vulnerable: number }[]>`
      select z.id, z.name, z.short_name, z.current_risk_level, z.current_risk_score, z.risk_reasons, z.rain_24h_mm, z.rain_72h_mm, z.base_risk_score, z.override_level,
             ST_AsGeoJSON(z.geom, 6) geom, ST_X(z.centroid) clng, ST_Y(z.centroid) clat,
             (select count(*) from residents r where r.zone_id = z.id)::int residents,
             (select count(distinct r.id) from residents r join vulnerable_members v on v.resident_id = r.id where r.zone_id = z.id)::int vulnerable
      from zones z`,
    sql<{ id: string; ref_code: string; phone: string; name: string | null; lng: number; lat: number; location_source: string; landmark: string | null; zone_id: string | null; people_count: number; vulnerable: { type: VulnerableType; count: number }[]; vulnerable_flag: boolean; message: string | null; channel: string; urgency_score: number; urgency_reasons: { label: string; points: number }[]; status: string; inside_flood: boolean; created_at: Date; updated_at: Date; rescued_at: Date | null; assigned_volunteer_id: string | null; merged_count: number; failed_attempts: number; close_reason: string | null; resident_id: string | null }[]>`
      select h.id, h.ref_code, h.phone, r.name, ST_X(h.location) lng, ST_Y(h.location) lat, h.location_source, l.name landmark, h.zone_id, h.people_count, h.vulnerable,
             h.vulnerable_flag, h.message, h.channel, h.urgency_score, h.urgency_reasons, h.status, h.inside_flood, h.created_at, h.updated_at, h.rescued_at,
             h.assigned_volunteer_id, h.merged_count, h.failed_attempts, h.close_reason, h.resident_id
      from help_requests h left join residents r on r.id = h.resident_id left join landmarks l on l.id = h.landmark_id
      where h.status in ('new', 'assigned', 'en_route') or h.updated_at > now() - interval '24 hours'
      order by h.created_at desc limit 500`,
    sql<{ help_request_id: string; volunteer_id: string; expires_at: Date; operator_assigned: boolean }[]>`
      select help_request_id, volunteer_id, expires_at, operator_assigned from rescue_jobs where status = 'offered'`,
    sql<{ id: string; name: string; type: string; capacity: number; lng: number | null; lat: number | null; is_available: boolean; is_simulated: boolean; last_seen_at: Date | null; job_status: string | null; job_request: string | null; arrived_at: Date | null }[]>`
      select v.id, v.name, v.type, v.capacity, ST_X(v.current_location) lng, ST_Y(v.current_location) lat, v.is_available, v.is_simulated, v.last_seen_at,
             j.status job_status, j.help_request_id job_request, j.arrived_at
      from volunteers v left join rescue_jobs j on j.volunteer_id = v.id and j.status in ('offered', 'accepted')
      order by v.name`,
    sql<{ id: string; name: string; lng: number; lat: number; capacity: number; current_occupancy: number; contact_phone: string }[]>`
      select id, name, ST_X(geom) lng, ST_Y(geom) lat, capacity, current_occupancy, contact_phone from shelters order by name`,
    sql<{ id: string; lng: number; lat: number; type: string; water_depth_estimate: number | null; description: string | null; photo_url: string | null; verification_status: "unverified" | "consistent" | "suspicious"; verification_reason: string | null; created_at: Date; zone_id: string | null; channel: string }[]>`
      select id, ST_X(location) lng, ST_Y(location) lat, type, water_depth_estimate, description, photo_url, verification_status, verification_reason, created_at, zone_id, channel
      from crowd_reports where created_at > now() - interval '48 hours' order by created_at desc limit 300`,
    sql<{ id: string; lng: number | null; lat: number | null; name: string | null; created_at: Date; channel: string }[]>`
      select c.id, ST_X(r.home) lng, ST_Y(r.home) lat, r.name, c.created_at, c.channel
      from checkins c left join residents r on r.id = c.resident_id
      where c.status = 'safe' and c.created_at > now() - interval '24 hours' order by c.created_at desc limit 300`,
    sql<{ id: string; lng: number; lat: number; zone_id: string; name: string | null; types: { type: VulnerableType; count: number }[] }[]>`
      select r.id, ST_X(r.home) lng, ST_Y(r.home) lat, r.zone_id, r.name,
             json_agg(json_build_object('type', v.type, 'count', v.count)) types
      from residents r join vulnerable_members v on v.resident_id = r.id join zones z on z.id = r.zone_id
      where r.home is not null and z.current_risk_level in ('high', 'severe')
      group by r.id`,
    sql<{ id: string; zone_id: string | null; level: string; language: string; channel: string; sent_count: number; fallback_from: string | null; created_at: Date }[]>`
      select id, zone_id, level, language, channel, sent_count, fallback_from, created_at from alerts order by created_at desc limit 40`,
    sql<{ observed_at: Date; synthetic: boolean }[]>`select observed_at, synthetic from flood_extents where active order by observed_at desc limit 1`,
  ]);

  const offerBy = new Map(offers.map((o) => [o.help_request_id, o]));
  const reqs = requests.map((h) => {
    const o = offerBy.get(h.id);
    return {
      id: h.id,
      ref: h.ref_code,
      phoneMasked: maskPhone(h.phone),
      name: h.name,
      lngLat: [h.lng, h.lat] as LngLat,
      locationSource: h.location_source as LiveState["requests"][number]["locationSource"],
      landmark: h.landmark,
      zoneId: h.zone_id,
      people: h.people_count,
      vulnerable: h.vulnerable ?? [],
      vulnerableFlag: h.vulnerable_flag,
      message: h.message,
      channel: h.channel,
      urgency: h.urgency_score,
      reasons: h.urgency_reasons ?? [],
      status: h.status as LiveState["requests"][number]["status"],
      insideFlood: h.inside_flood,
      createdAt: iso(h.created_at)!,
      updatedAt: iso(h.updated_at)!,
      rescuedAt: iso(h.rescued_at),
      assignedVolunteerId: h.assigned_volunteer_id,
      offer: o ? { volunteerId: o.volunteer_id, expiresAt: iso(o.expires_at)!, operatorAssigned: o.operator_assigned } : null,
      mergedCount: h.merged_count,
      failedAttempts: h.failed_attempts,
      closeReason: h.close_reason,
      registered: !!h.resident_id,
    };
  });

  // Stats
  const open = reqs.filter((r) => ["new", "assigned", "en_route"].includes(r.status));
  const [times] = await sql<{ accept_sec: number | null; rescue_min: number | null }[]>`
    select avg(extract(epoch from j.accepted_at - h.created_at))::float8 accept_sec,
           avg(extract(epoch from h.rescued_at - h.created_at) / 60)::float8 rescue_min
    from help_requests h left join rescue_jobs j on j.help_request_id = h.id and j.accepted_at is not null
    where h.created_at > now() - interval '24 hours'`;

  const hotspots = detectHotspots(
    open.map((r) => ({ id: r.id, location: r.lngLat, createdAt: new Date(r.createdAt) })),
    { now: new Date() },
  );

  return {
    serverTime: new Date().toISOString(),
    region: { id: region.id, name: region.name, state: region.state, center: region.center, zoom: region.zoom, bounds: region.bounds, ussdCode: region.ussdCode, smsShortcode: region.smsShortcode },
    demo: {
      enabled: env.demoMode,
      simTime: iso(demo?.sim_time),
      replayRunning: !!demo?.replay_running,
      replayStart: iso(demo?.replay_sim_start),
      replayEnd: iso(demo?.replay_sim_end),
      autopilot: !!demo?.autopilot,
      moveVolunteers: !!demo?.move_volunteers,
      autoAlerts: demo?.auto_alerts ?? true,
      demoStartedAt: iso(demo?.demo_started_at) ?? new Date().toISOString(),
    },
    zones: zones.map((z) => ({
      id: z.id,
      name: z.name,
      shortName: z.short_name,
      level: z.current_risk_level,
      score: z.current_risk_score,
      reasons: z.risk_reasons ?? [],
      rain24h: z.rain_24h_mm,
      rain72h: z.rain_72h_mm,
      baseRisk: z.base_risk_score,
      override: z.override_level,
      geometry: JSON.parse(z.geom),
      centroid: [z.clng, z.clat],
      residents: z.residents,
      vulnerableHouseholds: z.vulnerable,
    })),
    requests: reqs,
    volunteers: volunteers.map((v) => ({
      id: v.id,
      name: v.name,
      type: v.type as LiveState["volunteers"][number]["type"],
      capacity: v.capacity,
      lngLat: v.lng !== null && v.lat !== null ? [v.lng, v.lat] : null,
      available: v.is_available,
      status: !v.is_available && !v.job_status ? "off" : v.job_status === "accepted" ? "on_job" : v.job_status === "offered" ? "offered" : "idle",
      jobRequestId: v.job_request,
      arrived: !!v.arrived_at,
      simulated: v.is_simulated,
      lastSeenAt: iso(v.last_seen_at),
    })),
    shelters: shelters.map((s) => ({ id: s.id, name: s.name, lngLat: [s.lng, s.lat], capacity: s.capacity, occupancy: s.current_occupancy, phone: s.contact_phone })),
    reports: reports.map((r) => ({
      id: r.id,
      lngLat: [r.lng, r.lat],
      type: r.type,
      depthCm: r.water_depth_estimate,
      description: r.description,
      photoUrl: r.photo_url,
      verification: r.verification_status,
      verificationReason: r.verification_reason,
      createdAt: iso(r.created_at)!,
      zoneId: r.zone_id,
      channel: r.channel,
    })),
    checkins: checkins.map((c) => ({ id: c.id, lngLat: c.lng !== null && c.lat !== null ? [c.lng, c.lat] : null, name: c.name, createdAt: iso(c.created_at)!, channel: c.channel })),
    vulnerableHomes: vulnHomes.map((v) => ({
      residentId: v.id,
      lngLat: [v.lng, v.lat],
      zoneId: v.zone_id,
      name: v.name,
      summary: v.types.map((t) => (t.count > 1 ? `${t.count} ${VULNERABLE_LABELS[t.type]}` : VULNERABLE_LABELS[t.type])).join(", "),
    })),
    stats: {
      waiting: reqs.filter((r) => r.status === "new").length,
      offered: reqs.filter((r) => r.status === "new" && r.offer).length,
      assigned: reqs.filter((r) => r.status === "assigned").length,
      enRoute: reqs.filter((r) => r.status === "en_route").length,
      rescued: reqs.filter((r) => r.status === "rescued").length,
      cancelled: reqs.filter((r) => r.status === "cancelled" || r.status === "duplicate").length,
      safeCheckins: checkins.length,
      avgAcceptSec: times?.accept_sec ?? null,
      avgRescueMin: times?.rescue_min ?? null,
      total: reqs.length,
    },
    hotspots,
    alerts: alerts.map((a) => ({ id: a.id, zoneId: a.zone_id, level: a.level, language: a.language, channel: a.channel, sentCount: a.sent_count, fallbackFrom: a.fallback_from, createdAt: iso(a.created_at)! })),
    languageStatus: Object.fromEntries(LANGS.map((l) => [l, languageStatus(l as Lang)])) as Record<Lang, string>,
    floodExtentObservedAt: iso(extent[0]?.observed_at),
    floodExtentSynthetic: !!extent[0]?.synthetic,
  };
}

export async function buildTimeline(sql: Sql): Promise<TimelineData> {
  const [st] = await sql<{ demo_started_at: Date }[]>`select demo_started_at from demo_state where id = 1`;
  const start = st?.demo_started_at ?? new Date(Date.now() - 3600e3);
  const [reqs, hist, pos, zones, jobs] = await Promise.all([
    sql<{ id: string; created_at: Date }[]>`select id, created_at from help_requests where created_at >= ${start} - interval '1 hour' order by created_at`,
    sql<{ entity_id: string; to_value: string; at: Date }[]>`select entity_id, to_value, at from audit_log where entity = 'help_request' and action = 'status' and at >= ${start} - interval '1 hour' order by at`,
    sql<{ volunteer_id: string; lng: number; lat: number; at: Date }[]>`select volunteer_id, ST_X(geom) lng, ST_Y(geom) lat, at from volunteer_positions where at >= ${start} order by at limit 20000`,
    sql<{ zone_id: string; level: RiskLevel; at: Date }[]>`select zone_id, level, at from zone_risk_snapshots where at >= ${start} order by at`,
    sql<{ help_request_id: string; volunteer_id: string; accepted_at: Date | null; completed_at: Date | null }[]>`
      select help_request_id, volunteer_id, accepted_at, completed_at from rescue_jobs where accepted_at is not null and accepted_at >= ${start} - interval '1 hour'`,
  ]);
  const histBy = new Map<string, { status: string; at: string }[]>();
  for (const h of hist) {
    const arr = histBy.get(h.entity_id) ?? [];
    arr.push({ status: h.to_value, at: iso(h.at)! });
    histBy.set(h.entity_id, arr);
  }
  const tracks = new Map<string, { lngLat: LngLat; at: string }[]>();
  for (const p of pos) {
    const arr = tracks.get(p.volunteer_id) ?? [];
    arr.push({ lngLat: [p.lng, p.lat], at: iso(p.at)! });
    tracks.set(p.volunteer_id, arr);
  }
  return {
    start: iso(start)!,
    end: new Date().toISOString(),
    requests: reqs.map((r) => ({ id: r.id, createdAt: iso(r.created_at)!, history: (histBy.get(r.id) ?? [{ status: "new", at: iso(r.created_at)! }]) as TimelineData["requests"][number]["history"] })),
    tracks: [...tracks].map(([volunteerId, points]) => ({ volunteerId, points })),
    zones: zones.map((z) => ({ zoneId: z.zone_id, level: z.level, at: iso(z.at)! })),
    jobs: jobs.map((j) => ({ requestId: j.help_request_id, volunteerId: j.volunteer_id, acceptedAt: iso(j.accepted_at), endedAt: iso(j.completed_at) })),
  };
}
