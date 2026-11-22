// Safe route from a point to the nearest shelter with space, avoiding flood polygons.
// Uses OpenRouteService (avoid_polygons) when ORS_API_KEY is set; otherwise a straight
// line, flagged if it crosses flooded areas.
import type { Sql } from "../db/client";
import { haversineM, lineCrossesGeometry, type PolyGeometry } from "../core/geo";
import type { LngLat } from "../core/types";
import { env } from "../env";
import { nearestShelters } from "./reference";

export interface SafeRoute {
  method: "openrouteservice" | "straight_line";
  shelter: { id: string; name: string; lngLat: LngLat; space: number } | null;
  geometry: { type: "LineString"; coordinates: number[][] } | null;
  distanceM: number | null;
  durationMin: number | null;
  warnings: string[];
}

async function floodGeometry(sql: Sql): Promise<PolyGeometry | null> {
  const [r] = await sql<{ g: string | null }[]>`
    select ST_AsGeoJSON(ST_SimplifyPreserveTopology(ST_Union(geom), 0.0003), 5) g from flood_extents where active`;
  return r?.g ? (JSON.parse(r.g) as PolyGeometry) : null;
}

export async function safeRoute(sql: Sql, from: LngLat, profile: "foot-walking" | "driving-car" = "foot-walking"): Promise<SafeRoute> {
  const [sh] = await nearestShelters(sql, from, { needSpace: 1, limit: 1 });
  if (!sh) return { method: "straight_line", shelter: null, geometry: null, distanceM: null, durationMin: null, warnings: ["No shelter with space"] };
  const shelter = { id: sh.id, name: sh.name, lngLat: sh.location, space: sh.capacity - sh.occupancy };
  const flood = await floodGeometry(sql);
  const warnings: string[] = [];

  if (env.orsApiKey) {
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 5000);
      const body: Record<string, unknown> = { coordinates: [from, sh.location], instructions: false };
      if (flood) body.options = { avoid_polygons: flood };
      const res = await fetch(`https://api.openrouteservice.org/v2/directions/${profile}/geojson`, {
        method: "POST",
        signal: ctrl.signal,
        headers: { Authorization: env.orsApiKey, "Content-Type": "application/json", Accept: "application/geo+json" },
        body: JSON.stringify(body),
      });
      clearTimeout(t);
      if (res.ok) {
        const json = await res.json();
        const f = json?.features?.[0];
        if (f?.geometry) {
          return {
            method: "openrouteservice",
            shelter,
            geometry: f.geometry,
            distanceM: Math.round(f.properties?.summary?.distance ?? 0),
            durationMin: Math.round((f.properties?.summary?.duration ?? 0) / 60),
            warnings,
          };
        }
      }
      warnings.push(`Routing service returned ${res.status}; showing straight line`);
    } catch (e) {
      warnings.push(`Routing unavailable (${(e as Error).name}); showing straight line`);
    }
  } else {
    warnings.push("No ORS_API_KEY: straight-line guide only, not a road route");
  }

  const crosses = lineCrossesGeometry(from, sh.location, flood);
  if (crosses) warnings.push("Straight line crosses flooded area — use a boat or ask a responder");
  const d = haversineM(from, sh.location);
  return { method: "straight_line", shelter, geometry: { type: "LineString", coordinates: [from, sh.location] }, distanceM: Math.round(d), durationMin: Math.round(d / 75), warnings };
}
