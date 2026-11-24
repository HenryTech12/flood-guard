"use client";
import { useState } from "react";
import { Phone, Shield, ShieldCheck, Upload } from "lucide-react";
import { useHeartbeat, useLiveJson } from "@/lib/client/live";
import AdminPanel, { type Report } from "@/components/guardy/AdminPanel";
import type { FloodEvent } from "@/components/guardy/AlertPanel";
import type { Centre } from "@/components/guardy/CitizenMap";

const EXAMPLE = `{
  "location": "Lekki Phase 1",
  "latitude": 6.4474,
  "longitude": 3.4723,
  "severity": "high",
  "rainfall": 62,
  "description": "Flash flooding on Admiralty Way"
}`;

export default function AuthorityDashboard() {
  const { data: reports, refetch } = useLiveJson<{ data: Report[] }>("/api/reports", { pollMs: 10000 });
  const { data: floods, refetch: refetchFloods } = useLiveJson<{ data: FloodEvent[] }>("/api/floods", { pollMs: 30000 });
  const { data: centres } = useLiveJson<{ data: Centre[] }>("/api/centers", { pollMs: 120000 });
  useHeartbeat(10000);
  const [showUpload, setShowUpload] = useState(false);
  const [json, setJson] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const upload = async () => {
    setMsg(null);
    try {
      const body = JSON.parse(json);
      const res = await fetch("/api/floods", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error ?? "Upload failed");
      setMsg({ ok: true, text: `Recorded ${d.created.length} flood event(s). ${d.notificationsSent} alert(s) sent to people within 20 km.` });
      setJson("");
      setShowUpload(false);
      void refetchFloods();
    } catch (e) {
      setMsg({ ok: false, text: e instanceof SyntaxError ? "Invalid JSON format. Please check your input." : (e as Error).message });
    }
  };

  const events = floods?.data ?? [];
  return (
    <div className="grid grid-cols-1 gap-6">
      <AdminPanel reports={reports?.data ?? []} onUpdate={() => void refetch()} />

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        <div className="rounded-lg border border-gray-200 bg-white p-6 shadow">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div className="flex items-center">
              <div className="mr-3 rounded-lg bg-blue-100 p-2">
                <ShieldCheck className="h-5 w-5 text-blue-600" />
              </div>
              <div>
                <h3 className="text-xl font-bold text-gray-900">Recent Flood Events</h3>
                <p className="text-sm text-gray-600">{events.length} events recorded</p>
              </div>
            </div>
            <button onClick={() => setShowUpload((s) => !s)} className="flex items-center rounded-xl border-2 border-slate-200 bg-slate-100 px-4 py-2 text-sm font-bold text-slate-700 transition-all hover:border-slate-300 hover:bg-white">
              <Upload className="mr-2 h-4 w-4" /> Upload Data
            </button>
          </div>
          {msg && <div className={`mb-3 rounded-lg border-l-4 p-3 text-sm ${msg.ok ? "border-green-500 bg-green-50 text-green-800" : "border-red-500 bg-red-50 text-red-800"}`}>{msg.text}</div>}
          {showUpload && (
            <div className="mb-4 rounded-lg border border-gray-300 bg-gray-50 p-4">
              <label className="mb-2 block text-sm font-medium text-gray-700" htmlFor="flood-json">
                Flood event JSON (object or array) — alerts people within 20 km
              </label>
              <textarea id="flood-json" value={json} onChange={(e) => setJson(e.target.value)} rows={7} placeholder={EXAMPLE} className="mb-2 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 font-mono text-sm text-gray-900" />
              <div className="flex gap-2">
                <button onClick={() => void upload()} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700">
                  Submit
                </button>
                <button onClick={() => (setShowUpload(false), setJson(""))} className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">
                  Cancel
                </button>
              </div>
            </div>
          )}
          <div className="max-h-96 space-y-3 overflow-y-auto">
            {events.slice(0, 8).map((e) => (
              <div key={e.id} className="rounded-lg border border-gray-200 bg-gray-50 p-4 transition-all hover:shadow-md">
                <div className="mb-2 flex items-start justify-between">
                  <div className="flex-1">
                    <p className="font-bold text-gray-900">{e.location}</p>
                    <p className="text-sm text-gray-600">{e.description}</p>
                    <p className="mt-1 font-mono text-xs text-gray-500">
                      {e.latitude.toFixed(4)}, {e.longitude.toFixed(4)}
                    </p>
                  </div>
                  <span className={`ml-2 rounded px-2 py-1 text-xs font-bold uppercase text-white ${e.severity === "high" ? "bg-red-600" : e.severity === "medium" ? "bg-yellow-600" : "bg-blue-600"}`}>{e.severity}</span>
                </div>
                <div className="flex items-center justify-between">
                  <p className="text-xs text-gray-500">{new Date(e.timestamp).toLocaleString("en-NG", { dateStyle: "medium", timeStyle: "short" })}</p>
                  <p className="text-xs font-semibold text-blue-600">
                    {e.rainfall ? `${e.rainfall.toFixed(1)}mm rain · ` : ""}
                    {e.notified_count} alerted
                  </p>
                </div>
              </div>
            ))}
            {events.length === 0 && <div className="py-8 text-center text-gray-500">No flood events recorded</div>}
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white/80 p-6 shadow-xl backdrop-blur-sm">
          <div className="mb-6 flex items-center">
            <div className="relative mr-4">
              <div className="absolute inset-0 rounded-xl bg-gradient-to-r from-green-600 to-emerald-600 opacity-20 blur-md" />
              <div className="relative rounded-xl bg-gradient-to-br from-green-500 to-emerald-500 p-3 shadow-lg">
                <Shield className="h-6 w-6 text-white" />
              </div>
            </div>
            <div>
              <h3 className="text-2xl font-black text-slate-900">Emergency Centers</h3>
              <p className="text-sm font-semibold text-slate-600">{centres?.data.length ?? 0} centers available</p>
            </div>
          </div>
          <div className="max-h-96 space-y-4 overflow-y-auto pr-2">
            {(centres?.data ?? []).map((c) => (
              <div key={c.id} className="group rounded-xl border-2 border-slate-200 bg-gradient-to-br from-white to-slate-50 p-5 transition-all duration-300 hover:-translate-y-1 hover:border-green-300 hover:shadow-xl">
                <div className="mb-3 flex items-start justify-between">
                  <div className="flex-1">
                    <p className="mb-1 text-lg font-black text-slate-900">{c.name}</p>
                    <div className="flex items-center gap-2 text-slate-600">
                      <Phone className="h-4 w-4" />
                      <p className="text-sm font-semibold">{c.phone}</p>
                    </div>
                    {c.type === "shelter" && (
                      <p className="mt-1 text-xs font-semibold text-slate-500">
                        Occupancy {c.occupancy}/{c.capacity}
                      </p>
                    )}
                  </div>
                  <span className={`rounded-lg px-3 py-1.5 text-xs font-black uppercase tracking-wide text-white shadow-md ${c.type === "hospital" ? "bg-gradient-to-r from-blue-600 to-cyan-600" : "bg-gradient-to-r from-green-600 to-emerald-600"}`}>{c.type}</span>
                </div>
                <div className="border-t border-slate-200 pt-3">
                  <a href={`tel:${c.phone}`} className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-green-600 to-emerald-600 px-4 py-3 font-bold text-white shadow-lg transition-all duration-300 hover:scale-[1.02] hover:from-green-700 hover:to-emerald-700 hover:shadow-xl">
                    <Phone className="h-5 w-5" />
                    <span>Call Now</span>
                  </a>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
