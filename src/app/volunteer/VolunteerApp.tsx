"use client";
// Volunteer PWA. Deliberately tiny: no map library, polling only, works on slow 3G.
import { useCallback, useEffect, useRef, useState } from "react";

type Reason = { label: string; points: number };
interface JobView {
  jobId: string;
  status: string;
  expiresAt: string | null;
  arrivedAt: string | null;
  operatorAssigned: boolean;
  distanceM: number | null;
  request: {
    id: string;
    ref: string;
    people: number;
    vulnerable: { type: string; count: number }[];
    urgency: number;
    reasons: Reason[];
    locationSource: string;
    landmark: string | null;
    zone: string | null;
    insideFlood: boolean;
    lngLat: [number, number];
    message: string | null;
    phone: string | null;
    name: string | null;
  };
}
interface Me {
  volunteer: { id: string; name: string; type: string; capacity: number; available: boolean; simMove: boolean; lngLat: [number, number] | null };
  offer: JobView | null;
  job: JobView | null;
  shelters: { id: string; name: string; capacity: number; occupancy: number; distanceM?: number; phone: string }[];
}

const ICON: Record<string, string> = { boat: "🚤", vehicle: "🚙", on_foot: "🚶", medical: "⛑️" };
const SRC: Record<string, string> = { registered: "Registered home", ussd_landmark: "Landmark (~200 m)", gps: "GPS", zone_centroid: "Area only — call them", unknown: "Unknown — call them" };
const dist = (m: number | null) => (m === null ? "?" : m < 1000 ? `${m} m` : `${(m / 1000).toFixed(1)} km`);

async function post(url: string, body: unknown) {
  const r = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.error ?? `HTTP ${r.status}`);
  return d;
}

