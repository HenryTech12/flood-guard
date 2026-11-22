// Crowd report verification. Never deletes anything — it only labels a report so a
// human can review it.
//   consistent  — falls in a HIGH/SEVERE zone, inside a satellite flood area, or is
//                 corroborated by ≥2 other reports within 1 km in the last 6 h
//   suspicious  — conflicts with ALL other data: LOW zone, outside any flood area,
//                 nobody else reporting nearby, and terrain is high ground
//   unverified  — anything in between
import type { RiskLevel } from "./types";

export type Verification = "unverified" | "consistent" | "suspicious";

export interface VerifyInput {
  zoneLevel: RiskLevel | null;
  zoneBaseRisk: number | null;
  insideFloodExtent: boolean;
  nearbyReports: number;
}

export function verifyReport(i: VerifyInput): { status: Verification; reason: string } {
  if (i.insideFloodExtent) return { status: "consistent", reason: "Inside satellite flood extent" };
  if (i.zoneLevel === "high" || i.zoneLevel === "severe") return { status: "consistent", reason: `Zone risk is ${i.zoneLevel.toUpperCase()}` };
  if (i.nearbyReports >= 2) return { status: "consistent", reason: `${i.nearbyReports} similar reports within 1 km` };
  if ((i.zoneLevel === "low" || i.zoneLevel === null) && i.nearbyReports === 0 && (i.zoneBaseRisk ?? 0.5) < 0.3)
    return { status: "suspicious", reason: "Low-risk high ground, no rain signal, no other reports" };
  return { status: "unverified", reason: "Needs human review" };
}
