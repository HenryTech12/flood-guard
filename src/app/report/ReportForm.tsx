"use client";
import { useEffect, useState } from "react";
import { postJson } from "@/lib/client/live";

type Zone = { id: string; name: string; landmarks: { id: string; name: string }[] };
const DEPTHS = [
  [15, "Ankle"],
  [50, "Knee"],
  [100, "Waist"],
  [130, "Chest"],
  [250, "Over head / roof"],
] as const;

/** Resize a photo in the browser to a small JPEG (keeps uploads tiny on 3G). */
async function shrink(file: File, max = 640): Promise<string> {
  const img = await createImageBitmap(file);
  const k = Math.min(1, max / Math.max(img.width, img.height));
  const c = document.createElement("canvas");
  c.width = Math.round(img.width * k);
  c.height = Math.round(img.height * k);
  c.getContext("2d")!.drawImage(img, 0, 0, c.width, c.height);
  return c.toDataURL("image/jpeg", 0.6);
}

export default function ReportForm() {
  const [zones, setZones] = useState<Zone[]>([]);
  const [type, setType] = useState("water_level");
  const [depth, setDepth] = useState<number>(50);
  const [zoneId, setZoneId] = useState("");
  const [landmarkId, setLandmarkId] = useState("");
  const [gps, setGps] = useState<[number, number] | null>(null);
  const [phone, setPhone] = useState("");
  const [description, setDescription] = useState("");
  const [photo, setPhoto] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    fetch("/api/public/zones")
      .then((r) => r.json())
      .then((d) => setZones(d.zones));
  }, []);
  const zone = zones.find((z) => z.id === zoneId);

  return (
    <form
      className="space-y-4"
      onSubmit={async (e) => {
        e.preventDefault();
        setMsg(null);
        try {
          const r = await postJson<{ verification: string }>("/api/report", { phone: phone || null, type, depthCm: type === "water_level" ? depth : null, zoneId: zoneId || null, landmarkId: landmarkId || null, gps, description: description || null, photoUrl: photo });
          setMsg({ ok: true, text: `Thank you — report received (${r.verification}). It is shown to emergency operators for review.` });
          setDescription("");
          setPhoto(null);
        } catch (e) {
          setMsg({ ok: false, text: (e as Error).message });
        }
      }}
    >
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {[
          ["water_level", "🌊 Water"],
          ["road_blocked", "🚧 Road blocked"],
          ["drain_blocked", "🕳 Drain blocked"],
          ["other", "❗ Other"],
        ].map(([v, l]) => (
          <button type="button" key={v} onClick={() => setType(v)} className={`rounded-xl px-3 py-3 font-bold ${type === v ? "bg-sky-600" : "bg-slate-100"}`}>
            {l}
          </button>
        ))}
      </div>
      {type === "water_level" && (
        <div className="flex flex-wrap gap-2">
          {DEPTHS.map(([v, l]) => (
            <button type="button" key={v} onClick={() => setDepth(v)} className={`rounded-full px-3 py-1 ${depth === v ? "bg-blue-600" : "bg-slate-100"}`}>
              {l}
            </button>
          ))}
        </div>
      )}
      <div className="grid gap-3 sm:grid-cols-2">
        <select value={zoneId} onChange={(e) => (setZoneId(e.target.value), setLandmarkId(""))} className="rounded-lg border border-slate-200 bg-white px-3 py-2">
          <option value="">Area…</option>
          {zones.map((z) => (
            <option key={z.id} value={z.id}>
              {z.name}
            </option>
          ))}
        </select>
        <select value={landmarkId} onChange={(e) => setLandmarkId(e.target.value)} className="rounded-lg border border-slate-200 bg-white px-3 py-2">
          <option value="">Nearest landmark…</option>
          {zone?.landmarks.map((l) => (
            <option key={l.id} value={l.id}>
              {l.name}
            </option>
          ))}
        </select>
      </div>
      <button type="button" onClick={() => navigator.geolocation?.getCurrentPosition((p) => setGps([p.coords.longitude, p.coords.latitude]))} className="rounded-lg bg-slate-100 px-3 py-2 text-sm">
        {gps ? `📍 Using GPS ${gps[1].toFixed(4)}, ${gps[0].toFixed(4)}` : "📍 Use my GPS location instead"}
      </button>
      <textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What do you see? (optional)" className="h-24 w-full rounded-lg border border-slate-200 bg-white px-3 py-2" />
      <label className="block text-sm text-slate-600">
        Photo (optional)
        <input type="file" accept="image/*" capture="environment" onChange={async (e) => e.target.files?.[0] && setPhoto(await shrink(e.target.files[0]))} className="mt-1 block text-sm" />
      </label>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {photo && <img src={photo} alt="preview" className="max-h-40 rounded-lg" />}
      <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Your phone (optional, so operators can call back)" className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2" />
      {msg && <div className={`rounded-lg p-3 ${msg.ok ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"}`}>{msg.text}</div>}
      <button className="w-full rounded-xl bg-sky-600 py-3 text-lg font-bold hover:bg-sky-500">Send report</button>
      <p className="text-xs text-slate-500">If someone is in danger, do not use this form — send HELP by SMS.</p>
    </form>
  );
}
