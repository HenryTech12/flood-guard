// Live-weather flood risk (ported from the Guardy citizen portal, made pure + testable).
//
//   river discharge  >1000 m³/s +50 · >500 +35 · >200 +20 · >50 +10 · rising 3 days & >100 +15
//   rainfall (1h)    >50 mm +30 · >25 +20 · >10 +10
//   humidity         >85 % +10 · >70 % +5
//   condition        thunderstorm +15 · rain +10
//   pressure         <1000 hPa +5
//   level            ≥80 critical · ≥60 high · ≥40 moderate · ≥20 low · else safe
// Each point is reported as a contributing factor.

export type WeatherRiskLevel = "safe" | "low" | "moderate" | "high" | "critical";

export interface WeatherSnapshot {
  rainfall: number;
  humidity: number;
  pressure: number;
  condition: string;
  /** Daily river discharge forecast (m³/s), today first. */
  riverDischarge?: number[];
  riverDischargeMax?: number[];
}

export interface WeatherRisk {
  level: WeatherRiskLevel;
  percentage: number;
  message: string;
  factors: string[];
  riverDischarge?: number;
  riverDischargeMax?: number;
}

export const RISK_MESSAGES: Record<WeatherRiskLevel, string> = {
  critical: "CRITICAL FLOOD RISK! Evacuate immediately if instructed.",
  high: "High flood risk. Stay alert and prepare for evacuation.",
  moderate: "Moderate flood risk. Monitor weather and river levels closely.",
  low: "Low flood risk. Stay informed about updates.",
  safe: "No flood risk detected. Conditions are normal.",
};

export function calculateWeatherRisk(d: WeatherSnapshot): WeatherRisk {
  const factors: string[] = [];
  let score = 0;
  const q = d.riverDischarge ?? [];
  const riverDischarge = q.length ? q[0] : undefined;
  const riverDischargeMax = d.riverDischargeMax?.length ? d.riverDischargeMax[0] : undefined;

  if (riverDischarge !== undefined) {
    if (riverDischarge > 1000) (score += 50), factors.push("Extreme river discharge");
    else if (riverDischarge > 500) (score += 35), factors.push("Very high river discharge");
    else if (riverDischarge > 200) (score += 20), factors.push("High river discharge");
    else if (riverDischarge > 50) (score += 10), factors.push("Elevated river discharge");
    if (q.length >= 3 && q[1] > q[0] && q[2] > q[1] && riverDischarge > 100) (score += 15), factors.push("Rising river levels");
  }

  if (d.rainfall > 50) (score += 30), factors.push("Extreme rainfall");
  else if (d.rainfall > 25) (score += 20), factors.push("Heavy rainfall");
  else if (d.rainfall > 10) (score += 10), factors.push("Moderate rainfall");

  if (d.humidity > 85) (score += 10), factors.push("Very high humidity");
  else if (d.humidity > 70) (score += 5), factors.push("High humidity");

  const c = d.condition.toLowerCase();
  if (c.includes("thunderstorm")) (score += 15), factors.push("Thunderstorm");
  else if (c.includes("rain") || c.includes("drizzle") || c.includes("shower")) (score += 10), factors.push("Rainy weather");

  if (d.pressure > 0 && d.pressure < 1000) (score += 5), factors.push("Low pressure");

  const level: WeatherRiskLevel = score >= 80 ? "critical" : score >= 60 ? "high" : score >= 40 ? "moderate" : score >= 20 ? "low" : "safe";
  if (!factors.length) factors.push("Normal weather conditions");
  return { level, percentage: Math.min(score, 100), message: RISK_MESSAGES[level], factors, riverDischarge, riverDischargeMax };
}

/** Severity of a flood event derived from current weather (Guardy thresholds). */
export function weatherEventSeverity(rainfall: number, condition: string): "low" | "medium" | "high" | null {
  const c = condition.toLowerCase();
  const severity = rainfall > 50 || c.includes("thunderstorm") ? "high" : rainfall > 25 || c.includes("rain") ? "medium" : "low";
  // Only heavy rain or storms become flood events.
  return rainfall > 10 || severity === "high" ? severity : null;
}

/** WMO weather interpretation codes (Open-Meteo) → description + group. */
export function describeWmo(code: number): { description: string; main: string } {
  const m: [number[], string, string][] = [
    [[0], "clear sky", "Clear"],
    [[1], "mainly clear", "Clear"],
    [[2], "partly cloudy", "Clouds"],
    [[3], "overcast clouds", "Clouds"],
    [[45, 48], "fog", "Fog"],
    [[51, 53, 55, 56, 57], "drizzle", "Drizzle"],
    [[61], "light rain", "Rain"],
    [[63], "moderate rain", "Rain"],
    [[65], "heavy rain", "Rain"],
    [[66, 67], "freezing rain", "Rain"],
    [[80, 81], "rain showers", "Rain"],
    [[82], "violent rain showers", "Rain"],
    [[95], "thunderstorm", "Thunderstorm"],
    [[96, 99], "thunderstorm with hail", "Thunderstorm"],
  ];
  for (const [codes, description, main] of m) if (codes.includes(code)) return { description, main };
  return { description: "unknown", main: "Unknown" };
}

export const NIGERIAN_CITIES = [
  { name: "Lagos", lat: 6.5244, lon: 3.3792 },
  { name: "Abuja", lat: 9.0765, lon: 7.3986 },
  { name: "Port Harcourt", lat: 4.8156, lon: 7.0498 },
  { name: "Kano", lat: 12.0022, lon: 8.592 },
  { name: "Ibadan", lat: 7.3775, lon: 3.947 },
  { name: "Kaduna", lat: 10.5105, lon: 7.4165 },
  { name: "Lokoja", lat: 7.8023, lon: 6.7333 },
] as const;
