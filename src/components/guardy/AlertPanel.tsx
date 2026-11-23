"use client";
// Flood Alerts panel (Guardy design).
import { Droplets, ShieldAlert } from "lucide-react";

export interface FloodEvent {
  id: string;
  location: string;
  latitude: number;
  longitude: number;
  severity: "low" | "medium" | "high";
  rainfall: number | null;
  description: string | null;
  source: string;
  notified_count: number;
  timestamp: string;
}

const styles = (s: string) =>
  s === "high"
    ? "bg-gradient-to-br from-red-50 to-orange-50 border-red-300 text-red-900"
    : s === "medium"
      ? "bg-gradient-to-br from-yellow-50 to-amber-50 border-yellow-300 text-yellow-900"
      : "bg-gradient-to-br from-blue-50 to-cyan-50 border-blue-300 text-blue-900";
const badge = (s: string) =>
  s === "high" ? "bg-gradient-to-r from-red-600 to-orange-600 text-white shadow-lg" : s === "medium" ? "bg-gradient-to-r from-yellow-600 to-amber-600 text-white shadow-lg" : "bg-gradient-to-r from-blue-600 to-cyan-600 text-white shadow-lg";
const SOURCE: Record<string, string> = { zone: "FloodGuard risk engine", weather: "Live weather", upload: "Authority upload", manual: "Authority", demo: "Demo" };

export default function AlertPanel({ events }: { events: FloodEvent[] }) {
  const sorted = [...events].sort((a, b) => b.timestamp.localeCompare(a.timestamp));
  return (
    <div className="flex h-full flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white/80 p-6 shadow-xl backdrop-blur-sm" data-testid="alert-panel">
      <div className="mb-6 flex items-center">
        <div className="relative mr-4">
          <div className="absolute inset-0 rounded-xl bg-gradient-to-r from-blue-600 to-cyan-600 opacity-20 blur-md" />
          <div className="relative rounded-xl bg-gradient-to-br from-blue-500 to-cyan-500 p-3 shadow-lg">
            <ShieldAlert className="h-6 w-6 text-white" />
          </div>
        </div>
        <div>
          <h2 className="text-2xl font-black text-slate-900">Flood Alerts</h2>
          <p className="text-sm font-semibold text-slate-600">
            {sorted.length} active alert{sorted.length !== 1 ? "s" : ""}
          </p>
        </div>
      </div>
      {sorted.length === 0 ? (
        <div className="flex flex-1 items-center justify-center">
          <div className="text-center">
            <Droplets className="mx-auto mb-4 h-16 w-16 text-slate-300" />
            <p className="font-medium text-slate-500">No flood alerts at this time</p>
            <p className="mt-1 text-xs text-slate-400">System monitoring active</p>
          </div>
        </div>
      ) : (
        <div className="flex-1 space-y-4 overflow-y-auto pr-2">
          {sorted.slice(0, 10).map((e) => (
            <div key={e.id} className={`rounded-xl border-2 p-5 transition-all duration-300 hover:scale-[1.02] hover:shadow-xl ${styles(e.severity)}`}>
              <div className="mb-3 flex items-start justify-between gap-2">
                <div className="flex items-center gap-3">
                  <ShieldAlert className={`h-5 w-5 ${e.severity === "high" ? "text-red-600" : e.severity === "medium" ? "text-yellow-600" : "text-blue-600"}`} />
                  <h3 className="text-lg font-black">{e.location}</h3>
                </div>
                <span className={`rounded-lg px-3 py-1.5 text-xs font-black uppercase tracking-wide ${badge(e.severity)}`}>{e.severity}</span>
              </div>
              {e.description && (
                <p className="mb-3 text-sm leading-relaxed">
                  <span className="font-bold">Conditions:</span> {e.description}
                </p>
              )}
              {e.rainfall !== null && e.rainfall > 0 && (
                <div className="mb-3 flex items-center gap-2">
                  <Droplets className="h-4 w-4" />
                  <span className="text-sm">
                    <span className="font-bold">Rainfall:</span> {e.rainfall.toFixed(1)}mm
                  </span>
                </div>
              )}
              <div className="flex items-center justify-between border-t border-current/20 pt-3">
                <p className="text-xs font-semibold opacity-70">
                  {new Date(e.timestamp).toLocaleString("en-NG", { dateStyle: "medium", timeStyle: "short" })} · {SOURCE[e.source] ?? e.source}
                </p>
                <div className="h-2 w-2 animate-pulse rounded-full bg-current" />
              </div>
            </div>
          ))}
        </div>
      )}
      {sorted.length > 10 && (
        <div className="mt-6 border-t border-slate-200 pt-4 text-center">
          <p className="text-sm font-bold text-slate-700">Showing 10 of {sorted.length} alerts</p>
        </div>
      )}
    </div>
  );
}
