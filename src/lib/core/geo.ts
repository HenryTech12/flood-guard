// Small, dependency-free geo helpers (safe to use in client bundles).
import type { LngLat } from "./types";

const R = 6371008.8; // mean Earth radius (m)
const rad = (d: number) => (d * Math.PI) / 180;
const deg = (r: number) => (r * 180) / Math.PI;

export function haversineM(a: LngLat, b: LngLat): number {
  const dLat = rad(b[1] - a[1]);
  const dLng = rad(b[0] - a[0]);
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a[1])) * Math.cos(rad(b[1])) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(s)));
}

/** Ray-casting point-in-ring test. Ring may or may not be closed. */
export function pointInRing(pt: LngLat, ring: number[][]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    const intersect = yi > pt[1] !== yj > pt[1] && pt[0] < ((xj - xi) * (pt[1] - yi)) / (yj - yi) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

export function pointInPolygon(pt: LngLat, rings: number[][][]): boolean {
  if (!rings.length || !pointInRing(pt, rings[0])) return false;
  for (let k = 1; k < rings.length; k++) if (pointInRing(pt, rings[k])) return false;
  return true;
}

export type PolyGeometry =
  | { type: "Polygon"; coordinates: number[][][] }
  | { type: "MultiPolygon"; coordinates: number[][][][] };

export function pointInGeometry(pt: LngLat, g: PolyGeometry | null | undefined): boolean {
  if (!g) return false;
  if (g.type === "Polygon") return pointInPolygon(pt, g.coordinates);
  return g.coordinates.some((p) => pointInPolygon(pt, p));
}

export function ringCentroid(ring: number[][]): LngLat {
  // Area-weighted centroid; falls back to vertex mean for degenerate rings.
  let a = 0,
    cx = 0,
    cy = 0;
  const n = ring.length;
  for (let i = 0; i < n; i++) {
    const [x0, y0] = ring[i];
    const [x1, y1] = ring[(i + 1) % n];
    const f = x0 * y1 - x1 * y0;
    a += f;
    cx += (x0 + x1) * f;
    cy += (y0 + y1) * f;
  }
  if (Math.abs(a) < 1e-12) {
    const sx = ring.reduce((s, p) => s + p[0], 0);
    const sy = ring.reduce((s, p) => s + p[1], 0);
    return [sx / n, sy / n];
  }
  return [cx / (3 * a), cy / (3 * a)];
}

export function bearing(a: LngLat, b: LngLat): number {
  const y = Math.sin(rad(b[0] - a[0])) * Math.cos(rad(b[1]));
  const x = Math.cos(rad(a[1])) * Math.sin(rad(b[1])) - Math.sin(rad(a[1])) * Math.cos(rad(b[1])) * Math.cos(rad(b[0] - a[0]));
  return (deg(Math.atan2(y, x)) + 360) % 360;
}

/** Move `meters` from `from` towards `to` (clamped at `to`). */
export function moveToward(from: LngLat, to: LngLat, meters: number): LngLat {
  const d = haversineM(from, to);
  if (d <= meters || d === 0) return [to[0], to[1]];
  const t = meters / d;
  return [from[0] + (to[0] - from[0]) * t, from[1] + (to[1] - from[1]) * t];
}

/** Sample a straight segment every `stepM` metres (inclusive of ends). */
export function sampleSegment(a: LngLat, b: LngLat, stepM = 50): LngLat[] {
  const d = haversineM(a, b);
  const n = Math.max(1, Math.ceil(d / stepM));
  const out: LngLat[] = [];
  for (let i = 0; i <= n; i++) out.push([a[0] + ((b[0] - a[0]) * i) / n, a[1] + ((b[1] - a[1]) * i) / n]);
  return out;
}

export function lineCrossesGeometry(a: LngLat, b: LngLat, g: PolyGeometry | null | undefined): boolean {
  if (!g) return false;
  return sampleSegment(a, b, 40).some((p) => pointInGeometry(p, g));
}

/** Approximate circle polygon (for hotspot rings). */
export function circlePolygon(center: LngLat, radiusM: number, steps = 48): number[][] {
  const out: number[][] = [];
  const dLat = deg(radiusM / R);
  const dLng = dLat / Math.cos(rad(center[1]));
  for (let i = 0; i <= steps; i++) {
    const t = (i / steps) * 2 * Math.PI;
    out.push([center[0] + dLng * Math.cos(t), center[1] + dLat * Math.sin(t)]);
  }
  return out;
}

export function formatDistance(m: number): string {
  return m < 1000 ? `${Math.round(m)} m` : `${(m / 1000).toFixed(1)} km`;
}
