import { describe, expect, it } from "vitest";
import { rankVolunteers, selectVolunteer, planOffers, type DispatchCandidate } from "@/lib/core/dispatch";
import { detectHotspots } from "@/lib/core/hotspots";
import { haversineM, moveToward, pointInGeometry, lineCrossesGeometry } from "@/lib/core/geo";
import { maskPhone, normalizePhone } from "@/lib/core/phone";

const target: [number, number] = [6.76, 7.8];
const v = (id: string, type: DispatchCandidate["type"], dLng: number, extra: Partial<DispatchCandidate> = {}): DispatchCandidate => ({
  id,
  type,
  location: [target[0] + dLng, target[1]],
  capacity: 6,
  isAvailable: true,
  hasLiveJob: false,
  ...extra,
});

describe("dispatch selection", () => {
  it("picks the nearest volunteer outside flood areas", () => {
    const pick = selectVolunteer({ location: target, insideFlood: false, peopleCount: 2, needsMedical: false }, [v("far", "vehicle", 0.02), v("near", "vehicle", 0.005)]);
    expect(pick?.id).toBe("near");
  });

  it("prefers a boat inside a flood polygon even if a car is closer", () => {
    const pick = selectVolunteer({ location: target, insideFlood: true, peopleCount: 2, needsMedical: false }, [v("car", "vehicle", 0.004), v("boat", "boat", 0.01)]);
    expect(pick?.id).toBe("boat");
    expect(pick?.reasons).toContain("Boat preferred in flooded area");
  });

  it("skips unavailable, busy and excluded volunteers", () => {
    const cands = [v("a", "boat", 0.001, { isAvailable: false }), v("b", "boat", 0.002, { hasLiveJob: true }), v("c", "boat", 0.003), v("d", "boat", 0.004)];
    expect(selectVolunteer({ location: target, insideFlood: true, peopleCount: 1, needsMedical: false }, cands, new Set(["c"]))?.id).toBe("d");
  });

  it("penalises insufficient capacity and favours medical for medical need", () => {
    const req = { location: target, insideFlood: false, peopleCount: 8, needsMedical: false };
    expect(selectVolunteer(req, [v("small", "vehicle", 0.004, { capacity: 2 }), v("big", "vehicle", 0.005, { capacity: 10 })])?.id).toBe("big");
    const med = { location: target, insideFlood: false, peopleCount: 1, needsMedical: true };
    expect(selectVolunteer(med, [v("car", "vehicle", 0.004), v("medic", "medical", 0.005)])?.id).toBe("medic");
  });

  it("returns null when nobody is eligible", () => {
    expect(selectVolunteer({ location: target, insideFlood: true, peopleCount: 1, needsMedical: false }, [])).toBeNull();
  });

  it("ranking is sorted by effective distance", () => {
    const ranked = rankVolunteers({ location: target, insideFlood: false, peopleCount: 1, needsMedical: false }, [v("x", "vehicle", 0.03), v("y", "vehicle", 0.01), v("z", "vehicle", 0.02)]);
    expect(ranked.map((r) => r.id)).toEqual(["y", "z", "x"]);
  });

  it("planOffers gives the most urgent request first pick and never double-books", () => {
    const cands = [v("boat1", "boat", 0.002), v("boat2", "boat", 0.03)];
    const plan = planOffers(
      [
        { id: "low", urgency: 20, location: target, insideFlood: true, peopleCount: 1, needsMedical: false, excluded: new Set() },
        { id: "high", urgency: 80, location: target, insideFlood: true, peopleCount: 1, needsMedical: false, excluded: new Set() },
      ],
      cands,
    );
    expect(plan).toEqual([
      { requestId: "high", pick: expect.objectContaining({ id: "boat1" }) },
      { requestId: "low", pick: expect.objectContaining({ id: "boat2" }) },
    ]);
  });
});

describe("hotspots", () => {
  const now = new Date("2026-01-01T12:00:00Z");
  const p = (id: string, dLng: number, minAgo = 1) => ({ id, location: [6.76 + dLng, 7.8] as [number, number], createdAt: new Date(now.getTime() - minAgo * 60000) });

  it("detects ≥5 requests within 500 m in 15 min", () => {
    const pts = [p("a", 0), p("b", 0.001), p("c", 0.002), p("d", 0.0015), p("e", 0.0005), p("far", 0.05)];
    const h = detectHotspots(pts, { now });
    expect(h).toHaveLength(1);
    expect(h[0].count).toBe(5);
    expect(h[0].ids).not.toContain("far");
  });

  it("ignores old requests and small groups", () => {
    expect(detectHotspots([p("a", 0), p("b", 0.001), p("c", 0.002), p("d", 0.0015), p("e", 0.0005, 30)], { now })).toHaveLength(0);
  });
});

describe("geo + phone helpers", () => {
  it("haversine ~ 1.1 km per 0.01° latitude", () => {
    expect(Math.round(haversineM([6.76, 7.8], [6.76, 7.81]))).toBeGreaterThan(1100);
    expect(Math.round(haversineM([6.76, 7.8], [6.76, 7.81]))).toBeLessThan(1115);
  });
  it("moveToward clamps at target", () => {
    expect(moveToward([0, 0], [0, 0.001], 1000)).toEqual([0, 0.001]);
    const m = moveToward([0, 0], [0, 0.01], 100);
    expect(haversineM([0, 0], m)).toBeCloseTo(100, 0);
  });
  it("point in polygon / line crossing", () => {
    const sq = { type: "Polygon" as const, coordinates: [[[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]]] };
    expect(pointInGeometry([0.5, 0.5], sq)).toBe(true);
    expect(pointInGeometry([1.5, 0.5], sq)).toBe(false);
    expect(lineCrossesGeometry([-0.001, 0.5], [1.001, 0.5], sq)).toBe(true);
  });
  it("normalises and masks Nigerian numbers", () => {
    expect(normalizePhone("0803 123 4567")).toBe("+2348031234567");
    expect(normalizePhone("2348031234567")).toBe("+2348031234567");
    expect(normalizePhone("+234 803-123-4567")).toBe("+2348031234567");
    expect(maskPhone("+2348031234567")).toBe("+234 803 *** 4567");
  });
});
