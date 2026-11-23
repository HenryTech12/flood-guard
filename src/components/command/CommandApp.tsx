"use client";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ago, postJson, useHeartbeat, useLiveJson, useNow } from "@/lib/client/live";
import { deriveAt } from "@/lib/client/timeline";
import { formatDistance } from "@/lib/core/geo";
import type { LngLat } from "@/lib/core/types";
import { VULNERABLE_LABELS } from "@/lib/core/urgency";
import type { LiveState, RequestState, TimelineData } from "@/lib/types/state";
import { LEVEL_BG, LEVEL_COLOR, SOURCE_LABEL, STATUS_CLASS, STATUS_LABEL, urgencyColor, VOL_ICON } from "../ui";
import { DEFAULT_LAYERS, type Layers } from "./MapView";

const MapView = dynamic(() => import("./MapView"), { ssr: false, loading: () => <div className="absolute inset-0 grid place-items-center text-slate-500">Loading map…</div> });

interface RouteResult {
  method: string;
  shelter: { name: string; space: number } | null;
  geometry: { type: "LineString"; coordinates: number[][] } | null;
  distanceM: number | null;
  durationMin: number | null;
  warnings: string[];
}

const LAYER_LABELS: [keyof Layers, string, string][] = [
  ["flood", "Satellite flood extent", "#2563eb"],
  ["rain", "Rainfall (24h)", "#a855f7"],
  ["zones", "Risk zones", "#ef4444"],
  ["requests", "Help requests", "#f97316"],
  ["volunteers", "Volunteers", "#38bdf8"],
  ["shelters", "Shelters", "#22d3ee"],
  ["reports", "Crowd reports", "#e2e8f0"],
  ["checkins", "Safe check-ins", "#22c55e"],
  ["vulnerable", "Vulnerable homes (high-risk zones)", "#f472b6"],
  ["hotspots", "Hotspots", "#f87171"],
  ["route", "Safe route", "#34d399"],
];

