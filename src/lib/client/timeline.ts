// Rebuild what the map looked like at time T from the audit trail (timeline replay).
import type { LngLat, RequestStatus, RiskLevel } from "../core/types";
import type { LiveState, TimelineData } from "../types/state";

export function deriveAt(live: LiveState, tl: TimelineData, tIso: string): LiveState {
  const t = new Date(tIso).getTime();
  const hist = new Map(tl.requests.map((r) => [r.id, r]));

  const requests = live.requests
    .filter((r) => new Date(r.createdAt).getTime() <= t)
    .map((r) => {
      const h = hist.get(r.id)?.history ?? [];
      let status: RequestStatus = "new";
      for (const e of h) if (new Date(e.at).getTime() <= t) status = e.status;
      return { ...r, status, offer: null, rescuedAt: status === "rescued" ? r.rescuedAt : null };
    });

  const trackBy = new Map(tl.tracks.map((x) => [x.volunteerId, x.points]));
  const activeJob = new Map<string, string>();
  for (const j of tl.jobs) {
    const a = j.acceptedAt ? new Date(j.acceptedAt).getTime() : Infinity;
    const e = j.endedAt ? new Date(j.endedAt).getTime() : Infinity;
    if (a <= t && t < e) activeJob.set(j.volunteerId, j.requestId);
  }
  const volunteers = live.volunteers.map((v) => {
    const pts = trackBy.get(v.id);
    let lngLat: LngLat | null = v.lngLat;
    if (pts?.length) {
      const before = pts.filter((p) => new Date(p.at).getTime() <= t);
      lngLat = before.length ? before[before.length - 1].lngLat : pts[0].lngLat;
    }
    const job = activeJob.get(v.id) ?? null;
    return { ...v, lngLat, jobRequestId: job, status: job ? ("on_job" as const) : v.status === "off" ? ("off" as const) : ("idle" as const), arrived: false };
  });

  const zoneLevel = new Map<string, RiskLevel>();
  for (const z of tl.zones) if (new Date(z.at).getTime() <= t) zoneLevel.set(z.zoneId, z.level);
  const zones = live.zones.map((z) => ({ ...z, level: zoneLevel.get(z.id) ?? "low", reasons: zoneLevel.has(z.id) ? z.reasons : ["(replay) baseline"] }));

  const open = requests.filter((r) => ["new", "assigned", "en_route"].includes(r.status));
  return {
    ...live,
    zones,
    requests,
    volunteers,
    reports: live.reports.filter((r) => new Date(r.createdAt).getTime() <= t),
    checkins: live.checkins.filter((c) => new Date(c.createdAt).getTime() <= t),
    hotspots: [],
    stats: {
      ...live.stats,
      waiting: open.filter((r) => r.status === "new").length,
      assigned: open.filter((r) => r.status === "assigned").length,
      enRoute: open.filter((r) => r.status === "en_route").length,
      rescued: requests.filter((r) => r.status === "rescued").length,
      total: requests.length,
    },
  };
}
