"use client";
import { useEffect, useState } from "react";
import { postJson } from "@/lib/client/live";

type Zone = { id: string; name: string; landmarks: { id: string; name: string }[] };
const VULN = [
  ["elderly", "Elderly (65+)"],
  ["disabled", "Disabled / limited mobility"],
  ["pregnant", "Pregnant"],
  ["child_under5", "Child under 5"],
  ["bedridden", "Bedridden / seriously sick"],
  ["other", "Other (explain)"],
] as const;
const LANGS = [
  ["en", "English"],
  ["pcm", "Pidgin"],
  ["ha", "Hausa"],
  ["yo", "Yoruba"],
  ["ig", "Igbo"],
] as const;

export default function RegisterForm() {
  const [zones, setZones] = useState<Zone[]>([]);
  const [f, setF] = useState({ phone: "", name: "", lang: "en", zoneId: "", landmarkId: "", shareLocation: true, consent: false, onBehalf: false, registeredBy: "" });
  const [gps, setGps] = useState<[number, number] | null>(null);
  const [vuln, setVuln] = useState<Record<string, { count: number; notes: string } | undefined>>({});
  const [family, setFamily] = useState([{ phone: "", name: "" }]);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    fetch("/api/public/zones")
      .then((r) => r.json())
      .then((d) => setZones(d.zones));
  }, []);
  const zone = zones.find((z) => z.id === f.zoneId);
  const set = (k: keyof typeof f, v: string | boolean) => setF((x) => ({ ...x, [k]: v }));

  return (
    <form
      className="space-y-5"
      onSubmit={async (e) => {
        e.preventDefault();
        setMsg(null);
        try {
          await postJson("/api/register", {
            phone: f.phone,
            name: f.name,
            lang: f.lang,
            zoneId: f.zoneId,
            landmarkId: f.landmarkId || null,
            gps,
            shareLocation: f.shareLocation,
            consent: f.consent,
            registeredBy: f.onBehalf ? f.registeredBy || "community volunteer" : null,
            vulnerable: Object.entries(vuln)
              .filter(([, v]) => v)
              .map(([type, v]) => ({ type, count: v!.count, notes: v!.notes || null })),
            family: family.filter((x) => x.phone.trim()).map((x) => ({ phone: x.phone, name: x.name || null })),
          });
          setMsg({ ok: true, text: "Registered. A confirmation SMS has been sent. You will receive flood alerts for this area." });
        } catch (e) {
          setMsg({ ok: false, text: (e as Error).message });
        }
      }}
    >
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={f.onBehalf} onChange={(e) => set("onBehalf", e.target.checked)} /> I am a community volunteer registering someone else (with their permission)
      </label>
      {f.onBehalf && <Input label="Your name (registrar)" value={f.registeredBy} onChange={(v) => set("registeredBy", v)} />}

      <div className="grid gap-4 sm:grid-cols-2">
        <Input label="Household phone number" value={f.phone} onChange={(v) => set("phone", v)} placeholder="0803 123 4567" required />
        <Input label="Name" value={f.name} onChange={(v) => set("name", v)} required />
        <Select label="Language for alerts" value={f.lang} onChange={(v) => set("lang", v)} options={LANGS.map(([v, l]) => [v, l])} />
        <Select label="Area" value={f.zoneId} onChange={(v) => (set("zoneId", v), set("landmarkId", ""))} options={[["", "Choose…"], ...zones.map((z) => [z.id, z.name] as [string, string])]} required />
      </div>

      <fieldset className="rounded-xl border border-slate-800 p-4">
        <legend className="px-1 text-sm font-bold">Home location (optional, helps rescuers find you)</legend>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={f.shareLocation} onChange={(e) => set("shareLocation", e.target.checked)} /> Store my home location for rescue
        </label>
        {f.shareLocation && (
          <div className="mt-2 grid gap-3 sm:grid-cols-2">
            <Select label="Nearest landmark" value={f.landmarkId} onChange={(v) => set("landmarkId", v)} options={[["", "Choose…"], ...(zone?.landmarks.map((l) => [l.id, l.name] as [string, string]) ?? [])]} />
            <div>
              <div className="text-sm text-slate-400">or use this phone&apos;s GPS (stand at home)</div>
              <button
                type="button"
                onClick={() => navigator.geolocation?.getCurrentPosition((p) => setGps([p.coords.longitude, p.coords.latitude]), () => setMsg({ ok: false, text: "Could not get GPS" }))}
                className="mt-1 rounded-lg bg-slate-800 px-3 py-2 text-sm"
              >
                {gps ? `📍 ${gps[1].toFixed(4)}, ${gps[0].toFixed(4)}` : "Use GPS"}
              </button>
            </div>
          </div>
        )}
      </fieldset>

      <fieldset className="rounded-xl border border-slate-800 p-4">
        <legend className="px-1 text-sm font-bold">People needing extra help</legend>
        <div className="space-y-2">
          {VULN.map(([type, label]) => (
            <div key={type} className="flex flex-wrap items-center gap-2">
              <label className="flex w-56 items-center gap-2">
                <input type="checkbox" checked={!!vuln[type]} onChange={(e) => setVuln((v) => ({ ...v, [type]: e.target.checked ? { count: 1, notes: "" } : undefined }))} /> {label}
              </label>
              {vuln[type] && (
                <>
                  <input type="number" min={1} max={20} value={vuln[type]!.count} onChange={(e) => setVuln((v) => ({ ...v, [type]: { ...v[type]!, count: Number(e.target.value) } }))} className="w-16 rounded bg-slate-800 px-2 py-1" />
                  <input placeholder="notes (e.g. wheelchair)" value={vuln[type]!.notes} onChange={(e) => setVuln((v) => ({ ...v, [type]: { ...v[type]!, notes: e.target.value } }))} className="flex-1 rounded bg-slate-800 px-2 py-1 text-sm" />
                </>
              )}
            </div>
          ))}
        </div>
      </fieldset>

      <fieldset className="rounded-xl border border-slate-800 p-4">
        <legend className="px-1 text-sm font-bold">Family to tell when you are safe (up to 3)</legend>
        {family.map((x, i) => (
          <div key={i} className="mb-2 flex gap-2">
            <input placeholder="Phone" value={x.phone} onChange={(e) => setFamily((fm) => fm.map((y, j) => (j === i ? { ...y, phone: e.target.value } : y)))} className="flex-1 rounded bg-slate-800 px-2 py-2" />
            <input placeholder="Name" value={x.name} onChange={(e) => setFamily((fm) => fm.map((y, j) => (j === i ? { ...y, name: e.target.value } : y)))} className="flex-1 rounded bg-slate-800 px-2 py-2" />
          </div>
        ))}
        {family.length < 3 && (
          <button type="button" onClick={() => setFamily((fm) => [...fm, { phone: "", name: "" }])} className="text-sm text-sky-400">
            + add another
          </button>
        )}
      </fieldset>

      <label className="flex items-start gap-3 rounded-xl border border-sky-900 bg-sky-950/30 p-4">
        <input type="checkbox" required checked={f.consent} onChange={(e) => set("consent", e.target.checked)} className="mt-1 h-5 w-5" />
        <span className="text-sm">
          <b>Consent.</b> {f.onBehalf ? "The person being registered agrees" : "I agree"} that FloodGuard stores this phone number, area, home location (if given), household needs and family contacts <b>only</b> to send flood warnings and to
          prioritise and guide rescue. It is not shared for any other purpose. You can stop alerts by sending STOP, or erase everything by sending DELETE, at any time. See the{" "}
          <a href="/privacy" className="text-sky-400 underline" target="_blank">
            privacy notice
          </a>
          .
        </span>
      </label>

      {msg && <div className={`rounded-lg p-3 ${msg.ok ? "bg-green-900/50 text-green-200" : "bg-red-900/50 text-red-200"}`}>{msg.text}</div>}
      <button className="w-full rounded-xl bg-sky-600 py-3 text-lg font-bold hover:bg-sky-500">Register household</button>
    </form>
  );
}

function Input({ label, value, onChange, placeholder, required }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string; required?: boolean }) {
  return (
    <label className="block">
      <span className="text-sm text-slate-400">{label}</span>
      <input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} required={required} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2" />
    </label>
  );
}

function Select({ label, value, onChange, options, required }: { label: string; value: string; onChange: (v: string) => void; options: (readonly [string, string])[]; required?: boolean }) {
  return (
    <label className="block">
      <span className="text-sm text-slate-400">{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value)} required={required} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2">
        {options.map(([v, l]) => (
          <option key={v} value={v}>
            {l}
          </option>
        ))}
      </select>
    </label>
  );
}
