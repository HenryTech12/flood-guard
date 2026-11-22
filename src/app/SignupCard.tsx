"use client";
import { useEffect, useState } from "react";

type Zone = { id: string; name: string };
const LANGS = [
  ["en", "English"],
  ["pcm", "Pidgin"],
  ["ha", "Hausa"],
  ["yo", "Yoruba"],
  ["ig", "Igbo"],
] as const;

export default function SignupCard() {
  const [zones, setZones] = useState<Zone[]>([]);
  const [f, setF] = useState({ name: "", email: "", phone: "", zoneId: "", lang: "en", consent: false });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState<{ email: string; verification: string | null; demoVerifyUrl: string | null } | null>(null);

  useEffect(() => {
    fetch("/api/public/zones")
      .then((r) => r.json())
      .then((d) => setZones(d.zones))
      .catch(() => {});
  }, []);
  const set = (k: keyof typeof f, v: string | boolean) => setF((x) => ({ ...x, [k]: v }));

  if (done)
    return (
      <div className="rounded-2xl border border-green-800 bg-green-950/40 p-6" data-testid="signup-done">
        <div className="text-xl font-black text-green-300">You&apos;re signed up ✓</div>
        <p className="mt-2 text-slate-200">
          {done.verification === "already confirmed" ? (
            <>
              Flood alerts will come to <b>{done.email}</b> and by SMS.
            </>
          ) : (
            <>
              We sent a confirmation link to <b>{done.email}</b>. Open it to start receiving alert emails. SMS alerts start right away.
            </>
          )}
        </p>
        {done.demoVerifyUrl && (
          <a href={done.demoVerifyUrl} className="mt-3 inline-block rounded-lg border border-amber-600 px-4 py-2 text-sm font-bold text-amber-300 hover:bg-amber-950/40" data-testid="demo-verify">
            Demo mode: open the confirmation link →
          </a>
        )}
        <p className="mt-3 text-sm text-slate-400">
          Have elderly, disabled, pregnant or sick people, or small children at home?{" "}
          <a href="/register" className="text-sky-400 underline">
            Add them to the vulnerable-people register
          </a>{" "}
          so rescuers prioritise them.
        </p>
      </div>
    );

  return (
    <form
      className="rounded-2xl border border-sky-900 bg-slate-900/70 p-6"
      data-testid="signup"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setErr(null);
        try {
          const res = await fetch("/api/signup", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(f) });
          const d = await res.json();
          if (!res.ok) throw new Error(d.error ?? "Sign-up failed");
          setDone({ email: d.email, verification: d.emailVerification, demoVerifyUrl: d.demoVerifyUrl });
        } catch (e) {
          setErr((e as Error).message.replace(/^\w+: /, ""));
        } finally {
          setBusy(false);
        }
      }}
    >
      <div className="text-xs font-bold uppercase tracking-wider text-sky-400">Sign up for flood alerts</div>
      <div className="mt-1 text-2xl font-black">Get warned before the water comes</div>
      <p className="mt-1 text-sm text-slate-400">Alerts by email and SMS, in your language, for your area.</p>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <input required aria-label="Name" placeholder="Your name" value={f.name} onChange={(e) => set("name", e.target.value)} className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2.5" />
        <input required aria-label="Email" type="email" autoComplete="email" placeholder="Email address" value={f.email} onChange={(e) => set("email", e.target.value)} className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2.5" />
        <input required aria-label="Phone" type="tel" autoComplete="tel" placeholder="Phone (e.g. 0803 123 4567)" value={f.phone} onChange={(e) => set("phone", e.target.value)} className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2.5" />
        <select required aria-label="Area" value={f.zoneId} onChange={(e) => set("zoneId", e.target.value)} className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2.5">
          <option value="">Your area…</option>
          {zones.map((z) => (
            <option key={z.id} value={z.id}>
              {z.name}
            </option>
          ))}
        </select>
        <select aria-label="Language" value={f.lang} onChange={(e) => set("lang", e.target.value)} className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2.5 sm:col-span-2">
          {LANGS.map(([v, l]) => (
            <option key={v} value={v}>
              Alerts in {l}
            </option>
          ))}
        </select>
      </div>
      <label className="mt-3 flex items-start gap-2 text-sm text-slate-300">
        <input type="checkbox" required checked={f.consent} onChange={(e) => set("consent", e.target.checked)} className="mt-0.5 h-4 w-4" />
        <span>
          I agree that FloodGuard uses my email, phone and area only to send flood warnings and help in a rescue. Unsubscribe any time.{" "}
          <a href="/privacy" className="text-sky-400 underline">
            Privacy
          </a>
        </span>
      </label>
      {err && <div className="mt-3 rounded-lg bg-red-900/50 p-3 text-sm text-red-200">{err}</div>}
      <button disabled={busy} className="mt-4 w-full rounded-xl bg-sky-600 py-3 text-lg font-bold hover:bg-sky-500 disabled:opacity-50">
        {busy ? "Signing up…" : "Sign up"}
      </button>
      <p className="mt-2 text-xs text-slate-500">No internet? Use SMS or the USSD code below — it works on any phone.</p>
    </form>
  );
}
