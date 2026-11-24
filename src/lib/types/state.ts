// Shapes shared between /api/state, /api/timeline and the dashboard.
import type { Hotspot } from "../core/hotspots";
import type { Lang, LngLat, LocationSource, Reason, RequestStatus, RiskLevel, VolunteerType, VulnerableType } from "../core/types";

export interface ZoneState {
  id: string;
  name: string;
  shortName: string;
  level: RiskLevel;
  score: number;
  reasons: string[];
  rain24h: number;
  rain72h: number;
  baseRisk: number;
  override: RiskLevel | null;
  geometry: { type: "Polygon"; coordinates: number[][][] };
  centroid: LngLat;
  residents: number;
  vulnerableHouseholds: number;
}

export interface RequestState {
  id: string;
  ref: string;
  phoneMasked: string;
  name: string | null;
  lngLat: LngLat;
  locationSource: LocationSource;
  landmark: string | null;
  zoneId: string | null;
  people: number;
  vulnerable: { type: VulnerableType; count: number }[];
  vulnerableFlag: boolean;
  message: string | null;
  channel: string;
  urgency: number;
  reasons: Reason[];
  status: RequestStatus;
  insideFlood: boolean;
  createdAt: string;
  updatedAt: string;
  rescuedAt: string | null;
  assignedVolunteerId: string | null;
  offer: { volunteerId: string; expiresAt: string; operatorAssigned: boolean } | null;
  mergedCount: number;
  failedAttempts: number;
  closeReason: string | null;
  registered: boolean;
}

export interface VolunteerState {
  id: string;
  name: string;
  type: VolunteerType;
  capacity: number;
  lngLat: LngLat | null;
  available: boolean;
  status: "idle" | "offered" | "on_job" | "off";
  jobRequestId: string | null;
  arrived: boolean;
  simulated: boolean;
  lastSeenAt: string | null;
}

export interface ShelterState {
  id: string;
  name: string;
  lngLat: LngLat;
  capacity: number;
  occupancy: number;
  phone: string;
}

export interface ReportState {
  id: string;
  lngLat: LngLat;
  type: string;
  depthCm: number | null;
  description: string | null;
  photoUrl: string | null;
  verification: "unverified" | "consistent" | "suspicious";
  verificationReason: string | null;
  createdAt: string;
  zoneId: string | null;
  channel: string;
}

export interface LiveState {
  serverTime: string;
  region: { id: string; name: string; state: string; center: LngLat; zoom: number; bounds: [LngLat, LngLat]; ussdCode: string; smsShortcode: string };
  demo: {
    enabled: boolean;
    simTime: string | null;
    replayRunning: boolean;
    replayStart: string | null;
    replayEnd: string | null;
    autopilot: boolean;
    moveVolunteers: boolean;
    autoAlerts: boolean;
    demoStartedAt: string;
  };
  zones: ZoneState[];
  requests: RequestState[];
  volunteers: VolunteerState[];
  shelters: ShelterState[];
  reports: ReportState[];
  checkins: { id: string; lngLat: LngLat | null; name: string | null; createdAt: string; channel: string }[];
  vulnerableHomes: { residentId: string; lngLat: LngLat; zoneId: string; name: string | null; summary: string }[];
  stats: { waiting: number; offered: number; assigned: number; enRoute: number; rescued: number; cancelled: number; safeCheckins: number; avgAcceptSec: number | null; avgRescueMin: number | null; total: number };
  hotspots: Hotspot[];
  alerts: { id: string; zoneId: string | null; level: string; language: string; channel: string; sentCount: number; fallbackFrom: string | null; createdAt: string }[];
  languageStatus: Record<Lang, string>;
  floodExtentObservedAt: string | null;
  floodExtentSynthetic: boolean;
}

export interface TimelineData {
  start: string;
  end: string;
  requests: { id: string; createdAt: string; history: { status: RequestStatus; at: string }[] }[];
  tracks: { volunteerId: string; points: { lngLat: LngLat; at: string }[] }[];
  zones: { zoneId: string; level: RiskLevel; at: string }[];
  jobs: { requestId: string; volunteerId: string; acceptedAt: string | null; endedAt: string | null }[];
}