export default function VolunteerApp({ demo, demoPhone }: { demo: boolean; demoPhone: string }) {
  const [me, setMe] = useState<Me | null>(null);
  const [authed, setAuthed] = useState<boolean | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(Date.now());
  const lastOffer = useRef<string | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await fetch("/api/volunteer/me", { cache: "no-store" });
      if (r.status === 401) return setAuthed(false);
      const d = (await r.json()) as Me;
      setMe(d);
      setAuthed(true);
      if (d.offer && d.offer.jobId !== lastOffer.current) {
        lastOffer.current = d.offer.jobId;
        navigator.vibrate?.([300, 150, 300, 150, 600]);
      }
    } catch {
      /* offline — keep last state */
    }
  }, []);

  useEffect(() => {
    void load();
    const t = setInterval(load, 3000);
    const c = setInterval(() => setNow(Date.now()), 1000);
    if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js", { scope: "/volunteer" }).catch(() => {});
    return () => (clearInterval(t), clearInterval(c));
  }, [load]);

  // Share live location ONLY while on an active job.
  const jobId = me?.job?.jobId;
  useEffect(() => {
    if (!jobId || !("geolocation" in navigator) || me?.volunteer.simMove) return;
    let last = 0;
    const id = navigator.geolocation.watchPosition(
      (p) => {
        if (Date.now() - last < 5000) return;
        last = Date.now();
        void post("/api/volunteer/location", { lngLat: [p.coords.longitude, p.coords.latitude] }).catch(() => {});
      },
      () => {},
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 20000 },
    );
    return () => navigator.geolocation.clearWatch(id);
  }, [jobId, me?.volunteer.simMove]);

  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    setErr(null);
    try {
      await fn();
      await load();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  if (authed === null) return <Shell>Loading…</Shell>;
  if (!authed) return <Login demo={demo} demoPhone={demoPhone} onDone={load} />;
  if (!me) return <Shell>Loading…</Shell>;

  const v = me.volunteer;
  const offer = me.offer;
  const job = me.job;
  const secsLeft = offer?.expiresAt ? Math.max(0, Math.round((Date.parse(offer.expiresAt) - now) / 1000)) : 0;

  return (
    <Shell>
      <div className="flex items-center justify-between">
        <div>
          <div className="text-lg font-black">
            {ICON[v.type]} {v.name}
          </div>
          <div className="text-xs text-slate-400">
            {v.type.replaceAll("_", " ")} · carries {v.capacity}
          </div>
        </div>
        <button className="text-xs text-slate-500" onClick={() => fetch("/api/auth/logout?who=volunteer", { method: "POST" }).then(() => setAuthed(false))}>
          Sign out
        </button>
      </div>

      {!job && (
        <button
          data-testid="availability"
          disabled={busy}
          onClick={() =>
            run(async () => {
              let lngLat: [number, number] | undefined;
              if (!v.available && "geolocation" in navigator && !demo) {
                lngLat = await new Promise((res) => navigator.geolocation.getCurrentPosition((p) => res([p.coords.longitude, p.coords.latitude]), () => res(undefined), { timeout: 8000 }));
              }
              await post("/api/volunteer/availability", { available: !v.available, lngLat });
            })
          }
          className={`mt-4 w-full rounded-2xl py-5 text-2xl font-black ${v.available ? "bg-green-600" : "bg-slate-700"}`}
        >
          {v.available ? "● AVAILABLE" : "○ OFF DUTY — tap to go on duty"}
        </button>
      )}

      {err && <div className="mt-3 rounded-lg bg-red-900/50 p-3 text-red-200">{err}</div>}

      {offer && !job && (
        <section className="mt-4 rounded-2xl border-2 border-amber-400 bg-amber-950/40 p-4" data-testid="offer">
          <div className="flex items-center justify-between">
            <div className="text-xs font-bold uppercase tracking-wider text-amber-300">{offer.operatorAssigned ? "Assigned by operator" : "New rescue job"}</div>
            <div className="font-mono text-xl font-black text-amber-200">{secsLeft}s</div>
          </div>
          <div className="mt-1 text-3xl font-black">{offer.request.ref}</div>
          <div className="mt-1 text-xl">
            👥 {offer.request.people} people · {dist(offer.distanceM)} away
          </div>
          <div className="text-slate-300">
            📍 {offer.request.landmark ?? offer.request.zone ?? "Unknown area"} {offer.request.insideFlood && "· 🌊 flooded area"}
          </div>
          <div className="mt-2 text-sm">
            <b>Urgency {offer.request.urgency}</b>
            <ul className="text-slate-300">
              {offer.request.reasons.map((r) => (
                <li key={r.label}>• {r.label}</li>
              ))}
            </ul>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-3">
            <button disabled={busy} onClick={() => run(() => post(`/api/volunteer/jobs/${offer.jobId}`, { action: "decline" }))} className="rounded-xl bg-slate-700 py-4 text-xl font-bold">
              Decline
            </button>
            <button data-testid="accept" disabled={busy} onClick={() => run(() => post(`/api/volunteer/jobs/${offer.jobId}`, { action: "accept" }))} className="rounded-xl bg-green-600 py-4 text-xl font-black">
              Accept
            </button>
          </div>
        </section>
      )}

      {job && <ActiveJob job={job} shelters={me.shelters} simMove={v.simMove} demo={demo} busy={busy} run={run} />}

      {!offer && !job && v.available && <div className="mt-8 text-center text-slate-400">Waiting for rescue jobs near you… keep this screen open.</div>}
      <p className="mt-8 text-center text-xs text-slate-600">Your location is shared only while you are on a job.</p>
    </Shell>
  );
}

