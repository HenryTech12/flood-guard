import { describe, expect, it } from "vitest";
import { computeUrgency } from "@/lib/core/urgency";
import { computeRisk, levelForScore } from "@/lib/core/risk";
import { verifyReport } from "@/lib/core/crowd";
import { findMergeTarget, shouldSendAlert } from "@/lib/core/policy";

const now = new Date("2026-01-01T12:00:00Z");

describe("urgency", () => {
  it("base case: medium zone, one person", () => {
    const r = computeUrgency({ zoneLevel: "medium", vulnerable: [], peopleCount: 1, message: "help", createdAt: now, now });
    expect(r.score).toBe(15);
    expect(r.reasons).toEqual([{ label: "Zone risk MEDIUM", points: 15 }]);
  });

  it("adds vulnerable members, people, keywords and waiting time with reasons", () => {
    const r = computeUrgency({
      zoneLevel: "high",
      vulnerable: [{ type: "elderly", count: 1 }, { type: "child_under5", count: 2 }],
      peopleCount: 4,
      message: "we are on the roof with a baby",
      createdAt: new Date(now.getTime() - 25 * 60000),
      now,
    });
    // zone 30 + vulnerable (10 + 15 = 25) + people 6 + waiting 6 + keywords (roof 10 + baby 8 = 18)
    expect(r.score).toBe(85);
    const labels = r.reasons.map((x) => x.label);
    expect(labels).toContain("Zone risk HIGH");
    expect(labels).toContain("Vulnerable: elderly, 2 child under 5");
    expect(labels).toContain("4 people");
    expect(labels).toContain("Waiting 25 min");
    expect(labels.find((l) => l.startsWith("Message"))).toContain("on roof");
  });

  it("caps each component and the total at 100", () => {
    const r = computeUrgency({
      zoneLevel: "severe",
      vulnerable: [{ type: "bedridden", count: 3 }, { type: "disabled", count: 2 }],
      peopleCount: 50,
      message: "drowning roof baby sick trapped water rising",
      createdAt: new Date(now.getTime() - 300 * 60000),
      now,
      failedAttempts: 3,
    });
    expect(r.score).toBe(100);
    expect(r.reasons.find((x) => x.label.startsWith("Vulnerable"))!.points).toBe(30);
    expect(r.reasons.find((x) => x.label.startsWith("Message"))!.points).toBe(20);
  });

  it("vulnerable household outranks an otherwise identical one", () => {
    const a = computeUrgency({ zoneLevel: "high", vulnerable: [], peopleCount: 2, message: "", createdAt: now, now });
    const b = computeUrgency({ zoneLevel: "high", vulnerable: [{ type: "pregnant", count: 1 }], peopleCount: 2, message: "", createdAt: now, now });
    expect(b.score).toBeGreaterThan(a.score);
  });

  it("grows every 10 minutes of waiting", () => {
    const at = (m: number) => computeUrgency({ zoneLevel: "low", vulnerable: [], peopleCount: 1, message: "", createdAt: new Date(now.getTime() - m * 60000), now }).score;
    expect(at(9)).toBe(5);
    expect(at(10)).toBe(8);
    expect(at(20)).toBe(11);
  });
});

