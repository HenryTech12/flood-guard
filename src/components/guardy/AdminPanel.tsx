"use client";
// Authority Dashboard reports panel (Guardy design) on live FloodGuard help requests.
// Improvements: urgency score, reference number, channel (web/SMS/USSD), assigned volunteer,
// notified centres, live updates, and a link into the command map.
import { useState } from "react";
import { BarChart3, CheckCircle, Clock, Filter, Map, MessageSquare, Shield, Truck, Volume2, XCircle } from "lucide-react";

export interface Report {
  id: string;
  ref: string;
  name: string;
  phoneMasked: string | null;
  typeOfNeed: string;
  comments: string | null;
  channel: string;
  latitude: number;
  longitude: number;
  locationName: string | null;
  status: "pending" | "responded" | "resolved" | "closed";
  urgency: number;
  people: number;
  hasVoice: boolean;
  volunteer: string | null;
  notifiedCenters: { name: string; distanceKm: number }[];
  timestamp: string;
}

const CHANNEL: Record<string, string> = { web: "Web form", sms: "SMS", ussd: "USSD", demo: "Demo" };

function StatusBadge({ status }: { status: Report["status"] }) {
  if (status === "resolved")
    return (
      <span className="inline-flex items-center rounded-full border border-green-300 bg-green-100 px-3 py-1 text-xs font-semibold text-green-800">
        <CheckCircle className="mr-1 h-3 w-3" /> Resolved
      </span>
    );
  if (status === "responded")
    return (
      <span className="inline-flex items-center rounded-full border border-blue-300 bg-blue-100 px-3 py-1 text-xs font-semibold text-blue-800">
        <Clock className="mr-1 h-3 w-3" /> Responded
      </span>
    );
  if (status === "closed")
    return <span className="inline-flex items-center rounded-full border border-gray-300 bg-gray-100 px-3 py-1 text-xs font-semibold text-gray-700">Closed</span>;
  return (
    <span className="inline-flex items-center rounded-full border border-yellow-300 bg-yellow-100 px-3 py-1 text-xs font-semibold text-yellow-800">
      <XCircle className="mr-1 h-3 w-3" /> Pending
    </span>
  );
}

const urgencyCls = (u: number) => (u >= 70 ? "bg-red-600" : u >= 50 ? "bg-orange-500" : u >= 30 ? "bg-yellow-500" : "bg-lime-500");

