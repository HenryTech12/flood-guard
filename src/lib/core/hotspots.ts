// Hotspot detection: clusters of ≥ minCount help requests within radiusM of a seed
// request, created within the last windowMin minutes. Greedy, deterministic.
import { haversineM } from "./geo";
import type { LngLat } from "./types";

export interface HotspotPoint {
  id: string;
  location: LngLat;
  createdAt: Date;
}

export interface Hotspot {
  center: LngLat;
  count: number;
  ids: string[];
  radiusM: number;
}

export function detectHotspots(
  points: HotspotPoint[],
  { now = new Date(), radiusM = 500, minCount = 5, windowMin = 15 }: { now?: Date; radiusM?: number; minCount?: number; windowMin?: number } = {},
): Hotspot[] {
  const cutoff = now.getTime() - windowMin * 60000;
  const recent = points.filter((p) => p.createdAt.getTime() >= cutoff && p.createdAt.getTime() <= now.getTime());
  const unassigned = new Set(recent.map((p) => p.id));
  const out: Hotspot[] = [];

  while (true) {
    let best: { seed: HotspotPoint; members: HotspotPoint[] } | null = null;
    for (const seed of recent) {
      if (!unassigned.has(seed.id)) continue;
      const members = recent.filter((p) => unassigned.has(p.id) && haversineM(seed.location, p.location) <= radiusM);
      if (members.length >= minCount && (!best || members.length > best.members.length)) best = { seed, members };
    }
    if (!best) break;
    for (const m of best.members) unassigned.delete(m.id);
    const cx = best.members.reduce((s, p) => s + p.location[0], 0) / best.members.length;
    const cy = best.members.reduce((s, p) => s + p.location[1], 0) / best.members.length;
    const center: LngLat = [cx, cy];
    const r = Math.max(150, ...best.members.map((p) => haversineM(center, p.location)));
    out.push({ center, count: best.members.length, ids: best.members.map((m) => m.id).sort(), radiusM: Math.round(r + 50) });
  }
  return out.sort((a, b) => b.count - a.count);
}
