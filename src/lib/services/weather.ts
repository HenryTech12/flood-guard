// Live weather (Open-Meteo, free, no API key) + river discharge forecast (Open-Meteo
// GloFAS flood API) and reverse geocoding (OpenStreetMap Nominatim). Everything is cached
// briefly and falls back gracefully when the network is unavailable, so the demo never
// breaks on stage.
import type { Sql } from "../db/client";
import { pt } from "../db/client";
import { describeWmo, NIGERIAN_CITIES } from "../core/weatherRisk";
import { getRegion } from "../../../config/regions";

export interface Weather {
  name: string;
  lat: number;
  lon: number;
  temperature: number;
  feelsLike: number;
  humidity: number;
  pressure: number;
  windSpeed: number;
  windDeg: number;
  clouds: number;
  rainfall: number;
  description: string;
  main: string;
  source: "open-meteo" | "estimate";
  observedAt: string;
}

export interface FloodForecast {
  time: string[];
  riverDischarge: number[];
  riverDischargeMean: number[];
  riverDischargeMax: number[];
  riverDischargeMin: number[];
  source: "open-meteo-glofas";
}

const cache = new Map<string, { at: number; value: unknown }>();
async function cached<T>(key: string, ttlMs: number, fn: () => Promise<T>): Promise<T> {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < ttlMs) return hit.value as T;
  const value = await fn();
  cache.set(key, { at: Date.now(), value });
  return value;
}

async function getJson(url: string, timeoutMs = 5000, headers: Record<string, string> = {}) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: ctrl.signal, headers: { Accept: "application/json", ...headers } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(t);
  }
}

export function cityCoords(name: string) {
  const c = NIGERIAN_CITIES.find((x) => x.name.toLowerCase() === name.toLowerCase());
  return c ? { name: c.name, lat: c.lat, lon: c.lon } : null;
}

/**
 * Offline estimate used when Open-Meteo is unreachable: if the point is in a covered zone
 * and the rainfall replay is running, use the replayed rainfall so the demo stays coherent.
 */
async function estimateWeather(sql: Sql, lat: number, lon: number, name: string): Promise<Weather> {
  let rainfall = 0;
  try {
    const [r] = await sql<{ mm: number }[]>`
      select coalesce(sum(r.mm), 0)::float8 mm from rainfall_readings r
      join zones z on z.id = r.zone_id
      join demo_state d on d.id = 1
      where d.sim_time is not null and ST_DWithin(z.geom::geography, ${pt(sql, [lon, lat])}::geography, 3000)
        and r.ts > d.sim_time - interval '3 hours' and r.ts <= d.sim_time
      group by z.id order by 1 desc limit 1`;
    rainfall = r ? Math.round(r.mm * 10) / 10 : 0;
  } catch {
    /* database not ready — keep 0 */
  }
  const raining = rainfall > 0.5;
  return {
    name,
    lat,
    lon,
    temperature: raining ? 24.5 : 28.4,
    feelsLike: raining ? 26.1 : 32.0,
    humidity: raining ? 92 : 78,
    pressure: raining ? 1006 : 1011,
    windSpeed: raining ? 6.2 : 3.1,
    windDeg: 220,
    clouds: raining ? 96 : 40,
    rainfall,
    description: rainfall > 25 ? "heavy rain" : raining ? "moderate rain" : "partly cloudy",
    main: raining ? "Rain" : "Clouds",
    source: "estimate",
    observedAt: new Date().toISOString(),
  };
}

export async function getWeather(sql: Sql, lat: number, lon: number, name?: string): Promise<Weather> {
  const label = name ?? (await reverseGeocodeShort(sql, lat, lon));
  const key = `w:${lat.toFixed(2)},${lon.toFixed(2)}`;
  try {
    return await cached(key, 5 * 60e3, async () => {
      const u =
        `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
        `&current=temperature_2m,relative_humidity_2m,apparent_temperature,precipitation,weather_code,cloud_cover,pressure_msl,wind_speed_10m,wind_direction_10m` +
        `&wind_speed_unit=ms&timezone=auto`;
      const j = await getJson(u);
      const c = j.current;
      const w = describeWmo(Number(c.weather_code));
      return {
        name: label,
        lat,
        lon,
        temperature: c.temperature_2m,
        feelsLike: c.apparent_temperature,
        humidity: c.relative_humidity_2m,
        pressure: Math.round(c.pressure_msl),
        windSpeed: c.wind_speed_10m,
        windDeg: c.wind_direction_10m,
        clouds: c.cloud_cover,
        rainfall: c.precipitation ?? 0,
        description: w.description,
        main: w.main,
        source: "open-meteo",
        observedAt: c.time ? new Date(c.time).toISOString() : new Date().toISOString(),
      } satisfies Weather;
    });
  } catch {
    return estimateWeather(sql, lat, lon, label);
  }
}

export async function getFloodForecast(lat: number, lon: number): Promise<FloodForecast | null> {
  try {
    return await cached(`f:${lat.toFixed(2)},${lon.toFixed(2)}`, 30 * 60e3, async () => {
      const u = `https://flood-api.open-meteo.com/v1/flood?latitude=${lat}&longitude=${lon}&daily=river_discharge,river_discharge_mean,river_discharge_max,river_discharge_min&forecast_days=7`;
      const j = await getJson(u);
      const d = j.daily ?? {};
      return {
        time: d.time ?? [],
        riverDischarge: d.river_discharge ?? [],
        riverDischargeMean: d.river_discharge_mean ?? [],
        riverDischargeMax: d.river_discharge_max ?? [],
        riverDischargeMin: d.river_discharge_min ?? [],
        source: "open-meteo-glofas",
      } satisfies FloodForecast;
    });
  } catch {
    return null;
  }
}

/** Nearest landmark / zone name from our own data (offline fallback). */
async function localPlaceName(sql: Sql, lat: number, lon: number): Promise<string | null> {
  try {
    const [l] = await sql<{ landmark: string; zone: string; d: number }[]>`
      select l.name landmark, z.name zone, ST_Distance(l.geom::geography, ${pt(sql, [lon, lat])}::geography) d
      from landmarks l join zones z on z.id = l.zone_id order by d limit 1`;
    const region = getRegion();
    if (l && l.d < 1500) return `Near ${l.landmark}, ${l.zone}, ${region.name}`;
    if (l && l.d < 5000) return `${l.zone}, ${region.name}`;
  } catch {
    /* ignore */
  }
  return null;
}

/** "Suburb, City, State" for a coordinate (Nominatim), falling back to our landmarks. */
export async function reverseGeocode(sql: Sql, lat: number, lon: number): Promise<string> {
  try {
    return await cached(`g:${lat.toFixed(4)},${lon.toFixed(4)}`, 24 * 3600e3, async () => {
      const j = await getJson(`https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=json&accept-language=en&zoom=16`, 4000, {
        "User-Agent": "FloodGuard/1.0 (flood early warning and rescue)",
      });
      const a = j.address ?? {};
      const parts = [a.suburb ?? a.neighbourhood ?? a.quarter ?? a.village, a.city ?? a.town ?? a.county, a.state].filter(Boolean);
      if (!parts.length) throw new Error("no address");
      return parts.join(", ");
    });
  } catch {
    return (await localPlaceName(sql, lat, lon)) ?? `${lat.toFixed(4)}, ${lon.toFixed(4)}`;
  }
}

async function reverseGeocodeShort(sql: Sql, lat: number, lon: number) {
  const full = await reverseGeocode(sql, lat, lon);
  return full.split(",").slice(0, 2).join(",").replace(/^Near /, "").trim();
}
