"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { postJson, useHeartbeat, useLiveJson } from "@/lib/client/live";
import type { LiveState } from "@/lib/types/state";
import { LEVEL_BG } from "@/components/ui";
import { getRegion } from "../../../config/regions";

interface Msg {
  id: number;
  channel: string;
  to: string;
  subject: string | null;
  body: string;
  language: string | null;
  purpose: string;
  status: string;
  attempts: number;
  provider: string | null;
  last_error: string | null;
  created_at: string;
}

const STEPS = [
  "Open /command on the projector (2nd screen).",
  "Start rainfall replay → the low-lying zones turn HIGH; alerts go out in each resident's language.",
  "On /sim (Mama Ngozi, first preset) type HELP 3 people roof → pin drops on the map, ranked by urgency.",
  "On a phone open /volunteer as the demo captain (OTP 123456) → Accept.",
  "Tick “simulate my travel” → boat moves on the map.",
  "Press Rescued → pin turns green; family gets “is safe” SMS (see log / sim).",
];

export default function DemoPanel() {
  const { data: live, refetch } = useLiveJson<LiveState>("/api/state", { pollMs: 3000 });
  const { data: log, refetch: refetchLog } = useLiveJson<{ provider: string; emailProvider: string; counts: { total: number; queued: number; failed: number }; messages: Msg[] }>("/api/messages?limit=60", { pollMs: 2500 });
  useHeartbeat(1000);
  const [zone, setZone] = useState(getRegion().demoZones[0]);
  const [level, setLevel] = useState("high");
  const [force, setForce] = useState(false);
  const [speed, setSpeed] = useState(4);
  const [result, setResult] = useState<string>("");
  const [busy, setBusy] = useState<string | null>(null);
  const [filter, setFilter] = useState("");

  useEffect(() => {
    if (live && !live.zones.some((z) => z.id === zone) && live.zones[0]) setZone(live.zones[0].id);
  }, [live, zone]);

  const run = async (name: string, action: string, body: Record<string, unknown> = {}) => {
    setBusy(name);
    try {
      const r = await postJson<Record<string, unknown>>(`/api/demo/${action}`, body);
      setResult(`${name}: ${summarize(action, r)}`);
    } catch (e) {
      setResult(`${name} failed: ${(e as Error).message}`);
    } finally {
      setBusy(null);
      void refetch();
      void refetchLog();
    }
  };

  const d = live?.demo;
  return (
    <main className="mx-auto max-w-7xl px-4 py-6">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-3xl font-black">Demo control panel</h1>
        <span className="rounded-full border border-sky-300 px-3 py-1 text-sm text-sky-700">messaging: {log?.provider ?? "…"} · email: {log?.emailProvider ?? "…"}</span>
        <div className="ml-auto flex gap-2">
          <Link href="/command" target="_blank" className="rounded-lg bg-sky-700 px-4 py-2 font-bold hover:bg-sky-600">
            Command map ↗
          </Link>
          <Link href="/sim" target="_blank" className="rounded-lg bg-slate-100 px-4 py-2 font-bold hover:bg-slate-300">
            Phone sim ↗
          </Link>
          <Link href="/volunteer" target="_blank" className="rounded-lg bg-slate-100 px-4 py-2 font-bold hover:bg-slate-300">
            Volunteer ↗
          </Link>
        </div>
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-3">
        <Panel title="1 · Rainfall replay (NASA IMERG, Oct 2022)">
          <div className="text-sm text-slate-600">
            {d?.simTime ? (
              <>
                Sim time <b className="text-purple-700">{new Date(d.simTime).toUTCString().slice(5, 22)}</b> {d.replayRunning ? "▶ running" : "⏸"}
              </>
            ) : (
              "Live (no replay)"
            )}
          </div>
          <div className="mt-2 flex items-center gap-2">
            <label className="text-sm text-slate-600">Speed</label>
            <select value={speed} onChange={(e) => setSpeed(Number(e.target.value))} className="rounded bg-slate-100 px-2 py-1">
              {[1, 2, 4, 8, 16].map((s) => (
                <option key={s} value={s}>
                  {s} h/s
                </option>
              ))}
            </select>
          </div>
          <div className="mt-3 flex gap-2">
            <Btn busy={busy} name="Start rainfall replay" onClick={() => run("Start rainfall replay", "start-replay", { speed })} primary testid="btn-replay" />
            <Btn busy={busy} name="Stop" onClick={() => run("Stop", "stop-replay")} />
          </div>
        </Panel>

        <Panel title="2 · Raise zone / send alerts">
          <div className="flex gap-2">
            <select data-testid="zone-select" value={zone} onChange={(e) => setZone(e.target.value)} className="flex-1 rounded bg-slate-100 px-2 py-1">
              {live?.zones.map((z) => (
                <option key={z.id} value={z.id}>
                  {z.name}
                </option>
              ))}
            </select>
            <select value={level} onChange={(e) => setLevel(e.target.value)} className="rounded bg-slate-100 px-2 py-1">
              {["medium", "high", "severe"].map((l) => (
                <option key={l}>{l}</option>
              ))}
            </select>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <Btn busy={busy} name="Raise zone" onClick={() => run("Raise zone", "raise-zone", { zoneId: zone, level })} primary testid="btn-raise" />
            <Btn busy={busy} name="Send alerts" onClick={() => run("Send alerts", "send-alerts", { zoneId: zone, force })} testid="btn-alerts" />
            <Btn busy={busy} name="Clear overrides" onClick={() => run("Clear overrides", "clear-overrides")} />
          </div>
          <label className="mt-2 flex items-center gap-2 text-sm text-slate-600">
            <input type="checkbox" checked={force} onChange={(e) => setForce(e.target.checked)} /> force re-send (ignore de-dup)
          </label>
          <label className="mt-1 flex items-center gap-2 text-sm text-slate-600">
            <input type="checkbox" checked={d?.autoAlerts ?? true} onChange={(e) => run("Auto alerts", "flags", { autoAlerts: e.target.checked })} /> auto-alert when risk rises
          </label>
        </Panel>

        <Panel title="3 · Requests & volunteers">
          <div className="flex flex-wrap gap-2">
            <Btn busy={busy} name="Inject 10 help requests" onClick={() => run("Inject 10 help requests", "inject", { count: 10 })} primary testid="btn-inject" />
          </div>
          <label className="mt-3 flex items-center gap-2">
            <input type="checkbox" checked={d?.moveVolunteers ?? false} onChange={(e) => run("Move volunteers", "flags", { moveVolunteers: e.target.checked })} /> <b>Move volunteers</b>
            <span className="text-sm text-slate-600">simulated volunteers drive to their jobs</span>
          </label>
          <label className="mt-1 flex items-center gap-2">
            <input type="checkbox" checked={d?.autopilot ?? false} onChange={(e) => run("Autopilot", "flags", { autopilot: e.target.checked })} /> <b>Autopilot</b>
            <span className="text-sm text-slate-600">simulated volunteers accept, travel &amp; rescue</span>
          </label>
          <div className="mt-3">
            <Btn busy={busy} name="Reset demo" danger onClick={() => confirm("Reset all requests, alerts and messages?") && run("Reset demo", "reset")} testid="btn-reset" />
          </div>
        </Panel>
      </div>

      {result && <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 font-mono text-sm" data-testid="demo-result">{result}</div>}

      <div className="mt-6 grid gap-4 lg:grid-cols-[320px_1fr]">
        <div className="space-y-4">
          <Panel title="Zones">
            <div className="space-y-1">
              {live?.zones
                .slice()
                .sort((a, b) => b.score - a.score)
                .map((z) => (
                  <div key={z.id} className="flex items-center justify-between text-sm">
                    <span>{z.shortName}</span>
                    <span className="text-xs text-slate-500">{Math.round(z.rain24h)}mm</span>
                    <span className={`rounded border px-1.5 text-xs font-bold ${LEVEL_BG[z.level]}`}>{z.level.toUpperCase()}</span>
                  </div>
                ))}
            </div>
            {live && (
              <div className="mt-3 text-sm text-slate-600">
                Waiting {live.stats.waiting} · En route {live.stats.assigned + live.stats.enRoute} · Rescued {live.stats.rescued} · Safe {live.stats.safeCheckins}
              </div>
            )}
          </Panel>
          <Panel title="60-second demo script">
            <ol className="list-decimal space-y-1 pl-5 text-sm text-slate-700">
              {STEPS.map((s) => (
                <li key={s}>{s}</li>
              ))}
            </ol>
          </Panel>
        </div>

        <Panel title={`Outbound messages — ${log?.counts.total ?? 0} total, ${log?.counts.queued ?? 0} queued, ${log?.counts.failed ?? 0} failed`}>
          <input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="filter (phone, purpose, text)…" className="mb-2 w-full rounded bg-slate-100 px-2 py-1 text-sm" />
          <div className="fg-scroll max-h-[520px] overflow-y-auto" data-testid="message-log">
            <table className="w-full text-left text-sm">
              <thead className="sticky top-0 bg-slate-50 text-xs uppercase text-slate-500">
                <tr>
                  <th className="py-1 pr-2">Time</th>
                  <th className="pr-2">Ch</th>
                  <th className="pr-2">To</th>
                  <th className="pr-2">Lang</th>
                  <th className="pr-2">Purpose</th>
                  <th className="pr-2">Message</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {log?.messages
                  .filter((m) => !filter || `${m.to} ${m.purpose} ${m.subject ?? ""} ${m.body}`.toLowerCase().includes(filter.toLowerCase()))
                  .map((m) => (
                    <tr key={m.id} className="border-t border-slate-200 align-top">
                      <td className="whitespace-nowrap py-1 pr-2 text-xs text-slate-500">{new Date(m.created_at).toLocaleTimeString()}</td>
                      <td title={m.channel}>{m.channel === "voice" ? "📞" : m.channel === "email" ? "📧" : "✉"}</td>
                      <td className="whitespace-nowrap pr-2 font-mono text-xs">{m.to}</td>
                      <td className="text-xs uppercase">{m.language ?? ""}</td>
                      <td className="pr-2 text-xs text-sky-700">{m.purpose}</td>
                      <td className="pr-2 text-xs text-slate-700">{m.subject ? <b className="block text-slate-900">{m.subject}</b> : null}{m.channel === "email" ? m.body.split("\n").slice(2, 4).join(" ") : m.body}</td>
                      <td className={`text-xs ${m.status === "failed" ? "text-red-700" : m.status === "queued" ? "text-sky-700" : "text-green-700"}`} title={m.last_error ?? ""}>
                        {m.status}
                        {m.attempts > 1 ? ` (${m.attempts})` : ""}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </Panel>
      </div>
    </main>
  );
}

function summarize(action: string, r: Record<string, unknown>): string {
  if (action === "raise-zone") {
    const c = (r.changes as { zoneId: string; from: string; to: string }[]) ?? [];
    return c.length ? c.map((x) => `${x.zoneId} ${x.from}→${x.to}`).join(", ") + (r.autoAlerts ? " · alerts sent automatically" : "") : "no level change";
  }
  if (action === "send-alerts") {
    const s = (r.summaries as { zoneId: string; sms: number; voice: number; skipped: number; skippedReasons: Record<string, number> }[]) ?? [];
    return s.length ? s.map((x) => `${x.zoneId}: ${x.sms} SMS, ${x.voice} voice, ${x.skipped} skipped${x.skipped ? ` (${Object.keys(x.skippedReasons).join("; ")})` : ""}`).join(" | ") : "no zones at MEDIUM or above";
  }
  if (action === "inject") return `created ${(r.refs as string[]).join(", ")}`;
  return "ok";
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-slate-50/60 p-4">
      <div className="mb-3 text-xs font-bold uppercase tracking-wider text-slate-600">{title}</div>
      {children}
    </section>
  );
}

function Btn({ name, onClick, busy, primary, danger, testid }: { name: string; onClick: () => void; busy: string | null; primary?: boolean; danger?: boolean; testid?: string }) {
  return (
    <button
      data-testid={testid}
      disabled={!!busy}
      onClick={onClick}
      className={`rounded-lg px-4 py-2 font-bold disabled:opacity-50 ${danger ? "bg-red-700 hover:bg-red-600" : primary ? "bg-sky-600 text-[#08203f] hover:bg-sky-500" : "bg-slate-300 hover:bg-slate-400"}`}
    >
      {busy === name ? "…" : name}
    </button>
  );
}
