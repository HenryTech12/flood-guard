// Zone risk engine — a deliberately simple, explainable weighted sum.
//
//   score = 0.35 · base_risk                 (terrain + 2022 flood history, 0–1)
//         + 0.35 · rain_factor               max(rain24h / 100mm, rain72h / 200mm), capped at 1
//         + 0.15 · report_factor             credible water reports in 24h / 6, capped at 1
//         + 0.15 · satellite_overlap         share of zone inside a *current* Sentinel-1 flood extent
//
//   level:  score < 0.35 low · < 0.55 medium · < 0.75 high · otherwise severe
//
// Hysteresis: a zone only drops a level once its score is 0.05 below that level's
// threshold, so risk that hovers around a threshold does not flicker (and spam alerts).
// An operator override can raise (never lower) the computed level.
import { type RiskLevel, RISK_LEVELS, levelIndex } from "./types";

export const WEIGHTS = { base: 0.35, rain: 0.35, reports: 0.15, satellite: 0.15 } as const;
export const THRESHOLDS: Record<Exclude<RiskLevel, "low">, number> = { medium: 0.35, high: 0.55, severe: 0.75 };
export const HYSTERESIS = 0.05;
export const RAIN_24H_FULL_MM = 100;
export const RAIN_72H_FULL_MM = 200;
export const REPORTS_FULL = 6;

export interface RiskInput {
  baseRisk: number;
  rain24h: number;
  rain72h: number;
  reportCount: number;
  /** 0..1 share of the zone inside a current satellite flood extent; null if none current. */
  satelliteOverlap: number | null;
  satelliteLabel?: string;
  historicallyFlooded: boolean;
  previousLevel?: RiskLevel | null;
  overrideLevel?: RiskLevel | null;
}

export interface RiskResult {
  score: number;
  level: RiskLevel;
  computedLevel: RiskLevel;
  reasons: string[];
  components: { base: number; rain: number; reports: number; satellite: number };
}

const clamp01 = (x: number) => Math.max(0, Math.min(1, x));

export function levelForScore(score: number, previous?: RiskLevel | null): RiskLevel {
  let level: RiskLevel = "low";
  if (score >= THRESHOLDS.severe) level = "severe";
  else if (score >= THRESHOLDS.high) level = "high";
  else if (score >= THRESHOLDS.medium) level = "medium";

  // Hysteresis when falling.
  if (previous && levelIndex(previous) > levelIndex(level)) {
    let held: RiskLevel = level;
    for (let i = levelIndex(previous); i > levelIndex(level); i--) {
      const lvl = RISK_LEVELS[i] as Exclude<RiskLevel, "low">;
      if (score >= THRESHOLDS[lvl] - HYSTERESIS) {
        held = lvl;
        break;
      }
    }
    level = held;
  }
  return level;
}

export function computeRisk(input: RiskInput): RiskResult {
  const rainFactor = clamp01(Math.max(input.rain24h / RAIN_24H_FULL_MM, input.rain72h / RAIN_72H_FULL_MM));
  const reportFactor = clamp01(input.reportCount / REPORTS_FULL);
  const sat = clamp01(input.satelliteOverlap ?? 0);
  const components = {
    base: WEIGHTS.base * clamp01(input.baseRisk),
    rain: WEIGHTS.rain * rainFactor,
    reports: WEIGHTS.reports * reportFactor,
    satellite: WEIGHTS.satellite * sat,
  };
  const score = Math.round((components.base + components.rain + components.reports + components.satellite) * 1000) / 1000;
  const computedLevel = levelForScore(score, input.previousLevel);
  let level = computedLevel;
  if (input.overrideLevel && levelIndex(input.overrideLevel) > levelIndex(level)) level = input.overrideLevel;

  const reasons: string[] = [];
  if (input.rain24h >= 1 || input.rain72h >= 1) reasons.push(`Rain ${Math.round(input.rain24h)}mm/24h (${Math.round(input.rain72h)}mm/72h)`);
  if (input.reportCount > 0) reasons.push(`${input.reportCount} water report${input.reportCount > 1 ? "s" : ""} (24h)`);
  if (input.historicallyFlooded) reasons.push("Historically flooded (2022)");
  if (input.baseRisk >= 0.6) reasons.push(`Low-lying terrain (base ${input.baseRisk.toFixed(2)})`);
  else if (input.baseRisk <= 0.25) reasons.push(`High ground (base ${input.baseRisk.toFixed(2)})`);
  if (sat > 0.01) reasons.push(`Satellite: ${Math.round(sat * 100)}% of zone under water${input.satelliteLabel ? ` (${input.satelliteLabel})` : ""}`);
  if (level !== computedLevel) reasons.push(`Operator override: ${level.toUpperCase()}`);
  if (!reasons.length) reasons.push("No warning signs");

  return { score, level, computedLevel, reasons, components };
}
