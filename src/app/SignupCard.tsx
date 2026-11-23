"use client";
// Sign-up card on the landing page: light-blue card, auto-detects the area from the
// device location, and works anywhere — outside the covered areas people give their town.
import { useEffect, useState } from "react";

type Zone = { id: string; name: string };
const LANGS = [
  ["en", "English"],
  ["pcm", "Pidgin"],
  ["ha", "Hausa"],
  ["yo", "Yoruba"],
  ["ig", "Igbo"],
] as const;
const OTHER = "__other";

type Locate =
  | { state: "idle" | "detecting" | "denied" | "unavailable" }
  | { state: "found"; zoneName: string }
  | { state: "outside"; region: string; km: number };

const input = "w-full rounded-xl border border-[#9cc8f0] bg-white px-3.5 py-3 text-[15px] text-[#0a2452] placeholder:text-[#6b8fb8] outline-none transition focus:border-[#0b4ea2] focus:ring-4 focus:ring-[#8fd0ff]/40";

export default function SignupCard({ regionName }: { regionName: string }) {
  const [zones, setZones] = useState<Zone[]>([]);
  const [f, setF] = useState({ name: "", email: "", phone: "", zoneId: "", locality: "", lang: "en", consent: false });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState<{ email: string; covered: boolean; verification: string | null; demoVerifyUrl: string | null } | null>(null);
  const [loc, setLoc] = useState<Locate>({ state: "idle" });
  const set = (k: keyof typeof f, v: string | boolean) => setF((x) => ({ ...x, [k]: v }));

  useEffect(() => {
    fetch("/api/public/zones")
      .then((r) => r.json())
      .then((d) => setZones(d.zones))
      .catch(() => {});
  }, []);

  // Detect the area from the device location (the browser asks permission once).
  // Only the resulting area is used — coordinates are never stored.
  const detect = () => {
    if (!("geolocation" in navigator)) return setLoc({ state: "unavailable" });
    setLoc({ state: "detecting" });
    navigator.geolocation.getCurrentPosition(
      async (p) => {
        try {
          const d = await fetch(`/api/public/locate?lat=${p.coords.latitude}&lng=${p.coords.longitude}`).then((r) => r.json());
          if (d.zoneId) {
            setF((x) => (x.zoneId ? x : { ...x, zoneId: d.zoneId }));
            setLoc({ state: "found", zoneName: d.zoneName });
          } else {
            setF((x) => (x.zoneId ? x : { ...x, zoneId: OTHER }));
            setLoc({ state: "outside", region: d.region, km: d.distanceToRegionKm });
          }
        } catch {
          setLoc({ state: "unavailable" });
        }
      },
      (e) => setLoc({ state: e.code === e.PERMISSION_DENIED ? "denied" : "unavailable" }),
      { enableHighAccuracy: false, timeout: 15000, maximumAge: 10 * 60 * 1000 },
    );
  };
  useEffect(() => {
    detect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const other = f.zoneId === OTHER;

  if (done)
    return (
      <div className="rounded-3xl border border-[#cfe4fb] bg-[#eaf4ff] p-6 text-[#0a2452] shadow-xl shadow-[#0b4ea2]/10 sm:p-8" data-testid="signup-done">
        <div className="grid h-12 w-12 place-items-center rounded-full bg-green-600 text-2xl text-white">✓</div>
        <div className="mt-3 text-2xl font-black">You&apos;re signed up</div>
        <p className="mt-2 text-[15px] leading-relaxed text-[#1e4f8d]">
          {done.verification === "already confirmed" ? (
            <>
              Alerts will come to <b className="text-[#0a2452]">{done.email}</b> and by SMS.
            </>
          ) : (
            <>
              We sent a confirmation link to <b className="text-[#0a2452]">{done.email}</b>. Open it to turn on email alerts — SMS alerts start right away.
            </>
          )}
        </p>
        {!done.covered && (
          <p className="mt-3 rounded-xl bg-white/70 p-3 text-sm text-[#1e4f8d]">
            FloodGuard is live in {regionName} first. We&apos;ve saved your town and will start your alerts as soon as we cover it.
          </p>
        )}
        {done.demoVerifyUrl && (
          <a href={done.demoVerifyUrl} className="mt-4 inline-flex rounded-xl border-2 border-[#0b4ea2] px-4 py-2 text-sm font-bold text-[#0b4ea2] hover:bg-white" data-testid="demo-verify">
            Demo mode: open the confirmation link →
          </a>
        )}
        <p className="mt-4 text-sm text-[#3f6fa8]">
          Elderly, disabled, pregnant or sick people at home?{" "}
          <a href="/register" className="font-semibold text-[#0b4ea2] underline">
            Add them to the priority register
          </a>
          .
        </p>
      </div>
    );

  return (
    <form
      className="rounded-3xl border border-[#cfe4fb] bg-[#eaf4ff] p-6 text-[#0a2452] shadow-xl shadow-[#0b4ea2]/10 sm:p-8"
      data-testid="signup"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setErr(null);
        try {
          const body = { ...f, zoneId: other ? null : f.zoneId, locality: other ? f.locality : null };
          const res = await fetch("/api/signup", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
          const d = await res.json();
          if (!res.ok) throw new Error(d.error ?? "Sign-up failed");
          setDone({ email: d.email, covered: d.covered, verification: d.emailVerification, demoVerifyUrl: d.demoVerifyUrl });
        } catch (e) {
          setErr((e as Error).message.replace(/^\w+: /, ""));
        } finally {
          setBusy(false);
        }
      }}
    >
      <div className="text-xs font-extrabold uppercase tracking-[0.14em] text-[#0b4ea2]">Free flood alerts</div>
      <h2 className="mt-1 text-2xl font-black leading-tight sm:text-[28px]">Sign up in 30 seconds</h2>
      <p className="mt-1 text-[15px] text-[#3f6fa8]">Email + SMS, in your language, for where you live.</p>

      <div className="mt-5 grid gap-3">
        <input required aria-label="Name" placeholder="Your name" value={f.name} onChange={(e) => set("name", e.target.value)} className={input} />
        <input required aria-label="Email" type="email" autoComplete="email" placeholder="Email address" value={f.email} onChange={(e) => set("email", e.target.value)} className={input} />
        <input required aria-label="Phone" type="tel" autoComplete="tel" placeholder="Phone number (e.g. 0803 123 4567)" value={f.phone} onChange={(e) => set("phone", e.target.value)} className={input} />
        <div>
          <select required aria-label="Area" value={f.zoneId} onChange={(e) => set("zoneId", e.target.value)} className={input}>
            <option value="">{loc.state === "detecting" ? "Detecting your area…" : "Choose your area"}</option>
            {zones.map((z) => (
              <option key={z.id} value={z.id}>
                {z.name}
              </option>
            ))}
            <option value={OTHER}>My area isn&apos;t listed</option>
          </select>
          <div className="mt-1.5 text-[13px] leading-snug" data-testid="locate-status">
            {loc.state === "detecting" && <span className="text-[#3f6fa8]">📍 Finding your area…</span>}
            {loc.state === "found" && <span className="font-semibold text-green-700">📍 Detected from your location — change it if wrong</span>}
            {loc.state === "outside" && (
              <span className="text-[#1e4f8d]">
                📍 FloodGuard is live in <b>{loc.region}</b> first. You can still sign up — tell us your town and we&apos;ll alert you as soon as we cover it.
              </span>
            )}
            {loc.state === "denied" && <span className="text-[#3f6fa8]">Location is off — choose your area below.</span>}
            {loc.state === "unavailable" && (
              <button type="button" onClick={detect} className="font-semibold text-[#0b4ea2] underline">
                📍 Couldn&apos;t find your location — try again
              </button>
            )}
          </div>
        </div>
        {other && (
          <input required aria-label="Town" placeholder="Your town or LGA (e.g. Ibadan)" value={f.locality} onChange={(e) => set("locality", e.target.value)} className={input} />
        )}
        <select aria-label="Language" value={f.lang} onChange={(e) => set("lang", e.target.value)} className={input}>
          {LANGS.map(([v, l]) => (
            <option key={v} value={v}>
              Alerts in {l}
            </option>
          ))}
        </select>
      </div>

      <label className="mt-4 flex items-start gap-3 text-[13px] leading-relaxed text-[#1e4f8d]">
        <input type="checkbox" required checked={f.consent} onChange={(e) => set("consent", e.target.checked)} className="mt-0.5 h-5 w-5 shrink-0 accent-[#0b4ea2]" />
        <span>
          I agree that FloodGuard uses my email, phone and area only to send flood warnings and help in a rescue. Unsubscribe any time.{" "}
          <a href="/privacy" className="font-semibold text-[#0b4ea2] underline">
            Privacy
          </a>
        </span>
      </label>

      {err && (
        <div className="mt-4 flex gap-2 rounded-xl border border-red-300 bg-red-50 p-3 text-sm font-medium text-red-700" role="alert">
          <span>⚠</span>
          {err}
        </div>
      )}
      <button disabled={busy} className="mt-5 w-full rounded-xl bg-[#0b4ea2] py-3.5 text-lg font-extrabold text-white shadow-lg shadow-[#0b4ea2]/30 transition hover:bg-[#0a438b] disabled:opacity-50">
        {busy ? "Signing up…" : "Sign up"}
      </button>
      <p className="mt-3 text-center text-xs text-[#3f6fa8]">No internet? SMS works on any phone — see below.</p>
    </form>
  );
}
