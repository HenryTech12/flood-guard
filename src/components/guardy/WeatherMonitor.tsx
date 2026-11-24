"use client";
// Weather Monitor (Guardy design). Flood events are created server-side when a city has heavy
// rain or storms; the banner shows how many nearby subscribers were alerted.
import { useCallback, useEffect, useState } from "react";
import { Bell, Check, Cloud, CloudRain, Droplets, RefreshCw, ThermometerSun, Wind } from "lucide-react";
import { NIGERIAN_CITIES } from "@/lib/core/weatherRisk";

interface Weather {
  name: string;
  temperature: number;
  feelsLike: number;
  humidity: number;
  pressure: number;
  windSpeed: number;
  clouds: number;
  rainfall: number;
  description: string;
  source: string;
}

export default function WeatherMonitor({ defaultCity = "Lagos", onFloodEvent }: { defaultCity?: string; onFloodEvent?: () => void }) {
  const [city, setCity] = useState(defaultCity);
  const [w, setW] = useState<Weather | null>(null);
  const [loading, setLoading] = useState(false);
  const [note, setNote] = useState<{ sent: number; total: number; at: Date } | null>(null);

  const fetchWeather = useCallback(
    async (c: string) => {
      setLoading(true);
      try {
        const d = await fetch(`/api/weather?city=${encodeURIComponent(c)}&forecast=0`).then((r) => r.json());
        setW(d.data ?? null);
        if (d.floodEvent?.created) {
          setNote({ sent: d.floodEvent.notified, total: d.floodEvent.subscribers, at: new Date() });
          onFloodEvent?.();
        }
      } catch {
        setW(null);
      } finally {
        setLoading(false);
      }
    },
    [onFloodEvent],
  );

  useEffect(() => {
    void fetchWeather(city);
    const t = setInterval(() => void fetchWeather(city), 300000);
    return () => clearInterval(t);
  }, [city, fetchWeather]);

  return (
    <div className="rounded-2xl border border-slate-200 bg-white/80 p-6 shadow-xl backdrop-blur-sm" data-testid="weather-monitor">
      <div className="mb-6 flex items-center">
        <div className="relative mr-4">
          <div className="absolute inset-0 rounded-xl bg-gradient-to-r from-blue-600 to-cyan-600 opacity-20 blur-md" />
          <div className="relative rounded-xl bg-gradient-to-br from-blue-500 to-cyan-500 p-3 shadow-lg">
            <CloudRain className="h-6 w-6 text-white" />
          </div>
        </div>
        <div>
          <h2 className="text-2xl font-black text-slate-900">Weather Monitor</h2>
          <p className="text-sm font-semibold text-slate-600">Live weather tracking</p>
        </div>
      </div>

      {note && (
        <div className="mb-6 flex items-start gap-4 rounded-xl border-2 border-green-300 bg-gradient-to-r from-green-50 to-emerald-50 p-5 shadow-lg">
          <div className="relative flex-shrink-0">
            <div className="rounded-lg bg-gradient-to-br from-green-500 to-emerald-500 p-2">
              <Bell className="h-5 w-5 text-white" />
            </div>
            <div className="absolute -right-1 -top-1 rounded-full bg-white p-0.5">
              <Check className="h-3 w-3 text-green-600" />
            </div>
          </div>
          <div className="flex-1">
            <p className="mb-1 text-lg font-black text-green-900">Flood alert issued</p>
            <p className="text-sm font-semibold text-green-800">
              {note.sent} alert{note.sent !== 1 ? "s" : ""} sent to people within 20 km{note.total > 0 ? ` • ${note.total} registered nearby` : ""}.
            </p>
            <p className="mt-2 text-xs font-medium text-green-600">{note.at.toLocaleTimeString()}</p>
          </div>
          <button onClick={() => setNote(null)} className="text-lg font-bold text-green-600 hover:text-green-800">
            ✕
          </button>
        </div>
      )}

      <div className="mb-4">
        <label className="mb-2 block text-sm font-medium text-gray-700" htmlFor="wm-city">
          Select City
        </label>
        <select id="wm-city" value={city} onChange={(e) => setCity(e.target.value)} className="w-full rounded-lg border border-gray-300 bg-white px-4 py-2 text-gray-900 focus:border-blue-500 focus:ring-2 focus:ring-blue-500">
          {NIGERIAN_CITIES.map((c) => (
            <option key={c.name} value={c.name}>
              {c.name}
            </option>
          ))}
        </select>
      </div>

      {loading && !w ? (
        <div className="py-8 text-center">
          <div className="mx-auto h-12 w-12 animate-spin rounded-full border-4 border-blue-600 border-t-transparent" />
          <p className="mt-4 text-gray-600">Loading weather data...</p>
        </div>
      ) : w ? (
        <div className="space-y-4">
          <div className="rounded-lg border-2 border-blue-200 bg-blue-50 p-6">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h3 className="text-2xl font-bold text-gray-900">{w.name}</h3>
                <p className="capitalize text-gray-600">{w.description}</p>
                {w.source === "estimate" && <p className="text-xs font-semibold text-slate-500">Offline estimate</p>}
              </div>
              <div className="text-right">
                <p className="text-4xl font-bold text-gray-900">{w.temperature.toFixed(1)}°C</p>
                <p className="text-sm text-gray-600">Feels like {w.feelsLike.toFixed(1)}°C</p>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <Tile icon={<Droplets className="mr-2 h-5 w-5 text-blue-600" />} label="Humidity" value={`${w.humidity}%`} />
              <Tile icon={<Wind className="mr-2 h-5 w-5 text-blue-600" />} label="Wind Speed" value={`${w.windSpeed.toFixed(1)} m/s`} />
              <Tile icon={<ThermometerSun className="mr-2 h-5 w-5 text-blue-600" />} label="Pressure" value={`${w.pressure} hPa`} />
              <Tile icon={<Cloud className="mr-2 h-5 w-5 text-blue-600" />} label="Clouds" value={`${w.clouds}%`} />
            </div>
            {w.rainfall > 0 && (
              <div className="mt-4 rounded-lg border-2 border-yellow-400 bg-yellow-50 p-3">
                <p className="flex items-center text-sm font-semibold text-yellow-900">
                  <CloudRain className="mr-2 h-4 w-4" />
                  Rainfall: {w.rainfall.toFixed(1)}mm in the last hour
                </p>
              </div>
            )}
          </div>
          <button onClick={() => void fetchWeather(city)} className="flex w-full items-center justify-center rounded-lg bg-blue-600 px-4 py-2 font-medium text-white transition-colors hover:bg-blue-700">
            <RefreshCw className={`mr-2 h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            Refresh Data
          </button>
        </div>
      ) : (
        <div className="py-8 text-center text-gray-500">
          <p>No weather data available</p>
        </div>
      )}
    </div>
  );
}

function Tile({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-center rounded-lg border border-gray-200 bg-white p-3">
      {icon}
      <div>
        <p className="text-xs text-gray-600">{label}</p>
        <p className="text-lg font-semibold text-gray-900">{value}</p>
      </div>
    </div>
  );
}