function ActiveJob({ job, shelters, simMove, demo, busy, run }: { job: JobView; shelters: Me["shelters"]; simMove: boolean; demo: boolean; busy: boolean; run: (fn: () => Promise<unknown>) => Promise<void> }) {
  const [shelterId, setShelterId] = useState(shelters[0]?.id ?? "");
  useEffect(() => {
    if (!shelterId && shelters[0]) setShelterId(shelters[0].id);
  }, [shelters, shelterId]);
  const [lng, lat] = job.request.lngLat;
  const r = job.request;
  return (
    <section className="mt-4 rounded-2xl border-2 border-sky-500 bg-slate-900 p-4" data-testid="job">
      <div className="text-xs font-bold uppercase tracking-wider text-sky-300">{job.arrivedAt ? "On scene" : "On the way"}</div>
      <div className="text-3xl font-black">{r.ref}</div>
      <div className="mt-1 text-xl">
        {r.name ?? "Unregistered caller"} · 👥 {r.people}
      </div>
      {r.vulnerable.length > 0 && <div className="text-pink-200">💗 {r.vulnerable.map((x) => `${x.count > 1 ? x.count + " " : ""}${x.type.replaceAll("_", " ")}`).join(", ")}</div>}
      {r.message && <div className="mt-1 italic text-slate-300">“{r.message}”</div>}
      <div className="mt-1 text-slate-300">
        📍 {r.landmark ?? r.zone ?? "?"} — <span className="text-amber-300">{SRC[r.locationSource] ?? r.locationSource}</span> · {dist(job.distanceM)}
      </div>
      <div className="mt-3 grid grid-cols-2 gap-3">
        <a href={`tel:${r.phone}`} className="rounded-xl bg-slate-700 py-3 text-center text-lg font-bold">
          📞 Call
        </a>
        <a href={`https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`} target="_blank" rel="noreferrer" className="rounded-xl bg-sky-700 py-3 text-center text-lg font-bold">
          🧭 Navigate
        </a>
      </div>
      {demo && (
        <label className="mt-3 flex items-center gap-2 text-sm text-amber-300">
          <input type="checkbox" checked={simMove} onChange={(e) => void run(() => post("/api/volunteer/sim-move", { on: e.target.checked }))} /> Demo: simulate my travel on the command map
        </label>
      )}
      {!job.arrivedAt && (
        <button data-testid="arrived" disabled={busy} onClick={() => run(() => post(`/api/volunteer/jobs/${job.jobId}`, { action: "arrived" }))} className="mt-3 w-full rounded-xl bg-slate-600 py-4 text-xl font-bold">
          I have arrived
        </button>
      )}
      <div className="mt-3">
        <label className="text-sm text-slate-400">Take them to:</label>
        <select value={shelterId} onChange={(e) => setShelterId(e.target.value)} className="mt-1 w-full rounded-lg bg-slate-800 p-3">
          {shelters.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name} — {s.capacity - s.occupancy} spaces · {dist(s.distanceM ?? null)}
            </option>
          ))}
          <option value="">Not going to a shelter</option>
        </select>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-3">
        <button disabled={busy} onClick={() => confirm("Could not reach them? The job goes back to the queue with higher urgency.") && run(() => post(`/api/volunteer/jobs/${job.jobId}`, { action: "could_not_reach" }))} className="rounded-xl bg-red-800 py-4 text-lg font-bold">
          Could not reach
        </button>
        <button data-testid="rescued" disabled={busy} onClick={() => run(() => post(`/api/volunteer/jobs/${job.jobId}`, { action: "rescued", shelterId: shelterId || null }))} className="rounded-xl bg-green-600 py-4 text-xl font-black">
          ✓ Rescued
        </button>
      </div>
    </section>
  );
}

function Login({ demo, demoPhone, onDone }: { demo: boolean; demoPhone: string; onDone: () => void }) {
  const [phone, setPhone] = useState(demo ? demoPhone : "");
  const [code, setCode] = useState("");
  const [sent, setSent] = useState(false);
  const [hint, setHint] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  return (
    <Shell>
      <h1 className="text-2xl font-black">Volunteer login</h1>
      <p className="text-slate-400">Boat owners, drivers and responders</p>
      <form
        className="mt-4 space-y-3"
        onSubmit={async (e) => {
          e.preventDefault();
          setErr(null);
          try {
            if (!sent) {
              const d = await post("/api/auth/otp", { phone });
              setSent(true);
              setHint(d.demoHint ?? "We sent you a code by SMS.");
            } else {
              await post("/api/auth/otp/verify", { phone, code });
              onDone();
            }
          } catch (e) {
            setErr((e as Error).message);
          }
        }}
      >
        <input data-testid="phone" className="w-full rounded-xl bg-slate-800 p-4 text-xl" inputMode="tel" placeholder="Phone number" value={phone} onChange={(e) => setPhone(e.target.value)} disabled={sent} />
        {sent && <input data-testid="code" className="w-full rounded-xl bg-slate-800 p-4 text-center font-mono text-2xl tracking-widest" inputMode="numeric" placeholder="6-digit code" value={code} onChange={(e) => setCode(e.target.value)} autoFocus />}
        {hint && <div className="text-sm text-amber-300">{hint}</div>}
        {err && <div className="text-sm text-red-400">{err}</div>}
        <button data-testid="login-submit" className="w-full rounded-xl bg-sky-600 py-4 text-xl font-bold">
          {sent ? "Log in" : "Send code"}
        </button>
      </form>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return <main className="mx-auto min-h-screen max-w-md px-4 py-5">{children}</main>;
}
