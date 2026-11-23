"use client";
// Flood Risk Monitor (Guardy design): auto-detects your location, live weather + river flow,
// transparent risk score with contributing factors. Improvements: FloodGuard zone risk for
// your exact area, optional AI score, offline-estimate badge.
import { useCallback, useEffect, useState } from "react";
import { AlertCircle, Brain, CheckCircle, CloudRain, Droplets, MapPin, Navigation, RefreshCw, Search, ShieldAlert, Thermometer, Waves, Wind } from "lucide-react";
import { NIGERIAN_CITIES, type WeatherRisk } from "@/lib/core/weatherRisk";

interface WeatherResp {
  data: { name: string; lat: number; lon: number; temperature: number; humidity: number; rainfall: number; windSpeed: number; pressure: number; description: string; source: string };
  risk: WeatherRisk;
}
interface ZoneResp {
  zone: { name: string; level: string; score: number; reasons: string[] } | null;
}
interface AiResp {
  available: boolean;
  risk_score?: number;
  risk_level?: string;
  recommended_action?: string;
  model_version?: string;
}

const riskColor = (l: WeatherRisk["level"]) => ({ critical: "bg-red-600", high: "bg-orange-600", moderate: "bg-yellow-600", low: "bg-blue-600", safe: "bg-green-600" })[l];
const riskBg = (l: WeatherRisk["level"]) => ({ critical: "bg-red-50 border-red-300", high: "bg-orange-50 border-orange-300", moderate: "bg-yellow-50 border-yellow-300", low: "bg-blue-50 border-blue-300", safe: "bg-green-50 border-green-300" })[l];
const riskText = (l: WeatherRisk["level"]) => ({ critical: "text-red-900", high: "text-orange-900", moderate: "text-yellow-900", low: "text-blue-900", safe: "text-green-900" })[l];
const ZONE_BADGE: Record<string, string> = { low: "bg-green-600", medium: "bg-yellow-600", high: "bg-red-600", severe: "bg-purple-700" };

