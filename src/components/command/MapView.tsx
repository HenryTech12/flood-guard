"use client";
import maplibregl, { type GeoJSONSource, type Map as MLMap, type StyleSpecification } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { useEffect, useRef, useState } from "react";
import { getRegion } from "../../../config/regions";
import { circlePolygon, pointInRing } from "@/lib/core/geo";
import type { LngLat } from "@/lib/core/types";
import type { LiveState, RequestState, VolunteerState } from "@/lib/types/state";
import { LEVEL_COLOR, urgencyColor, VOL_ICON } from "../ui";

export interface Layers {
  flood: boolean;
  rain: boolean;
  zones: boolean;
  requests: boolean;
  volunteers: boolean;
  shelters: boolean;
  reports: boolean;
  checkins: boolean;
  vulnerable: boolean;
  hotspots: boolean;
  route: boolean;
}

export const DEFAULT_LAYERS: Layers = { flood: true, rain: true, zones: true, requests: true, volunteers: true, shelters: true, reports: true, checkins: true, vulnerable: false, hotspots: true, route: true };

interface Props {
  view: LiveState;
  layers: Layers;
  selectedRequestId: string | null;
  onSelectRequest: (id: string | null) => void;
  onSelectZone: (id: string | null) => void;
  route: { type: "LineString"; coordinates: number[][] } | null;
  pickMode: boolean;
  onPick: (p: LngLat) => void;
  flyTo: { center: LngLat; zoom?: number; key: number } | null;
}

const FC = (features: GeoJSON.Feature[]): GeoJSON.FeatureCollection => ({ type: "FeatureCollection", features });

function baseStyle(): StyleSpecification {
  const region = getRegion();
  return {
    version: 8,
    sources: {
      offline: { type: "geojson", data: `/data/${region.data.basemap}` },
      carto: {
        type: "raster",
        tiles: ["a", "b", "c", "d"].map((s) => `https://${s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}@2x.png`),
        tileSize: 256,
        maxzoom: 19,
        attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors © <a href="https://carto.com/attributions">CARTO</a>',
      },
    },
    layers: [
      { id: "bg", type: "background", paint: { "background-color": "#eef5fd" } },
      // Offline fallback basemap (approximate). Hidden underneath the raster tiles when online.
      { id: "offline-water", type: "fill", source: "offline", filter: ["==", ["get", "kind"], "water"], paint: { "fill-color": "#a9d4f5" } },
      { id: "offline-roads", type: "line", source: "offline", filter: ["==", ["get", "kind"], "road"], paint: { "line-color": "#c3cfdc", "line-width": 2.5 } },
      { id: "carto", type: "raster", source: "carto", paint: { "raster-opacity": 1 } },
    ],
  };
}

/** Grid of weighted points inside each zone → rainfall heatmap. */
function rainPoints(view: LiveState): GeoJSON.FeatureCollection {
  const f: GeoJSON.Feature[] = [];
  for (const z of view.zones) {
    if (z.rain24h < 1) continue;
    const ring = z.geometry.coordinates[0];
    const xs = ring.map((p) => p[0]);
    const ys = ring.map((p) => p[1]);
    for (let x = Math.min(...xs); x <= Math.max(...xs); x += 0.0025)
      for (let y = Math.min(...ys); y <= Math.max(...ys); y += 0.0025)
        if (pointInRing([x, y], ring)) f.push({ type: "Feature", properties: { w: Math.min(1.2, z.rain24h / 100) }, geometry: { type: "Point", coordinates: [x, y] } });
  }
  return FC(f);
}

function reqElement(r: RequestState): HTMLDivElement {
  const el = document.createElement("div");
  el.className = "fg-req new-pin";
  el.dataset.id = r.id;
  return el;
}

function styleReq(el: HTMLElement, r: RequestState, selected: boolean) {
  const rescued = r.status === "rescued";
  const closed = r.status === "cancelled" || r.status === "duplicate";
  const color = rescued ? "#22c55e" : closed ? "#64748b" : urgencyColor(r.urgency);
  el.style.backgroundColor = color;
  el.style.color = color;
  el.style.borderColor = r.status === "en_route" || r.status === "assigned" ? "#38bdf8" : "#0f172a";
  el.classList.toggle("vulnerable", r.vulnerableFlag && !rescued && !closed);
  el.classList.toggle("selected", selected);
  el.title = `${r.ref} · urgency ${r.urgency} · ${r.status}`;
  el.style.opacity = closed ? "0.5" : "1";
}

