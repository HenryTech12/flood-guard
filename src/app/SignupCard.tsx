"use client";
// Sign-up card on the landing page: light-blue card, auto-detects the area from the
// device location, and works anywhere — outside the covered areas people give their town.
import { useEffect, useState } from "react";
import { Bell, CheckCircle, Mail, MapPin, Navigation } from "lucide-react";

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

const input = "w-full rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-gray-900 placeholder:text-gray-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500";
const label = "mb-2 block text-sm font-medium text-gray-700";

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

  const header = (
    <div className="mb-6 flex items-center">
      <div className="relative mr-4">
        <div className="absolute inset-0 rounded-xl bg-gradient-to-r from-blue-600 to-cyan-600 opacity-20 blur-md" />
        <div className="relative rounded-xl bg-gradient-to-br from-blue-500 to-cyan-500 p-3 shadow-lg">
          <Bell className="h-6 w-6 text-white" />
        </div>
      </div>
      <div>
        <h2 className="text-2xl font-black text-slate-900">Register for Flood Alerts</h2>
        <p className="text-sm font-semibold text-slate-600">SMS + email in your language, for where you live — free</p>
      </div>
    </div>
  );

  if (done)
    return (
      <div className="rounded-2xl border border-slate-200 bg-white/80 p-6 shadow-xl backdrop-blur-sm sm:p-8" data-testid="signup-done">
        {header}
        <div className="flex items-start gap-4 rounded-xl border-2 border-green-300 bg-gradient-to-r from-green-50 to-emerald-50 p-5 shadow-lg">
          <CheckCircle className="mt-0.5 h-6 w-6 flex-shrink-0 text-green-600" />
          <div>
            <p className="text-lg font-black text-green-900">You&apos;re signed up</p>
            <p className="mt-1 text-sm font-semibold text-green-800">
              {done.verification === "already confirmed" ? (
                <>Alerts will come to {done.email} and by SMS.</>
              ) : (
                <>
                  We sent a confirmation link to {done.email}. Open it to turn on email alerts — SMS alerts start right away. If it doesn&apos;t arrive, check your Spam folder.
                </>
              )}
            </p>
            {!done.covered && <p className="mt-2 text-sm text-green-800">FloodGuard is live in {regionName} first. We&apos;ve saved your town and will start your alerts as soon as we cover it.</p>}
            {done.demoVerifyUrl && (
              <a href={done.demoVerifyUrl} className="mt-3 inline-flex rounded-lg bg-blue-600 px-4 py-2 text-sm font-bold text-white hover:bg-blue-700" data-testid="demo-verify">
                Demo mode: open the confirmation link →
              </a>
            )}
            <p className="mt-3 text-sm text-slate-600">
              Elderly, disabled, pregnant or sick people at home?{" "}
              <a href="/register" className="font-bold text-blue-600 underline">
                Add them to the priority register
              </a>
              .
            </p>
          </div>
        </div>
      </div>
    );

  return (
    <form
      className="rounded-2xl border border-slate-200 bg-white/80 p-6 shadow-xl backdrop-blur-sm sm:p-8"
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
      {header}
      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <label className={label}>Your name</label>
          <input required aria-label="Name" placeholder="e.g. Amina Bello" value={f.name} onChange={(e) => set("name", e.target.value)} className={input} />
        </div>
        <div>
          <label className={label}>Email</label>
          <input required aria-label="Email" type="email" autoComplete="email" placeholder="you@example.com" value={f.email} onChange={(e) => set("email", e.target.value)} className={input} />
        </div>
        <div>
          <label className={label}>Phone</label>
          <input required aria-label="Phone" type="tel" autoComplete="tel" placeholder="+234 803 123 4567" value={f.phone} onChange={(e) => set("phone", e.target.value)} className={input} />
        </div>
        <div>
          <label className={label}>Preferred alert language</label>
          <select aria-label="Language" value={f.lang} onChange={(e) => set("lang", e.target.value)} className={input}>
            {LANGS.map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
        </div>
        <div className="md:col-span-2">
          <label className={label}>
            <MapPin className="mr-1 inline h-4 w-4 text-blue-600" />
            Your area
          </label>
          <select required aria-label="Area" value={f.zoneId} onChange={(e) => set("zoneId", e.target.value)} className={input}>
            <option value="">{loc.state === "detecting" ? "Detecting your area…" : "Choose your area"}</option>
            {zones.map((z) => (
              <option key={z.id} value={z.id}>
                {z.name}
              </option>
            ))}
            <option value={OTHER}>My area isn&apos;t listed</option>
          </select>
          <div className="mt-2 text-sm" data-testid="locate-status">
            {loc.state === "detecting" && (
              <span className="flex items-center gap-2 font-medium text-blue-700">
                <Navigation className="h-4 w-4 animate-spin" /> Finding your area…
              </span>
            )}
            {loc.state === "found" && (
              <span className="flex items-center gap-2 font-semibold text-green-700">
                <CheckCircle className="h-4 w-4" /> Detected from your location — change it if wrong
              </span>
            )}
            {loc.state === "outside" && (
              <span className="text-slate-700">
                📍 FloodGuard is live in <b>{loc.region}</b> first. You can still sign up — tell us your town and we&apos;ll alert you as soon as we cover it.
              </span>
            )}
            {loc.state === "denied" && <span className="text-slate-600">Location is off — choose your area above.</span>}
            {loc.state === "unavailable" && (
              <button type="button" onClick={detect} className="font-semibold text-blue-600 underline">
                Couldn&apos;t find your location — try again
              </button>
            )}
          </div>
        </div>
        {other && (
          <div className="md:col-span-2">
            <label className={label}>Your town or LGA</label>
            <input required aria-label="Town" placeholder="e.g. Ibadan" value={f.locality} onChange={(e) => set("locality", e.target.value)} className={input} />
          </div>
        )}
      </div>

      <label className="mt-5 flex items-start gap-3 text-sm text-slate-600">
        <input type="checkbox" required checked={f.consent} onChange={(e) => set("consent", e.target.checked)} className="mt-0.5 h-5 w-5 shrink-0 accent-blue-600" />
        <span>
          I agree that FloodGuard uses my email, phone and area only to send flood warnings and help in a rescue. Unsubscribe any time.{" "}
          <a href="/privacy" className="font-semibold text-blue-600 underline">
            Privacy
          </a>
        </span>
      </label>

      {err && (
        <div className="mt-4 flex items-start rounded border-l-4 border-red-500 bg-red-50 p-4 text-sm text-red-800" role="alert">
          {err}
        </div>
      )}
      <div className="mt-5 flex flex-col gap-3 sm:flex-row">
        <button disabled={busy} className="flex flex-1 items-center justify-center rounded-xl bg-gradient-to-r from-blue-600 to-cyan-600 px-6 py-3 text-lg font-black text-white shadow-lg transition-all hover:scale-[1.01] hover:shadow-xl disabled:opacity-50">
          <Mail className="mr-2 h-5 w-5" />
          {busy ? "Signing up…" : "Sign up"}
        </button>
      </div>
      <p className="mt-3 text-center text-xs text-slate-500">No internet? SMS HELP or dial the USSD code — it works on any phone.</p>
    </form>
  );
}