export default function FloodRiskMonitor({ onLocation }: { onLocation?: (lat: number, lon: number) => void }) {
  const [current, setCurrent] = useState<WeatherResp | null>(null);
  const [zone, setZone] = useState<ZoneResp["zone"]>(null);
  const [ai, setAi] = useState<AiResp | null>(null);
  const [others, setOthers] = useState<WeatherResp[]>([]);
  const [loading, setLoading] = useState(true);
  const [detecting, setDetecting] = useState(false);
  const [failed, setFailed] = useState(false);
  const [lastUpdate, setLastUpdate] = useState(() => new Date());

  const load = useCallback(
    async (lat: number, lon: number) => {
      try {
        const w = (await fetch(`/api/weather?lat=${lat}&lon=${lon}`).then((r) => r.json())) as WeatherResp;
        if (!w.data) throw new Error("no data");
        setCurrent(w);
        setFailed(false);
        setLastUpdate(new Date());
        onLocation?.(lat, lon);
        fetch(`/api/risk-here?lat=${lat}&lon=${lon}`)
          .then((r) => r.json())
          .then((z: ZoneResp) => setZone(z.zone))
          .catch(() => {});
        fetch("/api/ai/flood-risk", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ latitude: lat, longitude: lon, location_name: w.data.name, rainfall_mm: w.data.rainfall, temperature: w.data.temperature, humidity: w.data.humidity }),
        })
          .then((r) => r.json())
          .then(setAi)
          .catch(() => {});
      } catch {
        setFailed(true);
      } finally {
        setLoading(false);
      }
    },
    [onLocation],
  );

  const detect = useCallback(() => {
    setDetecting(true);
    const fallback = () => {
      const c = NIGERIAN_CITIES[0];
      void load(c.lat, c.lon).finally(() => setDetecting(false));
    };
    if (!("geolocation" in navigator)) return fallback();
    navigator.geolocation.getCurrentPosition(
      (p) => void load(p.coords.latitude, p.coords.longitude).finally(() => setDetecting(false)),
      fallback,
      { timeout: 12000, maximumAge: 5 * 60e3 },
    );
  }, [load]);

  useEffect(() => {
    detect();
  }, [detect]);
  useEffect(() => {
    if (!current) return;
    const t = setInterval(() => void load(current.data.lat, current.data.lon), 120000);
    return () => clearInterval(t);
  }, [current, load]);

  const addCity = async (name: string) => {
    if (!name) return;
    const w = (await fetch(`/api/weather?city=${encodeURIComponent(name)}`).then((r) => r.json())) as WeatherResp;
    if (w.data) setOthers((prev) => [w, ...prev.filter((x) => x.data.name !== w.data.name)].slice(0, 3));
  };

  if (loading)
    return (
      <div className="rounded-lg border border-gray-200 bg-white p-12 shadow">
        <div className="text-center">
          <div className="mx-auto mb-4 h-12 w-12 animate-spin rounded-full border-4 border-blue-600 border-t-transparent" />
          <p className="text-gray-600">Loading climate data...</p>
        </div>
      </div>
    );
  if (!current || failed)
    return (
      <div className="rounded-lg border border-gray-200 bg-white p-12 shadow">
        <div className="text-center">
          <AlertCircle className="mx-auto mb-4 h-12 w-12 text-gray-400" />
          <p className="text-gray-600">Unable to load climate data</p>
          <button onClick={detect} className="mt-4 rounded-lg bg-blue-600 px-4 py-2 font-medium text-white hover:bg-blue-700">
            Try again
          </button>
        </div>
      </div>
    );

  const w = current.data;
  const risk = current.risk;
  return (
    <div className="space-y-6" data-testid="risk-monitor">
      <div className="rounded-lg border border-gray-200 bg-white shadow">
        <div className="rounded-t-lg border-b border-gray-200 bg-blue-600 p-6 text-white">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="mb-1 text-2xl font-bold">Flood Risk Monitor</h2>
              <p className="text-sm text-blue-100">Real-time climate analysis{w.source === "estimate" ? " · offline estimate (weather service unreachable)" : " · Open-Meteo"}</p>
            </div>
            <button onClick={detect} disabled={detecting} className="flex items-center gap-2 rounded-lg bg-white px-4 py-2 font-medium text-blue-600 transition-colors hover:bg-blue-50 disabled:opacity-50">
              <Navigation className={`h-4 w-4 ${detecting ? "animate-spin" : ""}`} />
              Detect Location
            </button>
          </div>
        </div>

        <div className="p-6">
          <div className={`${riskBg(risk.level)} mb-6 rounded-lg border-2 p-6`}>
            <div className="mb-4 flex items-start justify-between">
              <div className="flex items-center gap-3">
                <MapPin className="h-6 w-6 text-gray-700" />
                <div>
                  <h3 className="text-2xl font-bold text-gray-900" data-testid="risk-place">
                    {w.name}
                  </h3>
                  <p className="text-sm capitalize text-gray-600">{w.description}</p>
                </div>
              </div>
              <div className="text-right">
                <div className="mb-1 flex items-center justify-end gap-2">
                  <div className={`h-3 w-3 ${riskColor(risk.level)} rounded-full`} />
                  <span className={`text-sm font-bold uppercase ${riskText(risk.level)}`}>{risk.level}</span>
                </div>
                <div className={`text-4xl font-bold ${riskText(risk.level)}`}>{risk.percentage}%</div>
              </div>
            </div>

            <div className="mb-4 rounded-lg border border-gray-200 bg-white p-4">
              <div className="flex items-start gap-2">
                {risk.level === "safe" ? <CheckCircle className="mt-0.5 h-5 w-5 flex-shrink-0 text-green-600" /> : <AlertCircle className={`h-5 w-5 ${riskText(risk.level)} mt-0.5 flex-shrink-0`} />}
                <p className="font-medium text-gray-900">{risk.message}</p>
              </div>
            </div>

            <div className="mb-4 grid grid-cols-2 gap-4 md:grid-cols-5">
              <Metric icon={<Thermometer className="h-5 w-5 text-gray-600" />} label="Temperature" value={`${w.temperature.toFixed(1)}°C`} />
              <Metric icon={<CloudRain className="h-5 w-5 text-gray-600" />} label="Rainfall" value={`${w.rainfall.toFixed(1)}mm`} />
              <Metric icon={<Droplets className="h-5 w-5 text-gray-600" />} label="Humidity" value={`${w.humidity}%`} />
              <Metric icon={<Wind className="h-5 w-5 text-gray-600" />} label="Wind" value={`${w.windSpeed.toFixed(1)}m/s`} />
              {risk.riverDischarge !== undefined && (
                <div className="rounded-lg border-2 border-blue-200 bg-blue-50 p-4">
                  <div className="mb-2 flex items-center gap-2">
                    <Waves className="h-5 w-5 text-blue-600" />
                    <span className="text-xs font-medium text-blue-700">River Flow</span>
                  </div>
                  <p className="text-2xl font-bold text-blue-900">{risk.riverDischarge.toFixed(0)}m³/s</p>
                  {risk.riverDischargeMax !== undefined && risk.riverDischargeMax > risk.riverDischarge && <p className="mt-1 text-xs text-blue-600">Peak: {risk.riverDischargeMax.toFixed(0)}m³/s</p>}
                </div>
              )}
            </div>

            <div>
              <p className="mb-2 text-xs font-semibold text-gray-700">Contributing Factors:</p>
              <div className="flex flex-wrap gap-2">
                {risk.factors.map((f) => (
                  <span key={f} className="rounded-md border border-gray-300 bg-white px-3 py-1 text-xs font-medium text-gray-700">
                    {f}
                  </span>
                ))}
              </div>
            </div>
          </div>

          {(zone || ai?.available) && (
            <div className="mb-6 grid gap-4 md:grid-cols-2">
              {zone && (
                <div className="rounded-lg border-2 border-slate-200 bg-white p-4" data-testid="zone-risk">
                  <div className="mb-2 flex items-center justify-between">
                    <div className="flex items-center gap-2 text-sm font-bold text-slate-900">
                      <ShieldAlert className="h-5 w-5 text-blue-600" /> Your FloodGuard area: {zone.name}
                    </div>
                    <span className={`rounded px-2 py-1 text-xs font-black uppercase text-white ${ZONE_BADGE[zone.level] ?? "bg-slate-600"}`}>{zone.level}</span>
                  </div>
                  <ul className="space-y-0.5 text-sm text-slate-600">
                    {zone.reasons.slice(0, 4).map((r) => (
                      <li key={r}>• {r}</li>
                    ))}
                  </ul>
                </div>
              )}
              {ai?.available && (
                <div className="rounded-lg border-2 border-purple-200 bg-purple-50 p-4">
                  <div className="mb-1 flex items-center gap-2 text-sm font-bold text-purple-900">
                    <Brain className="h-5 w-5" /> AI flood-risk model
                  </div>
                  <p className="text-3xl font-black text-purple-900">
                    {Math.round(ai.risk_score ?? 0)}% <span className="text-sm font-bold uppercase">{ai.risk_level}</span>
                  </p>
                  {ai.recommended_action && <p className="mt-1 text-sm text-purple-800">{ai.recommended_action}</p>}
                  {ai.model_version && <p className="mt-1 text-xs text-purple-600">model {ai.model_version}</p>}
                </div>
              )}
            </div>
          )}

          <div className="mb-4 flex items-center justify-between">
            <h3 className="flex items-center gap-2 text-lg font-bold text-gray-900">
              <Search className="h-5 w-5 text-blue-600" />
              Check Other Locations
            </h3>
            <button onClick={() => void load(w.lat, w.lon)} className="flex items-center gap-2 rounded-lg border border-blue-200 px-4 py-2 text-sm text-blue-600 transition-colors hover:bg-blue-50">
              <RefreshCw className="h-4 w-4" />
              Refresh
            </button>
          </div>
          <select value="" onChange={(e) => void addCity(e.target.value)} className="mb-4 w-full rounded-lg border-2 border-gray-300 bg-white px-4 py-3 text-gray-900 focus:border-blue-500 focus:ring-2 focus:ring-blue-500">
            <option value="">Select a city to monitor...</option>
            {NIGERIAN_CITIES.filter((c) => c.name !== w.name).map((c) => (
              <option key={c.name} value={c.name}>
                {c.name}
              </option>
            ))}
          </select>
          {others.length > 0 && (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              {others.map((o) => (
                <div key={o.data.name} className="rounded-lg border-2 border-gray-200 bg-white p-4 transition-shadow hover:shadow-md">
                  <div className="mb-3 flex items-center justify-between">
                    <h4 className="flex items-center gap-2 font-bold text-gray-900">
                      <MapPin className="h-4 w-4" />
                      {o.data.name}
                    </h4>
                    <div className="flex items-center gap-1">
                      <div className={`h-2 w-2 ${riskColor(o.risk.level)} rounded-full`} />
                      <span className={`text-xs font-bold ${riskText(o.risk.level)}`}>{o.risk.percentage}%</span>
                    </div>
                  </div>
                  <p className="mb-3 text-xs capitalize text-gray-600">{o.data.description}</p>
                  <div className="grid grid-cols-2 gap-2 rounded bg-gray-50 p-2 text-xs">
                    <div>
                      <p className="text-gray-600">Temp</p>
                      <p className="font-semibold text-gray-900">{o.data.temperature.toFixed(1)}°C</p>
                    </div>
                    <div>
                      <p className="text-gray-600">Rain</p>
                      <p className="font-semibold text-gray-900">{o.data.rainfall.toFixed(1)}mm</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
          <div className="mt-6 border-t border-gray-200 pt-4">
            <p className="text-center text-xs text-gray-500">Last updated: {lastUpdate.toLocaleTimeString()} • Refreshes every 2 minutes</p>
          </div>
        </div>
      </div>
    </div>
  );
}

function Metric({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4">
      <div className="mb-2 flex items-center gap-2">
        {icon}
        <span className="text-xs font-medium text-gray-600">{label}</span>
      </div>
      <p className="text-2xl font-bold text-gray-900">{value}</p>
    </div>
  );
}