function volElement(v: VolunteerState): HTMLDivElement {
  const el = document.createElement("div");
  el.className = "fg-vol";
  el.textContent = VOL_ICON[v.type] ?? "🧍";
  return el;
}

export default function MapView({ view, layers, selectedRequestId, onSelectRequest, onSelectZone, route, pickMode, onPick, flyTo }: Props) {
  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MLMap | null>(null);
  const [ready, setReady] = useState(false);
  const reqMarkers = useRef(new Map<string, maplibregl.Marker>());
  const volMarkers = useRef(new Map<string, { m: maplibregl.Marker; pos: LngLat; anim?: number }>());
  const shelterMarkers = useRef(new Map<string, maplibregl.Marker>());
  const zoneLabels = useRef(new Map<string, maplibregl.Marker>());
  const vulnMarkers = useRef(new Map<string, maplibregl.Marker>());
  const pickRef = useRef({ pickMode, onPick, onSelectZone, onSelectRequest });
  pickRef.current = { pickMode, onPick, onSelectZone, onSelectRequest };

  // ---- init
  useEffect(() => {
    if (!container.current) return;
    const region = getRegion();
    const map = new maplibregl.Map({
      container: container.current,
      style: baseStyle(),
      center: region.center,
      zoom: region.zoom,
      maxBounds: [
        [region.bounds[0][0] - 0.15, region.bounds[0][1] - 0.15],
        [region.bounds[1][0] + 0.15, region.bounds[1][1] + 0.15],
      ],
      attributionControl: { compact: true },
    });
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "bottom-right");
    map.addControl(new maplibregl.ScaleControl({ unit: "metric" }), "bottom-left");
    map.on("error", (e) => {
      // Tile errors are expected offline; the GeoJSON basemap underneath takes over.
      if ((e as { sourceId?: string }).sourceId === "carto" && map.getLayer("carto")) map.setLayoutProperty("carto", "visibility", "none");
    });
    map.on("load", () => {
      map.addSource("zones", { type: "geojson", data: FC([]) });
      map.addSource("flood", { type: "geojson", data: `/data/${region.data.floodExtent}` });
      map.addSource("rain", { type: "geojson", data: FC([]) });
      map.addSource("lines", { type: "geojson", data: FC([]) });
      map.addSource("route", { type: "geojson", data: FC([]) });
      map.addSource("hotspots", { type: "geojson", data: FC([]) });
      map.addSource("reports", { type: "geojson", data: FC([]) });
      map.addSource("checkins", { type: "geojson", data: FC([]) });

      map.addLayer({
        id: "zones-fill",
        type: "fill",
        source: "zones",
        paint: {
          "fill-color": ["match", ["get", "level"], "severe", LEVEL_COLOR.severe, "high", LEVEL_COLOR.high, "medium", LEVEL_COLOR.medium, LEVEL_COLOR.low],
          "fill-opacity": ["case", ["boolean", ["get", "selected"], false], 0.32, 0.17],
          "fill-opacity-transition": { duration: 800 },
          "fill-color-transition": { duration: 800 },
        },
      });
      map.addLayer({
        id: "zones-line",
        type: "line",
        source: "zones",
        paint: {
          "line-color": ["match", ["get", "level"], "severe", LEVEL_COLOR.severe, "high", LEVEL_COLOR.high, "medium", LEVEL_COLOR.medium, LEVEL_COLOR.low],
          "line-width": ["case", ["boolean", ["get", "selected"], false], 4, 2],
          "line-opacity": 0.9,
        },
      });
      map.addLayer({ id: "flood-fill", type: "fill", source: "flood", paint: { "fill-color": "#2563eb", "fill-opacity": 0.42 } });
      map.addLayer({ id: "flood-line", type: "line", source: "flood", paint: { "line-color": "#60a5fa", "line-width": 1.2, "line-opacity": 0.8 } });
      map.addLayer({
        id: "rain-heat",
        type: "heatmap",
        source: "rain",
        paint: {
          "heatmap-weight": ["get", "w"],
          "heatmap-radius": ["interpolate", ["linear"], ["zoom"], 11, 25, 15, 70],
          "heatmap-intensity": 0.9,
          "heatmap-opacity": 0.55,
          "heatmap-color": ["interpolate", ["linear"], ["heatmap-density"], 0, "rgba(0,0,0,0)", 0.2, "rgba(56,189,248,0.4)", 0.5, "rgba(129,140,248,0.7)", 0.8, "rgba(217,70,239,0.85)", 1, "rgba(250,232,255,0.95)"],
        },
      });
      map.addLayer({ id: "hotspots-fill", type: "fill", source: "hotspots", paint: { "fill-color": "#ef4444", "fill-opacity": 0.12 } });
      map.addLayer({ id: "hotspots-line", type: "line", source: "hotspots", paint: { "line-color": "#f87171", "line-width": 3, "line-dasharray": [2, 1.5] } });
      map.addLayer({
        id: "lines",
        type: "line",
        source: "lines",
        paint: { "line-color": ["match", ["get", "kind"], "offer", "#6886ad", "#0b4ea2"], "line-width": 3, "line-dasharray": [1.5, 1.2], "line-opacity": 0.9 },
      });
      map.addLayer({ id: "route-casing", type: "line", source: "route", paint: { "line-color": "#ffffff", "line-width": 9 } });
      map.addLayer({ id: "route-line", type: "line", source: "route", paint: { "line-color": "#16a34a", "line-width": 5 } });
      map.addLayer({
        id: "reports",
        type: "circle",
        source: "reports",
        paint: {
          "circle-radius": ["interpolate", ["linear"], ["zoom"], 11, 4, 16, 9],
          "circle-color": ["match", ["get", "verification"], "consistent", "#0284c7", "suspicious", "#f97316", "#64748b"],
          "circle-stroke-color": "#ffffff",
          "circle-stroke-width": 2,
        },
      });
      map.addLayer({
        id: "checkins",
        type: "circle",
        source: "checkins",
        paint: { "circle-radius": 6, "circle-color": "#22c55e", "circle-stroke-color": "#ffffff", "circle-stroke-width": 2, "circle-blur": 0.1 },
      });

      map.on("click", (e) => {
        const p = pickRef.current;
        if (p.pickMode) return p.onPick([e.lngLat.lng, e.lngLat.lat]);
        const hit = map.queryRenderedFeatures(e.point, { layers: ["reports"] });
        if (hit.length) return;
        const z = map.queryRenderedFeatures(e.point, { layers: ["zones-fill"] });
        p.onSelectZone(z[0] ? String(z[0].properties?.id) : null);
      });
      map.on("click", "reports", (e) => {
        const f = e.features?.[0];
        if (!f) return;
        const pr = f.properties as Record<string, string>;
        const html = `<div style="max-width:220px"><b>${pr.label}</b><br/><span style="color:#4a6e9a">${pr.when}</span>
          <br/>${pr.description ? pr.description.replace(/</g, "&lt;") : ""}
          ${pr.photo ? `<img src="${pr.photo}" style="margin-top:6px;border-radius:6px;max-width:100%"/>` : ""}
          <div style="margin-top:4px;color:${pr.verification === "consistent" ? "#0284c7" : pr.verification === "suspicious" ? "#ea580c" : "#4a6e9a"}">${pr.verification.toUpperCase()}: ${pr.reason ?? ""}</div></div>`;
        new maplibregl.Popup({ closeButton: true }).setLngLat(e.lngLat).setHTML(html).addTo(map);
      });
      for (const l of ["reports", "zones-fill"]) {
        map.on("mouseenter", l, () => (map.getCanvas().style.cursor = pickRef.current.pickMode ? "crosshair" : "pointer"));
        map.on("mouseleave", l, () => (map.getCanvas().style.cursor = pickRef.current.pickMode ? "crosshair" : ""));
      }
      // Fit all zones into the area not covered by the side panels.
      const pts = region.zones.flatMap((z) => z.polygon);
      const w = container.current?.clientWidth ?? 1600;
      const wide = w > 1100;
      map.fitBounds(
        [
          [Math.min(...pts.map((p) => p[0])) - 0.004, Math.min(...pts.map((p) => p[1])) - 0.002],
          [Math.max(...pts.map((p) => p[0])) + 0.01, Math.max(...pts.map((p) => p[1])) + 0.002],
        ],
        { padding: wide ? { top: 80, bottom: 95, left: 345, right: 445 } : 40, duration: 0 },
      );
      setReady(true);
    });
    mapRef.current = map;
    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    const m = mapRef.current;
    if (m) m.getCanvas().style.cursor = pickMode ? "crosshair" : "";
  }, [pickMode]);

  // ---- fly
  useEffect(() => {
    if (flyTo && mapRef.current) mapRef.current.flyTo({ center: flyTo.center, zoom: flyTo.zoom ?? 15, speed: 1.4 });
  }, [flyTo]);

  // ---- layer visibility
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    const vis = (ids: string[], on: boolean) => ids.forEach((id) => map.getLayer(id) && map.setLayoutProperty(id, "visibility", on ? "visible" : "none"));
    vis(["zones-fill", "zones-line"], layers.zones);
    vis(["flood-fill", "flood-line"], layers.flood);
    vis(["rain-heat"], layers.rain);
    vis(["hotspots-fill", "hotspots-line"], layers.hotspots);
    vis(["reports"], layers.reports);
    vis(["checkins"], layers.checkins);
    vis(["route-line", "route-casing"], layers.route);
    vis(["lines"], layers.volunteers && layers.requests);
  }, [layers, ready]);

  // ---- data → sources and markers
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    const src = (id: string) => map.getSource(id) as GeoJSONSource | undefined;

    src("zones")?.setData(
      FC(view.zones.map((z) => ({ type: "Feature", id: z.id, properties: { id: z.id, level: z.level, selected: false }, geometry: z.geometry }))),
    );
    src("rain")?.setData(rainPoints(view));
    src("hotspots")?.setData(FC(view.hotspots.map((h, i) => ({ type: "Feature", properties: { i, count: h.count }, geometry: { type: "Polygon", coordinates: [circlePolygon(h.center, h.radiusM)] } }))));
    src("reports")?.setData(
      FC(
        view.reports.map((r) => ({
          type: "Feature",
          properties: {
            label: r.type === "water_level" ? `Water ${r.depthCm ? `~${r.depthCm} cm` : "reported"}` : r.type.replace("_", " "),
            verification: r.verification,
            reason: r.verificationReason ?? "",
            description: r.description ?? "",
            photo: r.photoUrl ?? "",
            when: new Date(r.createdAt).toLocaleTimeString(),
          },
          geometry: { type: "Point", coordinates: r.lngLat },
        })),
      ),
    );
    src("checkins")?.setData(FC(view.checkins.filter((c) => c.lngLat).map((c) => ({ type: "Feature", properties: { name: c.name ?? "" }, geometry: { type: "Point", coordinates: c.lngLat! } }))));

    // Assignment lines (volunteer → request).
    const reqBy = new Map(view.requests.map((r) => [r.id, r]));
    src("lines")?.setData(
      FC(
        view.volunteers
          .filter((v) => v.jobRequestId && v.lngLat && reqBy.get(v.jobRequestId))
          .map((v) => ({ type: "Feature", properties: { kind: v.status === "offered" ? "offer" : "job" }, geometry: { type: "LineString", coordinates: [v.lngLat!, reqBy.get(v.jobRequestId!)!.lngLat] } })),
      ),
    );

    // Requests (HTML markers so vulnerable households can pulse).
    const seen = new Set<string>();
    for (const r of layers.requests ? view.requests : []) {
      seen.add(r.id);
      let m = reqMarkers.current.get(r.id);
      if (!m) {
        const el = reqElement(r);
        el.addEventListener("click", (e) => {
          e.stopPropagation();
          pickRef.current.onSelectRequest(r.id);
        });
        m = new maplibregl.Marker({ element: el }).setLngLat(r.lngLat).addTo(map);
        reqMarkers.current.set(r.id, m);
      } else m.setLngLat(r.lngLat);
      styleReq(m.getElement(), r, r.id === selectedRequestId);
    }
    for (const [id, m] of reqMarkers.current) if (!seen.has(id)) (m.remove(), reqMarkers.current.delete(id));

    // Volunteers (animated).
    const vSeen = new Set<string>();
    for (const v of layers.volunteers ? view.volunteers : []) {
      if (!v.lngLat) continue;
      vSeen.add(v.id);
      let entry = volMarkers.current.get(v.id);
      if (!entry) {
        const el = volElement(v);
        const m = new maplibregl.Marker({ element: el }).setLngLat(v.lngLat).addTo(map);
        entry = { m, pos: v.lngLat };
        volMarkers.current.set(v.id, entry);
      } else if (entry.pos[0] !== v.lngLat[0] || entry.pos[1] !== v.lngLat[1]) {
        const from = entry.m.getLngLat();
        const to = v.lngLat;
        const t0 = performance.now();
        const e = entry;
        if (e.anim) cancelAnimationFrame(e.anim);
        const step = (t: number) => {
          const k = Math.min(1, (t - t0) / 1000);
          const ease = k < 0.5 ? 2 * k * k : 1 - (-2 * k + 2) ** 2 / 2;
          e.m.setLngLat([from.lng + (to[0] - from.lng) * ease, from.lat + (to[1] - from.lat) * ease]);
          if (k < 1) e.anim = requestAnimationFrame(step);
        };
        e.anim = requestAnimationFrame(step);
        entry.pos = to;
      }
      const el = entry.m.getElement();
      el.classList.toggle("busy", v.status === "on_job" || v.status === "offered");
      el.classList.toggle("off", v.status === "off");
      el.title = `${v.name} · ${v.type.replace("_", " ")} · ${v.status.replace("_", " ")}${v.arrived ? " (arrived)" : ""}`;
    }
    for (const [id, e] of volMarkers.current) if (!vSeen.has(id)) (e.m.remove(), volMarkers.current.delete(id));

    // Shelters with occupancy bars.
    const sSeen = new Set<string>();
    for (const s of layers.shelters ? view.shelters : []) {
      sSeen.add(s.id);
      let m = shelterMarkers.current.get(s.id);
      if (!m) {
        const el = document.createElement("div");
        el.className = "fg-shelter";
        m = new maplibregl.Marker({ element: el, anchor: "bottom" }).setLngLat(s.lngLat).addTo(map);
        shelterMarkers.current.set(s.id, m);
      }
      const pct = Math.min(100, Math.round((s.occupancy / Math.max(1, s.capacity)) * 100));
      const color = pct > 90 ? "#ef4444" : pct > 70 ? "#f59e0b" : "#22c55e";
      m.getElement().innerHTML = `⛺ ${s.occupancy}<span style="color:#6886ad">/${s.capacity}</span><div class="bar"><div style="width:${pct}%;background:${color}"></div></div>`;
      m.getElement().title = `${s.name} — ${s.occupancy}/${s.capacity} · ${s.phone}`;
    }
    for (const [id, m] of shelterMarkers.current) if (!sSeen.has(id)) (m.remove(), shelterMarkers.current.delete(id));

    // Zone labels.
    const zSeen = new Set<string>();
    for (const z of layers.zones ? view.zones : []) {
      zSeen.add(z.id);
      let m = zoneLabels.current.get(z.id);
      if (!m) {
        const el = document.createElement("div");
        el.className = "fg-zone-label";
        m = new maplibregl.Marker({ element: el }).setLngLat(z.centroid).addTo(map);
        zoneLabels.current.set(z.id, m);
      }
      m.getElement().innerHTML = `${z.shortName}<small style="color:${LEVEL_COLOR[z.level]}">${z.level.toUpperCase()}</small>`;
    }
    for (const [id, m] of zoneLabels.current) if (!zSeen.has(id)) (m.remove(), zoneLabels.current.delete(id));

    // Vulnerable households in high-risk zones (pre-emptive evacuation filter).
    const hSeen = new Set<string>();
    for (const h of layers.vulnerable ? view.vulnerableHomes : []) {
      hSeen.add(h.residentId);
      if (!vulnMarkers.current.has(h.residentId)) {
        const el = document.createElement("div");
        el.className = "fg-vuln-home";
        el.title = `${h.name ?? "Household"}: ${h.summary}`;
        vulnMarkers.current.set(h.residentId, new maplibregl.Marker({ element: el }).setLngLat(h.lngLat).addTo(map));
      }
    }
    for (const [id, m] of vulnMarkers.current) if (!hSeen.has(id)) (m.remove(), vulnMarkers.current.delete(id));
  }, [view, ready, layers, selectedRequestId]);

  // ---- route
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    (map.getSource("route") as GeoJSONSource | undefined)?.setData(FC(route ? [{ type: "Feature", properties: {}, geometry: route }] : []));
  }, [route, ready]);

  // MapLibre sets position:relative on its container, so give it an absolutely positioned parent.
  return (
    <div className="absolute inset-0">
      <div ref={container} className="h-full w-full" data-testid="command-map" />
    </div>
  );
}
