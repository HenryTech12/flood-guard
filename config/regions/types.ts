// Region configuration types. A region bundles everything that is place-specific:
// map view, zones (polygons + terrain-based base risk), landmarks used by USSD,
// shelters and volunteer home bases. Switch region with the REGION env variable.

export type LngLat = [number, number];

export interface RegionLandmark {
  id: string;
  name: string;
  location: LngLat;
}

export interface RegionZone {
  id: string;
  name: string;
  /** Short name used on USSD screens (max ~14 chars). */
  shortName: string;
  lga: string;
  /** Outer ring, [lng, lat], not closed (the first point is repeated automatically). */
  polygon: LngLat[];
  /**
   * Terrain + historical-flood based risk in [0, 1]. Used as a fallback when
   * public/data/zone_base_risk.json (output of geo/dem_risk.py) is missing.
   */
  baseRisk: number;
  historicallyFlooded: boolean;
  /** Relative population weight for seed data. */
  population: number;
  landmarks: RegionLandmark[];
}

export interface RegionShelter {
  id: string;
  name: string;
  location: LngLat;
  capacity: number;
  occupancy: number;
  contactPhone: string;
}

export interface RegionVolunteer {
  name: string;
  phone: string;
  type: "boat" | "vehicle" | "on_foot" | "medical";
  capacity: number;
  base: LngLat;
  /** The presenter's own volunteer account is not simulated (autopilot ignores it). */
  simulated: boolean;
}

export interface RegionConfig {
  id: string;
  name: string;
  state: string;
  country: string;
  center: LngLat;
  zoom: number;
  bounds: [LngLat, LngLat];
  ussdCode: string;
  smsShortcode: string;
  /** Rainfall replay window (must exist in the rainfall data file). */
  replay: { start: string; end: string; speedSimHoursPerSecond: number };
  /** Data files under public/data (relative names). */
  data: {
    floodExtent: string;
    rainfall: string;
    baseRisk: string;
    basemap: string;
  };
  zones: RegionZone[];
  shelters: RegionShelter[];
  volunteers: RegionVolunteer[];
  /** Phone of the seeded demo resident pre-selected in /sim. */
  demoResidentPhone: string;
  /** Phone of the presenter's (non-simulated) volunteer account. */
  demoVolunteerPhone: string;
}