describe("risk engine", () => {
  const base = { baseRisk: 0.86, rain24h: 0, rain72h: 0, reportCount: 0, satelliteOverlap: null, historicallyFlooded: true };

  it("dry weather in a flood-prone zone stays low", () => {
    const r = computeRisk(base);
    expect(r.level).toBe("low");
    expect(r.reasons).toContain("Historically flooded (2022)");
  });

  it("heavy rain raises a low-lying zone to HIGH with explainable reasons", () => {
    const r = computeRisk({ ...base, rain24h: 110, rain72h: 160 });
    expect(r.level).toBe("high");
    expect(r.reasons[0]).toBe("Rain 110mm/24h (160mm/72h)");
  });

  it("rain + reports + satellite → SEVERE", () => {
    const r = computeRisk({ ...base, rain24h: 120, rain72h: 220, reportCount: 6, satelliteOverlap: 0.6, satelliteLabel: "S1" });
    expect(r.level).toBe("severe");
    expect(r.reasons.some((x) => x.startsWith("Satellite: 60%"))).toBe(true);
    expect(r.reasons).toContain("6 water reports (24h)");
  });

  it("high ground stays at most medium in the same rain", () => {
    const r = computeRisk({ ...base, baseRisk: 0.08, historicallyFlooded: false, rain24h: 120, rain72h: 160 });
    expect(r.level).toBe("medium");
  });

  it("override raises but never lowers", () => {
    expect(computeRisk({ ...base, overrideLevel: "high" }).level).toBe("high");
    expect(computeRisk({ ...base, rain24h: 200, rain72h: 400, reportCount: 10, satelliteOverlap: 1, overrideLevel: "medium" }).level).toBe("severe");
    expect(computeRisk({ ...base, overrideLevel: "high" }).reasons).toContain("Operator override: HIGH");
  });

  it("hysteresis prevents flicker when falling", () => {
    expect(levelForScore(0.53, "high")).toBe("high"); // within 0.05 of 0.55
    expect(levelForScore(0.49, "high")).toBe("medium");
    expect(levelForScore(0.53, null)).toBe("medium");
    expect(levelForScore(0.2, "severe")).toBe("low");
  });
});

describe("crowd report verification", () => {
  it("consistent inside flood extent or high zone", () => {
    expect(verifyReport({ zoneLevel: "low", zoneBaseRisk: 0.1, insideFloodExtent: true, nearbyReports: 0 }).status).toBe("consistent");
    expect(verifyReport({ zoneLevel: "severe", zoneBaseRisk: 0.1, insideFloodExtent: false, nearbyReports: 0 }).status).toBe("consistent");
    expect(verifyReport({ zoneLevel: "medium", zoneBaseRisk: 0.5, insideFloodExtent: false, nearbyReports: 2 }).status).toBe("consistent");
  });
  it("suspicious only when it conflicts with everything", () => {
    expect(verifyReport({ zoneLevel: "low", zoneBaseRisk: 0.08, insideFloodExtent: false, nearbyReports: 0 }).status).toBe("suspicious");
    expect(verifyReport({ zoneLevel: "medium", zoneBaseRisk: 0.08, insideFloodExtent: false, nearbyReports: 0 }).status).toBe("unverified");
  });
});

describe("dedupe + alert policy", () => {
  const r = (id: string, minAgo: number, status = "new", phone = "+2348000000001") => ({ id, phone, status, createdAt: new Date(now.getTime() - minAgo * 60000) });

  it("merges same phone within 30 minutes into the newest open request", () => {
    expect(findMergeTarget([r("a", 25), r("b", 5)], "+2348000000001", now)?.id).toBe("b");
    expect(findMergeTarget([r("a", 31)], "+2348000000001", now)).toBeNull();
    expect(findMergeTarget([r("a", 5, "rescued")], "+2348000000001", now)).toBeNull();
    expect(findMergeTarget([r("a", 5, "new", "+2348000000002")], "+2348000000001", now)).toBeNull();
  });

  it("alerts: escalate yes, same level within cooldown no, below medium never", () => {
    const sent = (level: "medium" | "high", minAgo: number) => ({ level, sentAt: new Date(now.getTime() - minAgo * 60000) });
    expect(shouldSendAlert("low", null, now).send).toBe(false);
    expect(shouldSendAlert("medium", null, now).send).toBe(true);
    expect(shouldSendAlert("high", sent("medium", 5), now).send).toBe(true);
    expect(shouldSendAlert("high", sent("high", 5), now).send).toBe(false); // flicker high→medium→high
    expect(shouldSendAlert("medium", sent("high", 5), now).send).toBe(false);
    expect(shouldSendAlert("high", sent("high", 400), now).send).toBe(true);
    expect(shouldSendAlert("high", sent("high", 5), now, { force: true }).send).toBe(true);
  });
});