export default function CommandApp({ operatorName, demo }: { operatorName: string; demo: boolean }) {
  const { data: live, transport, error, refetch } = useLiveJson<LiveState>("/api/state", { pollMs: 5000 });
  useHeartbeat(5000);
  const now = useNow(1000);
  const [layers, setLayers] = useState<Layers>(DEFAULT_LAYERS);
  const [selected, setSelected] = useState<string | null>(null);
  const [zoneSel, setZoneSel] = useState<string | null>(null);
  const [tab, setTab] = useState<"queue" | "zones" | "alerts">("queue");
  const [pickMode, setPickMode] = useState(false);
  const [route, setRoute] = useState<RouteResult | null>(null);
  const [flyTo, setFlyTo] = useState<{ center: LngLat; zoom?: number; key: number } | null>(null);
  const [radio, setRadio] = useState<{ zone: string; text: string } | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  // Timeline
  const [timeline, setTimeline] = useState<TimelineData | null>(null);
  const [tPos, setTPos] = useState<number | null>(null); // 0..1000, null = live
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3500);
    return () => clearTimeout(t);
  }, [toast]);

  // Load timeline when scrubbing.
  useEffect(() => {
    if (tPos === null) return;
    let stop = false;
    fetch("/api/timeline")
      .then((r) => r.json())
      .then((d) => !stop && setTimeline(d));
    return () => {
      stop = true;
    };
  }, [tPos === null, live?.serverTime && tPos !== null ? Math.floor(Date.parse(live.serverTime) / 10000) : 0]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!playing) return;
    const t = setInterval(() => setTPos((p) => (p === null || p >= 1000 ? (setPlaying(false), null) : Math.min(1000, p + 8))), 100);
    return () => clearInterval(t);
  }, [playing]);

  const tIso = useMemo(() => {
    if (tPos === null || !timeline) return null;
    const a = Date.parse(timeline.start);
    const b = Date.now();
    return new Date(a + ((b - a) * tPos) / 1000).toISOString();
  }, [tPos, timeline]);

  const view = useMemo(() => (live && timeline && tIso ? deriveAt(live, timeline, tIso) : live), [live, timeline, tIso]);

  useEffect(() => {
    if (error === "unauthorized") window.location.assign("/login?next=/command");
  }, [error]);
  if (error === "unauthorized") return null;
  if (!view) return <div className="grid h-screen place-items-center text-xl text-slate-400">Connecting to FloodGuard…</div>;

  const open = view.requests.filter((r) => ["new", "assigned", "en_route"].includes(r.status)).sort((a, b) => b.urgency - a.urgency || a.createdAt.localeCompare(b.createdAt));
  const closed = view.requests.filter((r) => !["new", "assigned", "en_route"].includes(r.status)).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  const sel = view.requests.find((r) => r.id === selected) ?? null;
  const zone = view.zones.find((z) => z.id === zoneSel) ?? null;
  const volById = new Map(view.volunteers.map((v) => [v.id, v]));
  const zonesSorted = [...view.zones].sort((a, b) => b.score - a.score);
  const s = view.stats;

  const selectRequest = (id: string | null) => {
    setSelected(id);
    setTab("queue");
    const r = view.requests.find((x) => x.id === id);
    if (r) setFlyTo({ center: r.lngLat, zoom: 14.6, key: Date.now() });
  };

  const act = async (fn: () => Promise<unknown>, ok: string) => {
    try {
      await fn();
      setToast(ok);
      void refetch();
    } catch (e) {
      setToast(`⚠ ${(e as Error).message}`);
    }
  };

  const onPick = async (p: LngLat) => {
    setPickMode(false);
    const r = (await fetch(`/api/route?lng=${p[0]}&lat=${p[1]}`).then((x) => x.json())) as RouteResult;
    setRoute(r);
    setLayers((l) => ({ ...l, route: true }));
  };
  const routeFrom = async (p: LngLat) => onPick(p);

  return (
    <div className="fixed inset-0 overflow-hidden bg-slate-950 text-slate-100">
      <MapView
        view={view}
        layers={layers}
        selectedRequestId={selected}
        onSelectRequest={selectRequest}
        onSelectZone={(id) => {
          setZoneSel(id);
          if (id) setTab("zones");
        }}
        route={route?.geometry ?? null}
        pickMode={pickMode}
        onPick={onPick}
        flyTo={flyTo}
      />

      {/* ---------- top bar ---------- */}
      <header className="absolute inset-x-0 top-0 z-10 flex h-16 items-center gap-4 border-b border-slate-800 bg-slate-950/90 px-4 backdrop-blur">
        <Link href="/" className="flex items-center gap-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/icon.svg" alt="" className="h-9 w-9" />
          <div className="leading-tight">
            <div className="text-xl font-black tracking-tight">FloodGuard</div>
            <div className="text-xs text-slate-400">
              {view.region.name}
              {view.region.state !== view.region.name ? `, ${view.region.state}` : ""} · Command
            </div>
          </div>
        </Link>
        <div className="flex items-center gap-2 rounded-full border border-slate-700 px-3 py-1 text-sm" title={`Live updates via ${transport}`}>
          <span className={`h-2.5 w-2.5 rounded-full ${tPos !== null ? "bg-sky-500" : transport === "polling" || transport === "connecting" ? "bg-yellow-400" : "animate-pulse bg-green-400"}`} />
          {tPos !== null ? "REPLAY" : "LIVE"} <span className="text-slate-500">{tPos === null && transport}</span>
        </div>
        {view.demo.simTime && (
          <div className="rounded-full border border-purple-300 bg-purple-50 px-3 py-1 text-sm text-purple-700" data-testid="sim-clock">
            🌧 {view.demo.replayRunning ? "Replaying" : "Rainfall at"} {new Date(view.demo.simTime).toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Africa/Lagos" })}
          </div>
        )}
        <div className="ml-auto flex items-center gap-2">
          <Stat label="Waiting" value={s.waiting} color="text-red-700" testid="stat-waiting" />
          <Stat label="En route" value={s.assigned + s.enRoute} color="text-yellow-700" />
          <Stat label="Rescued" value={s.rescued} color="text-green-700" testid="stat-rescued" />
          <Stat label="Safe check-ins" value={s.safeCheckins} color="text-emerald-700" />
          <Stat label="Avg to accept" value={s.avgAcceptSec !== null ? `${Math.round(s.avgAcceptSec)}s` : "—"} color="text-sky-700" />
          <Stat label="Avg to rescue" value={s.avgRescueMin !== null ? `${s.avgRescueMin.toFixed(1)}m` : "—"} color="text-sky-700" />
        </div>
        <div className="ml-2 text-right text-xs text-slate-400">
          <div>{operatorName}</div>
          <div className="flex gap-2">
            {demo && (
              <Link href="/demo" className="text-sky-700 hover:underline">
                Demo panel
              </Link>
            )}
            <button className="hover:text-slate-200" onClick={() => fetch("/api/auth/logout?who=operator", { method: "POST" }).then(() => (window.location.href = "/login"))}>
              Sign out
            </button>
          </div>
        </div>
      </header>

      {/* ---------- left column ---------- */}
      <aside className="fg-scroll absolute bottom-24 left-3 top-20 z-10 flex w-[320px] flex-col gap-3 overflow-y-auto pr-1">
        <Card title="Layers">
          <div className="grid grid-cols-1 gap-1">
            {LAYER_LABELS.map(([k, label, color]) => (
              <label key={k} className="flex cursor-pointer items-center gap-2 rounded px-1 py-0.5 text-[15px] hover:bg-slate-800/60">
                <input type="checkbox" checked={layers[k]} onChange={(e) => setLayers({ ...layers, [k]: e.target.checked })} className="h-4 w-4 accent-sky-500" />
                <span className="h-3 w-3 rounded-sm" style={{ background: color }} />
                {label}
              </label>
            ))}
          </div>
          <div className="mt-2 text-xs text-slate-500">
            Flood extent: Sentinel-1{view.floodExtentObservedAt ? `, ${new Date(view.floodExtentObservedAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}` : ""}
            {view.floodExtentSynthetic && <span className="text-red-700"> (synthetic demo data)</span>}
          </div>
        </Card>

        <Card title="Safe route">
          <div className="flex gap-2">
            <button onClick={() => setPickMode((p) => !p)} className={`flex-1 rounded-lg px-3 py-2 text-sm font-bold ${pickMode ? "bg-emerald-500 text-[#08203f]" : "bg-slate-800 hover:bg-slate-700"}`}>
              {pickMode ? "Click a point on the map…" : "Pick start point"}
            </button>
            {route && (
              <button onClick={() => setRoute(null)} className="rounded-lg bg-slate-800 px-3 py-2 text-sm hover:bg-slate-700">
                Clear
              </button>
            )}
          </div>
          {route && (
            <div className="mt-2 text-sm">
              <div className="font-bold text-emerald-700">→ {route.shelter?.name ?? "no shelter"} {route.shelter && <span className="font-normal text-slate-400">({route.shelter.space} spaces)</span>}</div>
              <div className="text-slate-400">
                {route.distanceM !== null && formatDistance(route.distanceM)} · {route.method === "openrouteservice" ? `~${route.durationMin} min, avoids flood` : "straight-line guide"}
              </div>
              {route.warnings.map((w) => (
                <div key={w} className="text-xs text-red-700">
                  ⚠ {w}
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card title={`Hotspots (${view.hotspots.length})`}>
          {view.hotspots.length === 0 && <div className="text-sm text-slate-500">No clusters (≥5 requests within 500 m in 15 min).</div>}
          {view.hotspots.map((h, i) => (
            <button key={i} onClick={() => setFlyTo({ center: h.center, zoom: 15.5, key: Date.now() })} className="mb-1 flex w-full items-center justify-between rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-left hover:bg-red-100">
              <span className="font-bold text-red-700">🔥 {h.count} requests</span>
              <span className="text-xs text-red-700">within {h.radiusM} m · zoom →</span>
            </button>
          ))}
        </Card>
      </aside>

      {/* ---------- right column ---------- */}
      <aside className="absolute bottom-24 right-3 top-20 z-10 flex w-[420px] flex-col overflow-hidden rounded-xl border border-slate-800 bg-slate-950/90 backdrop-blur">
        <div className="flex border-b border-slate-800 text-[15px] font-bold">
          {(
            [
              ["queue", `Queue (${open.length})`],
              ["zones", "Risk zones"],
              ["alerts", "Alerts"],
            ] as const
          ).map(([k, label]) => (
            <button key={k} onClick={() => setTab(k)} className={`flex-1 px-3 py-3 ${tab === k ? "border-b-2 border-sky-400 text-sky-700" : "text-slate-400 hover:text-slate-200"}`}>
              {label}
            </button>
          ))}
        </div>

        <div className="fg-scroll flex-1 overflow-y-auto p-3">
          {tab === "queue" && (
            <>
              {sel && <RequestDetail r={sel} view={view} now={now} onClose={() => setSelected(null)} act={act} routeFrom={routeFrom} />}
              {open.length === 0 && !sel && <div className="py-10 text-center text-slate-500">No open help requests.</div>}
              <div className="space-y-2" data-testid="queue">
                {open.map((r) => (
                  <QueueRow key={r.id} r={r} now={now} zoneName={view.zones.find((z) => z.id === r.zoneId)?.shortName ?? "Unknown area"} selected={r.id === selected} onClick={() => selectRequest(r.id)} vol={r.assignedVolunteerId ? volById.get(r.assignedVolunteerId) : r.offer ? volById.get(r.offer.volunteerId) : undefined} />
                ))}
              </div>
              {closed.length > 0 && (
                <>
                  <div className="mb-1 mt-4 text-xs font-bold uppercase tracking-wider text-slate-500">Closed (24h)</div>
                  <div className="space-y-1">
                    {closed.slice(0, 30).map((r) => (
                      <button key={r.id} onClick={() => selectRequest(r.id)} className="flex w-full items-center justify-between rounded-lg px-2 py-1.5 text-left text-sm hover:bg-slate-800/60" data-testid={`closed-${r.ref}`}>
                        <span className="font-mono font-bold">{r.ref}</span>
                        <span className={`rounded px-2 py-0.5 text-xs ${STATUS_CLASS[r.status]}`}>{STATUS_LABEL[r.status]}</span>
                        <span className="text-xs text-slate-500">{r.rescuedAt ? `in ${ago(r.createdAt, Date.parse(r.rescuedAt))}` : r.closeReason ?? ""}</span>
                      </button>
                    ))}
                  </div>
                </>
              )}
            </>
          )}

          {tab === "zones" && (
            <div className="space-y-2">
              {zonesSorted.map((z) => (
                <div key={z.id} className={`rounded-xl border p-3 ${z.id === zoneSel ? "border-sky-500 bg-slate-900" : "border-slate-800 bg-slate-900/60"}`} onClick={() => setZoneSel(z.id)} data-testid={`zone-${z.id}`}>
                  <div className="flex items-center justify-between">
                    <div className="text-lg font-bold">{z.name}</div>
                    <span className={`rounded border px-2 py-0.5 text-sm font-black ${LEVEL_BG[z.level]}`}>{z.level.toUpperCase()}</span>
                  </div>
                  <div className="mt-1 h-1.5 overflow-hidden rounded bg-slate-800">
                    <div className="h-full transition-all duration-700" style={{ width: `${Math.round(z.score * 100)}%`, background: LEVEL_COLOR[z.level] }} />
                  </div>
                  <ul className="mt-2 space-y-0.5 text-sm text-slate-300">
                    {z.reasons.map((x) => (
                      <li key={x}>• {x}</li>
                    ))}
                  </ul>
                  <div className="mt-1 text-xs text-slate-500">
                    score {z.score.toFixed(2)} · {z.residents} registered · {z.vulnerableHouseholds} vulnerable households
                  </div>
                  {z.id === zoneSel && tPos === null && (
                    <div className="mt-2 flex flex-wrap gap-2">
                      <button
                        className="rounded-lg bg-red-600 px-3 py-1.5 text-sm font-bold hover:bg-red-500"
                        onClick={(e) => {
                          e.stopPropagation();
                          void act(async () => {
                            const r = await postJson<{ sms: number; voice: number; skipped: number }>(`/api/operator/zones/${z.id}`, { action: "alert" });
                            setToast(`Alerts: ${r.sms} SMS + ${r.voice} voice queued, ${r.skipped} skipped (de-dup)`);
                          }, "Alerts sent");
                        }}
                      >
                        Send alerts
                      </button>
                      <button
                        className="rounded-lg bg-slate-700 px-3 py-1.5 text-sm font-bold hover:bg-slate-600"
                        onClick={async (e) => {
                          e.stopPropagation();
                          const r = await fetch(`/api/operator/zones/${z.id}`).then((x) => x.json());
                          setRadio({ zone: z.name, text: r.script });
                        }}
                      >
                        📻 Radio script
                      </button>
                      {z.override ? (
                        <button className="rounded-lg bg-slate-800 px-3 py-1.5 text-sm hover:bg-slate-700" onClick={(e) => (e.stopPropagation(), void act(() => postJson(`/api/operator/zones/${z.id}`, { action: "clear_override" }), "Override cleared"))}>
                          Clear override
                        </button>
                      ) : (
                        <button className="rounded-lg bg-slate-800 px-3 py-1.5 text-sm hover:bg-slate-700" onClick={(e) => (e.stopPropagation(), void act(() => postJson(`/api/operator/zones/${z.id}`, { action: "override", level: "high" }), "Zone raised to HIGH"))}>
                          Raise to HIGH
                        </button>
                      )}
                    </div>
                  )}
                </div>
              ))}
              {zone && <div className="text-xs text-slate-500">Selected: {zone.name}</div>}
            </div>
          )}

          {tab === "alerts" && (
            <div className="space-y-2 text-sm">
              <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-3">
                <div className="mb-1 font-bold">Language templates</div>
                {Object.entries(view.languageStatus).map(([l, st]) => (
                  <div key={l} className="flex justify-between">
                    <span className="uppercase">{l}</span>
                    <span className={st === "NEEDS_NATIVE_REVIEW" ? "text-red-700" : "text-green-700"}>{st === "NEEDS_NATIVE_REVIEW" ? "English fallback — needs native review" : st}</span>
                  </div>
                ))}
              </div>
              {view.alerts.length === 0 && <div className="py-6 text-center text-slate-500">No alerts sent yet.</div>}
              {view.alerts.map((a) => (
                <div key={a.id} className="flex items-center justify-between rounded-lg border border-slate-800 px-3 py-2">
                  <div>
                    <span className={`mr-2 rounded border px-1.5 text-xs font-bold ${LEVEL_BG[(a.level as "low") ?? "low"] ?? ""}`}>{a.level.toUpperCase()}</span>
                    <b>{view.zones.find((z) => z.id === a.zoneId)?.shortName}</b> · {a.channel === "radio_script" ? "📻 radio script" : a.channel === "voice" ? "📞 voice" : "✉ SMS"} · {a.language.toUpperCase()}
                    {a.fallbackFrom && <span className="ml-1 text-xs text-red-700">(sent in English)</span>}
                  </div>
                  <div className="text-right text-xs text-slate-400">
                    {a.channel !== "radio_script" && <div className="font-bold text-slate-200">{a.sentCount} sent</div>}
                    {new Date(a.createdAt).toLocaleTimeString()}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </aside>

      {/* ---------- timeline ---------- */}
      <footer className="absolute inset-x-3 bottom-3 z-10 flex h-[72px] items-center gap-4 rounded-xl border border-slate-800 bg-slate-950/90 px-4 backdrop-blur">
        <button
          onClick={() => {
            if (tPos === null) setTPos(0);
            setPlaying((p) => !p);
          }}
          className="rounded-lg bg-slate-800 px-3 py-2 text-lg hover:bg-slate-700"
          title="Replay the event"
        >
          {playing ? "⏸" : "▶"}
        </button>
        <div className="flex-1">
          <input
            type="range"
            min={0}
            max={1000}
            value={tPos ?? 1000}
            onChange={(e) => {
              setPlaying(false);
              setTPos(Number(e.target.value) >= 1000 ? null : Number(e.target.value));
            }}
            className="w-full accent-sky-500"
            aria-label="Timeline"
          />
          <div className="flex justify-between text-xs text-slate-400">
            <span>Event start {new Date(view.demo.demoStartedAt).toLocaleTimeString()}</span>
            <span className="font-bold text-slate-200">{tIso ? `Showing ${new Date(tIso).toLocaleTimeString()}` : "Live"}</span>
            <span>Now</span>
          </div>
        </div>
        <button onClick={() => (setTPos(null), setPlaying(false))} className={`rounded-lg px-4 py-2 font-black ${tPos === null ? "bg-green-600 text-slate-50" : "bg-slate-800 text-green-700 hover:bg-slate-700"}`}>
          LIVE
        </button>
      </footer>

      {radio && (
        <div className="absolute inset-0 z-30 grid place-items-center bg-black/60" onClick={() => setRadio(null)}>
          <div className="w-[640px] max-w-[95vw] rounded-2xl border border-slate-700 bg-slate-900 p-5" onClick={(e) => e.stopPropagation()}>
            <div className="mb-2 flex items-center justify-between">
              <div className="text-lg font-bold">📻 Community radio script — {radio.zone}</div>
              <button onClick={() => setRadio(null)} className="text-slate-400 hover:text-slate-50">
                ✕
              </button>
            </div>
            <textarea readOnly value={radio.text} className="h-80 w-full rounded-lg bg-slate-950 p-3 font-mono text-sm text-slate-200" />
            <button onClick={() => void navigator.clipboard.writeText(radio.text).then(() => setToast("Copied"))} className="mt-2 rounded-lg bg-sky-600 px-4 py-2 font-bold hover:bg-sky-500">
              Copy for radio station
            </button>
          </div>
        </div>
      )}

      {toast && <div className="absolute left-1/2 top-20 z-40 -translate-x-1/2 rounded-xl border border-slate-600 bg-slate-900 px-5 py-3 text-lg shadow-2xl">{toast}</div>}
    </div>
  );
}

function Stat({ label, value, color, testid }: { label: string; value: number | string; color: string; testid?: string }) {
  return (
    <div className="min-w-[78px] rounded-lg border border-slate-800 bg-slate-900/80 px-3 py-1 text-center">
      <div className={`text-2xl font-black leading-none ${color}`} data-testid={testid}>
        {value}
      </div>
      <div className="text-[11px] uppercase tracking-wide text-slate-400">{label}</div>
    </div>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-slate-800 bg-slate-950/90 p-3 backdrop-blur">
      <div className="mb-2 text-xs font-bold uppercase tracking-wider text-slate-400">{title}</div>
      {children}
    </section>
  );
}

function QueueRow({ r, now, selected, onClick, vol, zoneName }: { r: RequestState; now: number; selected: boolean; onClick: () => void; vol?: LiveState["volunteers"][number]; zoneName: string }) {
  const src = SOURCE_LABEL[r.locationSource];
  return (
    <button onClick={onClick} className={`w-full rounded-xl border p-3 text-left transition ${selected ? "border-sky-500 bg-slate-800" : "border-slate-800 bg-slate-900/70 hover:border-slate-600"}`} data-testid={`req-${r.ref}`}>
      <div className="flex items-center gap-3">
        <div className="grid h-12 w-12 shrink-0 place-items-center rounded-lg text-xl font-black text-[#08203f]" style={{ background: urgencyColor(r.urgency) }} title="Urgency score">
          {r.urgency}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="font-mono text-lg font-bold">{r.ref}</span>
            {r.vulnerableFlag && <span title="Vulnerable household">💗</span>}
            <span className={`rounded px-2 py-0.5 text-xs font-bold ${STATUS_CLASS[r.status]}`}>{r.status === "new" && r.offer ? "Offered" : STATUS_LABEL[r.status]}</span>
            <span className="ml-auto text-sm tabular-nums text-slate-400">{ago(r.createdAt, now)}</span>
          </div>
          <div className="truncate text-sm text-slate-300">
            👥 {r.people} · {r.landmark ?? zoneName} · <span className={src?.cls}>{src?.label}</span>
            {vol && (
              <span className="text-sky-700">
                {" "}
                · {VOL_ICON[vol.type]} {vol.name.split(" ")[0]}
              </span>
            )}
          </div>
          <div className="truncate text-xs text-slate-500">{r.reasons.slice(1, 4).map((x) => x.label).join(" · ")}</div>
        </div>
      </div>
    </button>
  );
}

function RequestDetail({ r, view, now, onClose, act, routeFrom }: { r: RequestState; view: LiveState; now: number; onClose: () => void; act: (fn: () => Promise<unknown>, ok: string) => Promise<void>; routeFrom: (p: LngLat) => void }) {
  const [phone, setPhone] = useState<string | null>(null);
  const [assignTo, setAssignTo] = useState("");
  const src = SOURCE_LABEL[r.locationSource];
  const vol = r.assignedVolunteerId ? view.volunteers.find((v) => v.id === r.assignedVolunteerId) : null;
  const offerVol = r.offer ? view.volunteers.find((v) => v.id === r.offer!.volunteerId) : null;
  const free = view.volunteers.filter((v) => v.available && v.status !== "on_job").sort((a, b) => a.name.localeCompare(b.name));
  const isOpen = ["new", "assigned", "en_route"].includes(r.status);
  const zoneName = view.zones.find((z) => z.id === r.zoneId)?.name ?? "Unknown area";
  useEffect(() => setPhone(null), [r.id]);

  return (
    <div className="mb-3 rounded-xl border border-sky-300 bg-slate-900 p-4" data-testid="request-detail">
      <div className="flex items-start justify-between">
        <div>
          <div className="font-mono text-2xl font-black">{r.ref}</div>
          <div className="text-slate-400">
            {zoneName} · via {r.channel.toUpperCase()} · {ago(r.createdAt, now)} ago{r.mergedCount ? ` · ${r.mergedCount} follow-up msg` : ""}
          </div>
        </div>
        <button onClick={onClose} className="text-slate-500 hover:text-slate-50">
          ✕
        </button>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <span className={`rounded px-2 py-1 text-sm font-bold ${STATUS_CLASS[r.status]}`} data-testid="detail-status">
          {STATUS_LABEL[r.status]}
        </span>
        <span className="rounded bg-slate-800 px-2 py-1 text-sm">👥 {r.people} people</span>
        {r.insideFlood && <span className="rounded bg-blue-50 px-2 py-1 text-sm text-blue-700">🌊 inside flood extent</span>}
        {!r.registered && <span className="rounded bg-slate-800 px-2 py-1 text-sm text-slate-300">unregistered number</span>}
      </div>

      <div className="mt-3">
        <div className="text-xs font-bold uppercase tracking-wider text-slate-500">Urgency {r.urgency}/100 — why</div>
        <table className="mt-1 w-full text-sm">
          <tbody>
            {r.reasons.map((x) => (
              <tr key={x.label}>
                <td className="py-0.5">{x.label}</td>
                <td className="py-0.5 text-right font-mono text-slate-300">+{x.points}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {r.vulnerable.length > 0 && <div className="mt-2 text-sm text-pink-700">💗 {r.vulnerable.map((v) => `${v.count > 1 ? v.count + " " : ""}${VULNERABLE_LABELS[v.type]}`).join(", ")}</div>}
      {r.message && <div className="mt-2 rounded-lg bg-slate-950 p-2 text-sm italic text-slate-300">“{r.message}”</div>}

      <div className="mt-2 text-sm">
        <span className={`font-bold ${src?.cls}`}>📍 {src?.label}</span> <span className="text-slate-400">— {src?.hint}</span>
        {r.landmark && <div className="text-slate-300">near {r.landmark}</div>}
      </div>
      <div className="mt-1 text-sm">
        {r.name ?? "Unregistered"} · <span className="font-mono">{phone ?? r.phoneMasked}</span>{" "}
        {!phone && (
          <button className="text-xs text-sky-700 hover:underline" onClick={async () => setPhone((await postJson<{ phone: string }>(`/api/operator/requests/${r.id}`, { action: "reveal" })).phone)}>
            reveal (logged)
          </button>
        )}
      </div>

      {vol && (
        <div className="mt-2 text-sm text-sky-700">
          {VOL_ICON[vol.type]} {vol.name} — {STATUS_LABEL[r.status]}
          {vol.arrived ? " · arrived on scene" : ""}
        </div>
      )}
      {r.offer && offerVol && (
        <div className="mt-2 text-sm text-slate-300">
          ⏳ Offered to {VOL_ICON[offerVol.type]} {offerVol.name}
          {r.offer.operatorAssigned ? " (by operator)" : ""} · expires in {Math.max(0, Math.round((Date.parse(r.offer.expiresAt) - now) / 1000))}s
        </div>
      )}
      {r.status === "new" && !r.offer && <div className="mt-2 text-sm text-red-700">No volunteer available yet — will auto-offer when one is free.</div>}

      {isOpen && (
        <div className="mt-3 space-y-2">
          <div className="flex gap-2">
            <select value={assignTo} onChange={(e) => setAssignTo(e.target.value)} className="min-w-0 flex-1 rounded-lg border border-slate-700 bg-slate-950 px-2 py-2 text-sm">
              <option value="">Assign a volunteer…</option>
              {free.map((v) => (
                <option key={v.id} value={v.id}>
                  {VOL_ICON[v.type]} {v.name} ({v.status})
                </option>
              ))}
            </select>
            <button disabled={!assignTo} onClick={() => void act(() => postJson(`/api/operator/requests/${r.id}`, { action: "reassign", volunteerId: assignTo }), "Offer sent to volunteer")} className="rounded-lg bg-sky-600 px-3 py-2 text-sm font-bold hover:bg-sky-500 disabled:opacity-40">
              Assign
            </button>
          </div>
          <div className="flex flex-wrap gap-2">
            {(r.status !== "new" || r.offer) && (
              <button onClick={() => void act(() => postJson(`/api/operator/requests/${r.id}`, { action: "unassign" }), "Returned to pool")} className="rounded-lg bg-slate-800 px-3 py-1.5 text-sm hover:bg-slate-700">
                Unassign
              </button>
            )}
            <button onClick={() => routeFrom(r.lngLat)} className="rounded-lg bg-emerald-800 px-3 py-1.5 text-sm hover:bg-emerald-700">
              Safe route to shelter
            </button>
            <button onClick={() => void act(() => postJson(`/api/operator/requests/${r.id}`, { action: "duplicate" }), "Marked duplicate")} className="rounded-lg bg-slate-800 px-3 py-1.5 text-sm hover:bg-slate-700">
              Duplicate
            </button>
            <button onClick={() => confirm("Close this request without rescue?") && void act(() => postJson(`/api/operator/requests/${r.id}`, { action: "cancel" }), "Closed")} className="rounded-lg bg-slate-800 px-3 py-1.5 text-sm text-red-700 hover:bg-slate-700">
              Close
            </button>
          </div>
        </div>
      )}
      {r.closeReason && <div className="mt-2 text-xs text-slate-500">Closed: {r.closeReason}</div>}
    </div>
  );
}
