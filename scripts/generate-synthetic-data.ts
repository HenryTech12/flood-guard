/**
 * Generates SYNTHETIC stand-ins for the Earth Engine outputs so the demo works from a
 * clean clone without an Earth Engine account:
 *
 *   public/data/zones.geojson              zone polygons (input for /geo scripts)
 *   public/data/flood_extent_2022.geojson  stand-in for geo/sentinel1_flood.py
 *   public/data/imerg_2022_zones.json      stand-in for geo/imerg.py
 *   public/data/zone_base_risk.json        stand-in for geo/dem_risk.py
 *   public/data/basemap_lokoja.geojson     approximate offline basemap (rivers, roads)
 *
 * Every synthetic file carries "synthetic": true. Run the /geo scripts with your own
 * Earth Engine project to replace them with real satellite-derived data.
 *
 *   npx tsx scripts/generate-synthetic-data.ts
 */
import fs from "node:fs";
import path from "node:path";
import { getRegion } from "../config/regions";
import { ringCentroid } from "../src/lib/core/geo";

const region = getRegion();
const OUT = path.join(process.cwd(), "public", "data");
fs.mkdirSync(OUT, { recursive: true });

function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = mulberry32(2022);
const write = (name: string, data: unknown) => {
  fs.writeFileSync(path.join(OUT, name), JSON.stringify(data, null, name.endsWith(".geojson") ? 0 : 1) + "\n");
  console.log("wrote", name);
};
const r5 = (x: number) => Math.round(x * 1e5) / 1e5;

// ---------- zones ----------
const closed = (ring: number[][]) => [...ring, ring[0]];
write("zones.geojson", {
  type: "FeatureCollection",
  features: region.zones.map((z) => ({
    type: "Feature",
    properties: { id: z.id, name: z.name, lga: z.lga },
    geometry: { type: "Polygon", coordinates: [closed(z.polygon)] },
  })),
});

// ---------- river (approximate Niger + Benue around the confluence) ----------
// West bank of the Niger as [lat, lng] knots, used for both river polygon and flood band.
const WEST_BANK: [number, number][] = [
  [7.9, 6.772],
  [7.86, 6.768],
  [7.83, 6.766],
  [7.8, 6.768],
  [7.77, 6.771],
  [7.74, 6.773],
  [7.7, 6.775],
];
function westBankLng(lat: number): number {
  for (let i = 0; i < WEST_BANK.length - 1; i++) {
    const [la0, lo0] = WEST_BANK[i];
    const [la1, lo1] = WEST_BANK[i + 1];
    if (lat <= la0 && lat >= la1) return lo0 + ((lo1 - lo0) * (la0 - lat)) / (la0 - la1);
  }
  return lat > WEST_BANK[0][0] ? WEST_BANK[0][1] : WEST_BANK[WEST_BANK.length - 1][1];
}
const river = [
  ...WEST_BANK.map(([la, lo]) => [lo, la]),
  [6.793, 7.7],
  [6.792, 7.74],
  [6.79, 7.77],
  [6.792, 7.8],
  [6.8, 7.808],
  [6.85, 7.815],
  [6.9, 7.82],
  [6.9, 7.835],
  [6.85, 7.832],
  [6.8, 7.828],
  [6.782, 7.835],
  [6.779, 7.86],
  [6.782, 7.9],
];

// ---------- flood extent (band of land west of the Niger bank) ----------
// Width (degrees of longitude) of the flooded strip by latitude, wider in the
// historically worst-hit riverside areas (Ganaja, Adankolo, Gadumo/Kpata, Felele).
function floodWidth(lat: number): number {
  const bumps = [
    { c: 7.752, w: 0.016, s: 0.014 }, // Ganaja
    { c: 7.782, w: 0.013, s: 0.01 }, // Adankolo
    { c: 7.802, w: 0.012, s: 0.008 }, // Gadumo/Kpata
    { c: 7.826, w: 0.004, s: 0.008 }, // Kabawa (narrow)
    { c: 7.853, w: 0.01, s: 0.01 }, // Felele
  ];
  let w = 0.0015;
  for (const b of bumps) w = Math.max(w, b.w * Math.exp(-(((lat - b.c) / b.s) ** 2)));
  return w;
}
const latN = 7.868,
  latS = 7.737;
const westEdge: number[][] = [];
const bankEdge: number[][] = [];
for (let lat = latN; lat >= latS - 1e-9; lat -= 0.0015) {
  const noise = (rand() - 0.5) * 0.0018;
  const bank = westBankLng(lat) + 0.0006; // touches the permanent river
  westEdge.push([r5(bank - floodWidth(lat) + noise), r5(lat)]);
  bankEdge.push([r5(bank), r5(lat)]);
}
const floodRing = [...bankEdge, ...westEdge.reverse()];
floodRing.push(floodRing[0]);
// A second, smaller flooded pocket on the Benue's north bank.
const benue: number[][] = [];
for (let k = 0; k <= 24; k++) {
  const t = (k / 24) * 2 * Math.PI;
  const rr = 1 + (rand() - 0.5) * 0.35;
  benue.push([r5(6.822 + 0.012 * rr * Math.cos(t)), r5(7.8385 + 0.004 * rr * Math.sin(t))]);
}
benue.push(benue[0]);

