// Ride-hailing style volunteer selection. Pure: given a request and candidate
// volunteers, rank who should get the offer.
//
// effective distance = straight-line distance × type factor × capacity factor
//   inside a flood polygon:  boat 1.0 · medical 2.5 · on_foot 3.0 · vehicle 4.0
//   outside flood:           vehicle 1.0 · medical 1.0 · on_foot 1.3 · boat 1.6
//   medical volunteers get ×0.7 when the household has bedridden/sick/pregnant members
//   capacity below people count: ×1.5 (they may need two trips)
// Volunteers who declined/expired/failed this request are excluded.
import { haversineM } from "./geo";
import type { LngLat, VolunteerType } from "./types";

export const TYPE_FACTOR: Record<"inside" | "outside", Record<VolunteerType, number>> = {
  inside: { boat: 1.0, medical: 2.5, on_foot: 3.0, vehicle: 4.0 },
  outside: { vehicle: 1.0, medical: 1.0, on_foot: 1.3, boat: 1.6 },
};

/** Volunteers further than this (effective metres) are not offered the job. */
export const MAX_EFFECTIVE_M = 25000;

export interface DispatchCandidate {
  id: string;
  type: VolunteerType;
  location: LngLat;
  capacity: number;
  isAvailable: boolean;
  hasLiveJob: boolean;
}

export interface DispatchRequestInput {
  location: LngLat;
  insideFlood: boolean;
  peopleCount: number;
  needsMedical: boolean;
}

export interface RankedCandidate {
  id: string;
  type: VolunteerType;
  distanceM: number;
  effectiveM: number;
  reasons: string[];
}

export function rankVolunteers(req: DispatchRequestInput, candidates: DispatchCandidate[], excluded: Set<string> = new Set()): RankedCandidate[] {
  const side = req.insideFlood ? "inside" : "outside";
  const out: RankedCandidate[] = [];
  for (const c of candidates) {
    if (!c.isAvailable || c.hasLiveJob || excluded.has(c.id)) continue;
    const distanceM = haversineM(c.location, req.location);
    let factor = TYPE_FACTOR[side][c.type] ?? 2;
    const reasons: string[] = [];
    if (req.insideFlood && c.type === "boat") reasons.push("Boat preferred in flooded area");
    if (!req.insideFlood && c.type === "vehicle") reasons.push("Road access");
    if (req.needsMedical && c.type === "medical") {
      factor *= 0.7;
      reasons.push("Medical need");
    }
    if (c.capacity < req.peopleCount) {
      factor *= 1.5;
      reasons.push(`Capacity ${c.capacity} < ${req.peopleCount} people`);
    }
    const effectiveM = distanceM * factor;
    if (effectiveM > MAX_EFFECTIVE_M) continue;
    out.push({ id: c.id, type: c.type, distanceM: Math.round(distanceM), effectiveM: Math.round(effectiveM), reasons });
  }
  return out.sort((a, b) => a.effectiveM - b.effectiveM || a.distanceM - b.distanceM || a.id.localeCompare(b.id));
}

export function selectVolunteer(req: DispatchRequestInput, candidates: DispatchCandidate[], excluded?: Set<string>): RankedCandidate | null {
  return rankVolunteers(req, candidates, excluded)[0] ?? null;
}

export interface GreedyRequest extends DispatchRequestInput {
  id: string;
  urgency: number;
  excluded: Set<string>;
}

/**
 * Assign offers across the whole queue: most urgent request first, each volunteer
 * gets at most one offer.
 */
export function planOffers(requests: GreedyRequest[], candidates: DispatchCandidate[]): { requestId: string; pick: RankedCandidate }[] {
  const taken = new Set<string>();
  const plan: { requestId: string; pick: RankedCandidate }[] = [];
  const sorted = [...requests].sort((a, b) => b.urgency - a.urgency || a.id.localeCompare(b.id));
  for (const r of sorted) {
    const excluded = new Set([...r.excluded, ...taken]);
    const pick = selectVolunteer(r, candidates, excluded);
    if (pick) {
      taken.add(pick.id);
      plan.push({ requestId: r.id, pick });
    }
  }
  return plan;
}
