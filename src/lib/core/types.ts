export type LngLat = [number, number];

export const RISK_LEVELS = ["low", "medium", "high", "severe"] as const;
export type RiskLevel = (typeof RISK_LEVELS)[number];

export const LANGS = ["en", "pcm", "ha", "yo", "ig"] as const;
export type Lang = (typeof LANGS)[number];

export const LANG_NAMES: Record<Lang, string> = {
  en: "English",
  pcm: "Pidgin",
  ha: "Hausa",
  yo: "Yoruba",
  ig: "Igbo",
};

export const VULNERABLE_TYPES = ["elderly", "disabled", "pregnant", "child_under5", "bedridden", "other"] as const;
export type VulnerableType = (typeof VULNERABLE_TYPES)[number];

export const VOLUNTEER_TYPES = ["boat", "vehicle", "on_foot", "medical"] as const;
export type VolunteerType = (typeof VOLUNTEER_TYPES)[number];

export const REQUEST_STATUSES = ["new", "assigned", "en_route", "rescued", "cancelled", "duplicate"] as const;
export type RequestStatus = (typeof REQUEST_STATUSES)[number];
export const OPEN_STATUSES: RequestStatus[] = ["new", "assigned", "en_route"];

export const LOCATION_SOURCES = ["registered", "ussd_landmark", "gps", "zone_centroid", "unknown"] as const;
export type LocationSource = (typeof LOCATION_SOURCES)[number];

export const REPORT_TYPES = ["water_level", "road_blocked", "drain_blocked", "other"] as const;
export type ReportType = (typeof REPORT_TYPES)[number];

/** A single explainable contribution to a score. */
export interface Reason {
  label: string;
  points: number;
}

export function levelIndex(l: RiskLevel | null | undefined): number {
  return l ? RISK_LEVELS.indexOf(l) : -1;
}

export function maxLevel(a: RiskLevel, b: RiskLevel | null | undefined): RiskLevel {
  return levelIndex(b) > levelIndex(a) ? (b as RiskLevel) : a;
}

export function isLang(x: unknown): x is Lang {
  return typeof x === "string" && (LANGS as readonly string[]).includes(x);
}
