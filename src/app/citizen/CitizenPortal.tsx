"use client";
import dynamic from "next/dynamic";
import { useCallback, useState } from "react";
import { MapPin, Phone, Shield } from "lucide-react";
import { useLiveJson } from "@/lib/client/live";
import AlertPanel, { type FloodEvent } from "@/components/guardy/AlertPanel";
import EmergencyForm from "@/components/guardy/EmergencyForm";
import FloodRiskMonitor from "@/components/guardy/FloodRiskMonitor";
import WeatherMonitor from "@/components/guardy/WeatherMonitor";
import type { Centre } from "@/components/guardy/CitizenMap";

const CitizenMap = dynamic(() => import("@/components/guardy/CitizenMap"), { ssr: false, loading: () => <div className="grid h-full place-items-center text-slate-400">Loading map…</div> });

export default function CitizenPortal({ regionCity }: { regionCity: string }) {
  const { data: floods, refetch } = useLiveJson<{ data: FloodEvent[] }>("/api/floods", { pollMs: 30000 });
  const { data: centres } = useLiveJson<{ data: Centre[] }>("/api/centers", { pollMs: 120000 });
  const [me, setMe] = useState<[number, number] | null>(null);
  const onLocation = useCallback((lat: number, lon: number) => setMe([lon, lat]), []);
  const events = floods?.data ?? [];

  return (
    <div className="space-y-6">
      <FloodRiskMonitor onLocation={onLocation} />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
            <EmergencyForm onSubmitted={refetch} />
            <WeatherMonitor defaultCity={regionCity} onFloodEvent={refetch} />
          </div>
        </div>
        <div className="lg:col-span-1">
          <div className="h-[500px] lg:h-full lg:max-h-[1100px]">
            <AlertPanel events={events} />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white/80 shadow-xl backdrop-blur-sm lg:col-span-2">
          <div className="flex items-center gap-3 border-b border-slate-200 p-5">
            <div className="rounded-lg bg-blue-100 p-2">
              <MapPin className="h-5 w-5 text-blue-600" />
            </div>
            <div>
              <h3 className="text-xl font-black text-slate-900">Flood Map</h3>
              <p className="text-sm font-semibold text-slate-600">You (blue) · flood alerts · H hospital · S shelter</p>
            </div>
          </div>
          <div className="h-[420px]">
            <CitizenMap events={events} centres={centres?.data ?? []} me={me} />
          </div>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white/80 p-6 shadow-xl backdrop-blur-sm">
          <div className="mb-4 flex items-center">
            <div className="mr-3 rounded-xl bg-gradient-to-br from-green-500 to-emerald-500 p-3 shadow-lg">
              <Shield className="h-6 w-6 text-white" />
            </div>
            <div>
              <h3 className="text-xl font-black text-slate-900">Emergency Centers</h3>
              <p className="text-sm font-semibold text-slate-600">{centres?.data.length ?? 0} centers available</p>
            </div>
          </div>
          <div className="max-h-[360px] space-y-3 overflow-y-auto pr-2">
            {(centres?.data ?? []).map((c) => (
              <div key={c.id} className="rounded-xl border-2 border-slate-200 bg-gradient-to-br from-white to-slate-50 p-4 transition-all hover:border-green-300 hover:shadow-lg">
                <div className="mb-2 flex items-start justify-between gap-2">
                  <p className="font-black text-slate-900">{c.name}</p>
                  <span className={`rounded-lg px-2 py-1 text-xs font-black uppercase text-white ${c.type === "hospital" ? "bg-gradient-to-r from-blue-600 to-cyan-600" : "bg-gradient-to-r from-green-600 to-emerald-600"}`}>{c.type}</span>
                </div>
                {c.type === "shelter" && <p className="mb-2 text-xs font-semibold text-slate-500">{Math.max(0, c.capacity - c.occupancy)} spaces free</p>}
                <a href={`tel:${c.phone}`} className="flex items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-green-600 to-emerald-600 px-3 py-2 text-sm font-bold text-white hover:from-green-700 hover:to-emerald-700">
                  <Phone className="h-4 w-4" /> Call {c.phone}
                </a>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