export default function AdminPanel({ reports, onUpdate }: { reports: Report[]; onUpdate: () => void }) {
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterType, setFilterType] = useState("all");
  const [busy, setBusy] = useState<string | null>(null);
  const types = [...new Set(reports.map((r) => r.typeOfNeed))].sort();

  const filtered = reports
    .filter((r) => (filterStatus === "all" || r.status === filterStatus) && (filterType === "all" || r.typeOfNeed === filterType))
    .sort((a, b) => (a.status === "pending" ? 0 : 1) - (b.status === "pending" ? 0 : 1) || b.urgency - a.urgency || b.timestamp.localeCompare(a.timestamp));
  const stats = {
    total: reports.length,
    pending: reports.filter((r) => r.status === "pending").length,
    responded: reports.filter((r) => r.status === "responded").length,
    resolved: reports.filter((r) => r.status === "resolved").length,
  };
  const hasFilters = filterStatus !== "all" || filterType !== "all";
  const clear = () => (setFilterStatus("all"), setFilterType("all"));

  const update = async (id: string, status: "responded" | "resolved") => {
    setBusy(id);
    try {
      const res = await fetch(`/api/reports/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status }) });
      if (!res.ok) throw new Error();
      onUpdate();
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-6 shadow" data-testid="admin-panel">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center">
          <div className="mr-3 rounded-lg bg-purple-100 p-2">
            <Shield className="h-6 w-6 text-purple-600" />
          </div>
          <div>
            <h2 className="text-2xl font-bold text-gray-900">Authority Dashboard</h2>
            <p className="text-sm text-gray-600">Manage emergency reports from web, SMS and USSD — live</p>
          </div>
        </div>
        <a href="/command" className="flex items-center rounded-lg bg-slate-900 px-4 py-2 text-sm font-bold text-white hover:bg-slate-800">
          <Map className="mr-2 h-4 w-4" /> Open live command map
        </a>
      </div>

      <div className="mb-6 grid grid-cols-2 gap-4 md:grid-cols-4">
        <Stat label="Total Reports" value={stats.total} cls="bg-gray-50 border-gray-300 text-gray-900" icon={<BarChart3 className="h-4 w-4 text-gray-500" />} testid="stat-total" />
        <Stat label="Pending" value={stats.pending} cls="bg-yellow-50 border-yellow-300 text-yellow-900" icon={<XCircle className="h-4 w-4 text-yellow-600" />} testid="stat-pending" />
        <Stat label="Responded" value={stats.responded} cls="bg-blue-50 border-blue-300 text-blue-900" icon={<Clock className="h-4 w-4 text-blue-600" />} testid="stat-responded" />
        <Stat label="Resolved" value={stats.resolved} cls="bg-green-50 border-green-300 text-green-900" icon={<CheckCircle className="h-4 w-4 text-green-600" />} testid="stat-resolved" />
      </div>

      <div className="mb-6 rounded-lg border border-gray-300 bg-gray-50 p-4">
        <div className="mb-3 flex flex-wrap items-center gap-3">
          <div className="flex items-center">
            <Filter className="mr-2 h-5 w-5 text-gray-700" />
            <span className="text-sm font-bold text-gray-900">Filter Reports</span>
          </div>
          {hasFilters && (
            <button onClick={clear} className="ml-auto rounded-lg bg-blue-100 px-3 py-1 text-xs font-medium text-blue-700 transition-colors hover:bg-blue-200">
              Clear Filters
            </button>
          )}
        </div>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-700" htmlFor="flt-status">
              Status
            </label>
            <select id="flt-status" value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} className="w-full rounded-lg border-2 border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-blue-500 focus:ring-2 focus:ring-blue-500">
              <option value="all">All Status</option>
              <option value="pending">Pending</option>
              <option value="responded">Responded</option>
              <option value="resolved">Resolved</option>
              <option value="closed">Closed</option>
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-700" htmlFor="flt-type">
              Type of Need
            </label>
            <select id="flt-type" value={filterType} onChange={(e) => setFilterType(e.target.value)} className="w-full rounded-lg border-2 border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-blue-500 focus:ring-2 focus:ring-blue-500">
              <option value="all">All Types</option>
              {types.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="mt-3 text-xs text-gray-600">
          Showing <span className="font-bold text-gray-900">{filtered.length}</span> of <span className="font-bold text-gray-900">{reports.length}</span> reports
        </div>
      </div>

      <div className="max-h-[640px] space-y-4 overflow-y-auto pr-2" data-testid="report-list">
        {filtered.length === 0 ? (
          <div className="rounded-lg border-2 border-dashed border-gray-300 bg-gray-50 py-12 text-center">
            <Filter className="mx-auto mb-3 h-12 w-12 text-gray-400" />
            <p className="font-medium text-gray-600">{reports.length ? "No reports match the selected filters" : "No emergency reports yet"}</p>
            {hasFilters && (
              <button onClick={clear} className="mt-3 px-4 py-2 text-sm font-medium text-blue-700 underline hover:text-blue-800">
                Clear all filters
              </button>
            )}
          </div>
        ) : (
          filtered.map((r) => (
            <div key={r.id} className="rounded-lg border-2 border-gray-200 bg-white p-5 transition-all hover:shadow-lg" data-testid={`report-${r.ref}`}>
              <div className="mb-3 flex items-start justify-between gap-3">
                <div className="flex items-start gap-3">
                  <div className={`grid h-11 w-11 shrink-0 place-items-center rounded-lg text-lg font-black text-white ${urgencyCls(r.urgency)}`} title="Urgency score (0–100)">
                    {r.urgency}
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-gray-900">
                      {r.name} <span className="font-mono text-sm font-semibold text-gray-400">{r.ref}</span>
                    </h3>
                    <p className="text-sm text-gray-600">
                      {new Date(r.timestamp).toLocaleString("en-NG", { dateStyle: "medium", timeStyle: "short" })} · {CHANNEL[r.channel] ?? r.channel} · {r.people} {r.people === 1 ? "person" : "people"}
                      {r.phoneMasked ? ` · ${r.phoneMasked}` : ""}
                    </p>
                  </div>
                </div>
                <StatusBadge status={r.status} />
              </div>

              <div className="mb-3">
                <p className="mb-1 text-xs font-medium text-gray-600">Type of Need</p>
                <span className="inline-flex items-center rounded border border-blue-300 bg-blue-100 px-2 py-1 text-xs font-semibold text-blue-800">{r.typeOfNeed}</span>
              </div>

              <div className="mb-3 rounded border-l-4 border-blue-500 bg-blue-50 p-3">
                <p className="mb-1 text-xs font-medium text-blue-900">Location</p>
                {r.locationName && <p className="mb-1 text-sm font-semibold text-blue-900">{r.locationName}</p>}
                <p className="font-mono text-xs text-blue-700">
                  {r.latitude.toFixed(4)}, {r.longitude.toFixed(4)}
                </p>
              </div>

              {r.comments && (
                <div className="mb-4 rounded-lg border border-gray-200 bg-gray-50 p-3">
                  <p className="mb-1 flex items-center text-xs font-medium text-gray-600">
                    <MessageSquare className="mr-1 h-3 w-3" /> Comments
                  </p>
                  <p className="text-sm text-gray-900">{r.comments}</p>
                </div>
              )}

              {r.hasVoice && (
                <div className="mb-4 rounded-lg border-2 border-blue-300 bg-blue-50 p-4" data-testid="voice">
                  <div className="mb-2 flex items-center">
                    <Volume2 className="mr-2 h-4 w-4 text-blue-700" />
                    <p className="text-xs font-bold text-blue-900">Voice Recording</p>
                  </div>
                  <audio src={`/api/voice/${r.id}`} controls className="w-full" preload="metadata" />
                </div>
              )}

              {(r.volunteer || r.notifiedCenters.length > 0) && (
                <div className="mb-3 flex flex-wrap gap-2 text-xs">
                  {r.volunteer && (
                    <span className="inline-flex items-center rounded-full bg-green-100 px-2.5 py-1 font-semibold text-green-800">
                      <Truck className="mr-1 h-3 w-3" /> {r.volunteer}
                    </span>
                  )}
                  {r.notifiedCenters.map((c) => (
                    <span key={c.name} className="rounded-full bg-slate-100 px-2.5 py-1 font-medium text-slate-700">
                      Notified {c.name} ({c.distanceKm} km)
                    </span>
                  ))}
                </div>
              )}

              {(r.status === "pending" || r.status === "responded") && (
                <div className="flex gap-2 border-t border-gray-200 pt-3">
                  {r.status === "pending" && (
                    <button disabled={busy === r.id} onClick={() => void update(r.id, "responded")} className="flex-1 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:opacity-50">
                      Mark as Responded
                    </button>
                  )}
                  <button disabled={busy === r.id} onClick={() => void update(r.id, "resolved")} className="flex-1 rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-green-700 disabled:opacity-50">
                    Mark as Resolved
                  </button>
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function Stat({ label, value, cls, icon, testid }: { label: string; value: number; cls: string; icon: React.ReactNode; testid: string }) {
  return (
    <div className={`rounded-lg border-2 p-4 ${cls}`}>
      <div className="mb-1 flex items-center justify-between">
        <p className="text-sm font-medium opacity-80">{label}</p>
        {icon}
      </div>
      <p className="text-3xl font-bold" data-testid={testid}>
        {value}
      </p>
    </div>
  );
}
