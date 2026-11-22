// Everything the volunteer PWA needs in one small payload. The assigned volunteer sees the
// resident's full phone number and name; nobody else does.
import { handle, json, requireVolunteer } from "@/lib/api";
import { getSql } from "@/lib/db/client";
import { haversineM } from "@/lib/core/geo";
import type { LngLat } from "@/lib/core/types";
import { nearestShelters } from "@/lib/services/reference";

export const dynamic = "force-dynamic";

export const GET = handle(async () => {
  const s = await requireVolunteer();
  const sql = getSql();
  const [v] = await sql<{ id: string; name: string; phone: string; type: string; capacity: number; is_available: boolean; is_simulated: boolean; sim_move: boolean; lng: number | null; lat: number | null }[]>`
    select id, name, phone, type, capacity, is_available, is_simulated, sim_move, ST_X(current_location) lng, ST_Y(current_location) lat from volunteers where id = ${s.volunteerId}`;
  if (!v) return json({ error: "Volunteer not found" }, { status: 404 });
  const jobs = await sql<{ id: string; status: string; expires_at: Date | null; accepted_at: Date | null; arrived_at: Date | null; distance_m: number | null; operator_assigned: boolean;
    request_id: string; ref_code: string; phone: string; name: string | null; people_count: number; vulnerable: { type: string; count: number }[]; message: string | null;
    urgency_score: number; urgency_reasons: { label: string; points: number }[]; location_source: string; landmark: string | null; zone: string | null; rlng: number; rlat: number; inside_flood: boolean }[]>`
    select j.id, j.status, j.expires_at, j.accepted_at, j.arrived_at, j.distance_m, j.operator_assigned,
           h.id request_id, h.ref_code, h.phone, r.name, h.people_count, h.vulnerable, h.message, h.urgency_score, h.urgency_reasons, h.location_source,
           l.name landmark, z.name zone, ST_X(h.location) rlng, ST_Y(h.location) rlat, h.inside_flood
    from rescue_jobs j join help_requests h on h.id = j.help_request_id
    left join residents r on r.id = h.resident_id left join landmarks l on l.id = h.landmark_id left join zones z on z.id = h.zone_id
    where j.volunteer_id = ${v.id} and j.status in ('offered', 'accepted') order by j.offered_at desc`;
  const me: LngLat | null = v.lng !== null && v.lat !== null ? [v.lng, v.lat] : null;
  const shape = (j: (typeof jobs)[number], full: boolean) => ({
    jobId: j.id,
    status: j.status,
    expiresAt: j.expires_at,
    acceptedAt: j.accepted_at,
    arrivedAt: j.arrived_at,
    operatorAssigned: j.operator_assigned,
    distanceM: me ? Math.round(haversineM(me, [j.rlng, j.rlat])) : j.distance_m,
    request: {
      id: j.request_id,
      ref: j.ref_code,
      people: j.people_count,
      vulnerable: j.vulnerable,
      urgency: j.urgency_score,
      reasons: j.urgency_reasons,
      locationSource: j.location_source,
      landmark: j.landmark,
      zone: j.zone,
      insideFlood: j.inside_flood,
      lngLat: [j.rlng, j.rlat],
      message: full ? j.message : null,
      phone: full ? j.phone : null,
      name: full ? j.name : null,
    },
  });
  const offer = jobs.find((j) => j.status === "offered");
  const active = jobs.find((j) => j.status === "accepted");
  const shelters = active ? await nearestShelters(sql, [active.rlng, active.rlat], { needSpace: active.people_count, limit: 3 }) : [];
  return json({
    volunteer: { id: v.id, name: v.name, type: v.type, capacity: v.capacity, available: v.is_available, simMove: v.sim_move, lngLat: me },
    offer: offer ? shape(offer, false) : null,
    job: active ? shape(active, true) : null,
    shelters,
    serverTime: new Date().toISOString(),
  });
});