write("flood_extent_2022.geojson", {
  type: "FeatureCollection",
  synthetic: true,
  source: "SYNTHETIC stand-in for geo/sentinel1_flood.py (Sentinel-1 VV change detection). Replace by running the script.",
  observed_at: "2022-10-10T05:30:00Z",
  pre_window: ["2022-01-15", "2022-03-15"],
  flood_window: ["2022-10-05", "2022-10-20"],
  features: [
    {
      type: "Feature",
      properties: { id: "s1-2022-10", label: "Sentinel-1 flood extent, 10 Oct 2022 (synthetic)" },
      geometry: { type: "MultiPolygon", coordinates: [[floodRing], [benue]] },
    },
  ],
});

// ---------- IMERG-like rainfall (3-hourly mm per zone) ----------
const START = Date.parse("2022-09-20T00:00:00Z");
const END = Date.parse("2022-10-16T00:00:00Z");
const STEP_H = 3;
const storms = [
  { t: Date.parse("2022-09-27T15:00:00Z"), peak: 9, dur: 12 },
  { t: Date.parse("2022-10-02T06:00:00Z"), peak: 16, dur: 18 },
  { t: Date.parse("2022-10-03T09:00:00Z"), peak: 12, dur: 15 },
  { t: Date.parse("2022-10-09T18:00:00Z"), peak: 10, dur: 12 },
];
const zoneFactor: Record<string, number> = {};
region.zones.forEach((z, i) => (zoneFactor[z.id] = 0.88 + ((i * 37) % 25) / 100));
const series: Record<string, number[]> = {};
for (const z of region.zones) series[z.id] = [];
for (let t = START; t < END; t += STEP_H * 3600e3) {
  let base = rand() < 0.25 ? rand() * 2.5 : 0;
  for (const s of storms) base += s.peak * Math.exp(-(((t - s.t) / (s.dur * 3600e3 * 0.5)) ** 2));
  for (const z of region.zones) series[z.id].push(Math.round(base * zoneFactor[z.id] * (0.9 + rand() * 0.2) * 10) / 10);
}
write("imerg_2022_zones.json", {
  synthetic: true,
  source: "SYNTHETIC stand-in for geo/imerg.py (NASA GPM IMERG V07, zone-mean accumulations). Replace by running the script.",
  units: "mm per interval",
  interval_hours: STEP_H,
  start: new Date(START).toISOString(),
  zones: series,
});

// ---------- base risk ----------
write("zone_base_risk.json", {
  synthetic: true,
  source: "SYNTHETIC stand-in for geo/dem_risk.py (Copernicus GLO-30 DEM + 2022 flood overlap). Values are the hand-set config values.",
  method: "base = 0.4·(1 − elev_norm) + 0.2·flatness + 0.4·flood_overlap_2022",
  zones: Object.fromEntries(
    region.zones.map((z) => [z.id, { base_risk_score: z.baseRisk, mean_elevation_m: Math.round(45 + (1 - z.baseRisk) * 90), mean_slope_deg: Math.round((0.5 + (1 - z.baseRisk) * 7) * 10) / 10, historically_flooded: z.historicallyFlooded }]),
  ),
});

// ---------- offline basemap ----------
const roads: [string, number[][]][] = [
  ["Lokoja–Abuja Road", [[6.744, 7.79], [6.746, 7.82], [6.748, 7.85], [6.752, 7.875], [6.76, 7.9]]],
  ["Ganaja Road", [[6.744, 7.79], [6.746, 7.77], [6.748, 7.75], [6.752, 7.73]]],
  ["Lokongoma Road", [[6.744, 7.79], [6.73, 7.785], [6.715, 7.775], [6.7, 7.77]]],
  ["Marine Road", [[6.744, 7.8], [6.756, 7.804], [6.765, 7.806]]],
  ["GRA Road", [[6.744, 7.808], [6.73, 7.815], [6.715, 7.825]]],
];
write("basemap_lokoja.geojson", {
  type: "FeatureCollection",
  synthetic: true,
  source: "Approximate hand-drawn offline basemap for when online tiles are unavailable. Not survey-accurate.",
  features: [
    { type: "Feature", properties: { kind: "water", name: "River Niger / Benue (approx.)" }, geometry: { type: "Polygon", coordinates: [closed(river)] } },
    ...roads.map(([name, coords]) => ({ type: "Feature", properties: { kind: "road", name }, geometry: { type: "LineString", coordinates: coords } })),
    {
      type: "Feature",
      properties: { kind: "hill", name: "Mount Patti" },
      geometry: { type: "Point", coordinates: ringCentroid(region.zones.find((z) => z.id === "patti")?.polygon ?? [[6.72, 7.82]]) },
    },
  ],
});
