"use client";
// Citizen map: your location, flood alert circles, emergency centres (H = hospital,
// S = shelter) and the covered risk zones. Light OpenStreetMap-based tiles.
import maplibregl, { type GeoJSONSource, type Map as MLMap } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { useEffect, useRef, useState } from "react";
import { getRegion } from "../../../config/regions";
import { circlePolygon } from "@/lib/core/geo";
import type { FloodEvent } from "./AlertPanel";

export interface Centre {
  id: string;
  name: string;
  type: string;
  latitude: number;
  longitude: number;
  phone: string;
  capacity: number;
  occupancy: number;
}

const SEV_RADIUS = { high: 3000, medium: 2000, low: 1200 };
const SEV_COLOR = { high: "#dc2626", medium: "#f59e0b", low: "#2563eb" };

export default function CitizenMap({ events, centres, me }: { events: FloodEvent[]; centres: Centre[]; me: [number, number] | null }) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<MLMap | null>(null);
  const markers = useRef<maplibregl.Marker[]>([]);
  const meMarker = useRef<maplibregl.Marker | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!el.current) return;
    const region = getRegion();
    const m = new maplibregl.Map({
      container: el.current,
      style: {
        version: 8,
        sources: {
          osm: {
            type: "raster",
            tiles: ["a", "b", "c", "d"].map((s) => `https://${s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}@2x.png`),
            tileSize: 256,
            attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> © CARTO',
          },
          offline: { type: "geojson", data: `/data/${region.data.basemap}` },
        },
        layers: [
          { id: "bg", type: "background", paint: { "background-color": "#eef2f7" } },
          { id: "water", type: "fill", source: "offline", filter: ["==", ["get", "kind"], "water"], paint: { "fill-color": "#a9d4f5" } },
          { id: "osm", type: "raster", source: "osm" },
        ],
      },
      center: region.center,
      zoom: region.zoom - 0.6,
      attributionControl: { compact: true },
    });
    m.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
    m.on("error", (e) => {
      if ((e as { sourceId?: string }).sourceId === "osm" && m.getLayer("osm")) m.setLayoutProperty("osm", "visibility", "none");
    });
    m.on("load", () => {
      m.addSource("events", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
      m.addLayer({ id: "events-fill", type: "fill", source: "events", paint: { "fill-color": ["get", "color"], "fill-opacity": 0.18 } });
      m.addLayer({ id: "events-line", type: "line", source: "events", paint: { "line-color": ["get", "color"], "line-width": 2 } });
      setReady(true);
    });
    map.current = m;
    return () => {
      m.remove();
      map.current = null;
    };
  }, []);

  useEffect(() => {
    const m = map.current;
    if (!m || !ready) return;
    (m.getSource("events") as GeoJSONSource).setData({
      type: "FeatureCollection",
      features: events.map((e) => ({
        type: "Feature",
        properties: { color: SEV_COLOR[e.severity] },
        geometry: { type: "Polygon", coordinates: [circlePolygon([e.longitude, e.latitude], SEV_RADIUS[e.severity])] },
      })),
    });
    markers.current.forEach((x) => x.remove());
    markers.current = centres.map((c) => {
      const d = document.createElement("div");
      d.className = `grid h-7 w-7 place-items-center rounded-full border-2 border-white text-xs font-black text-white shadow-lg ${c.type === "hospital" ? "bg-red-600" : "bg-green-600"}`;
      d.textContent = c.type === "hospital" ? "H" : "S";
      return new maplibregl.Marker({ element: d })
        .setLngLat([c.longitude, c.latitude])
        .setPopup(new maplibregl.Popup({ offset: 14 }).setHTML(`<b>${c.name}</b><br/>${c.type}${c.type === "shelter" ? ` · ${c.capacity - c.occupancy} spaces` : ""}<br/><a href="tel:${c.phone}">📞 ${c.phone}</a>`))
        .addTo(m);
    });
  }, [events, centres, ready]);

  useEffect(() => {
    const m = map.current;
    if (!m || !ready || !me) return;
    if (!meMarker.current) {
      const d = document.createElement("div");
      d.className = "h-5 w-5 rounded-full border-4 border-white bg-blue-600 shadow-[0_0_0_6px_rgba(37,99,235,0.25)]";
      meMarker.current = new maplibregl.Marker({ element: d }).setLngLat(me).addTo(m);
    } else meMarker.current.setLngLat(me);
    m.flyTo({ center: me, zoom: 12.5, speed: 1.2 });
  }, [me, ready]);

  return <div ref={el} className="h-full w-full" />;
}
