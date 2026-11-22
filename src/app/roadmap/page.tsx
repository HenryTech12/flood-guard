import Link from "next/link";

export const metadata = { title: "Roadmap" };

const POST_FLOOD = [
  {
    icon: "🛰",
    title: "Damage map for insurers & NGOs",
    body: "Compare pre- and post-flood Sentinel-1/Sentinel-2 imagery per building footprint, export damage polygons (GeoJSON/Shapefile) and a household-level damage list for cash-transfer programmes.",
    status: "Design ready — reuses geo/sentinel1_flood.py change detection",
  },
  {
    icon: "🦟",
    title: "Health alerts after water recedes",
    body: "Cholera and malaria risk messages by zone once satellite water extent shrinks: boil-water advice, ORS points, bed-net distribution. Same multilingual SMS/voice pipeline as flood alerts.",
    status: "Templates + trigger rule to write with NCDC/State Ministry of Health",
  },
  {
    icon: "🚁",
    title: "Drone footage pinned to the map",
    body: "Upload drone video/photos from a phone; GPS from the file pins it to the command map so operators can see hard-to-reach streets.",
    status: "Needs storage bucket + EXIF/GPS extraction",
  },
];

const NEXT = [
  "Live IMERG Early Run ingestion every 30 min (Earth Engine scheduled export) instead of replay",
  "Upstream river gauges and dam-release notices (Lagdo, Kainji/Jebba) in the risk engine — the 2022 Lokoja flood was driven by river flow, not only local rain",
  "Native-speaker Hausa, Yoruba and Igbo templates + recorded voice prompts",
  "Real Africa's Talking shortcode and USSD code with telco zero-rating",
  "WhatsApp channel for residents with smartphones",
  "Offline vector tiles (PMTiles) for the whole state",
  "Multi-agency roles (Red Cross, NEMA, police marine) and shift handover",
];

export default function RoadmapPage() {
  return (
    <main className="mx-auto max-w-4xl px-4 py-8">
      <Link href="/" className="text-sm text-slate-400 hover:text-white">
        ← FloodGuard
      </Link>
      <h1 className="mt-2 text-3xl font-black">Roadmap</h1>
      <h2 className="mt-6 text-xl font-bold">After the flood (planned)</h2>
      <div className="mt-3 grid gap-4 md:grid-cols-3">
        {POST_FLOOD.map((p) => (
          <div key={p.title} className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5">
            <div className="text-3xl">{p.icon}</div>
            <div className="mt-2 text-lg font-bold">{p.title}</div>
            <p className="mt-1 text-sm text-slate-400">{p.body}</p>
            <div className="mt-3 rounded bg-amber-950/40 px-2 py-1 text-xs text-amber-300">{p.status}</div>
          </div>
        ))}
      </div>
      <h2 className="mt-8 text-xl font-bold">Next up</h2>
      <ul className="mt-2 list-disc space-y-1 pl-5 text-slate-300">
        {NEXT.map((n) => (
          <li key={n}>{n}</li>
        ))}
      </ul>
    </main>
  );
}
