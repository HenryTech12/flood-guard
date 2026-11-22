import Link from "next/link";
import { getRegion } from "../../../config/regions";
import { env } from "@/lib/env";
import PhoneSim from "./PhoneSim";

export const dynamic = "force-dynamic";
export const metadata = { title: "Phone simulator" };

export default function SimPage() {
  if (!env.demoMode) return <main className="p-10 text-center text-slate-400">The phone simulator is only available in demo mode.</main>;
  const region = getRegion();
  const zoneName = (i: number) => region.zones.find((z) => z.id === region.demoZones[i])?.shortName ?? region.zones[i % region.zones.length].shortName;
  const presets = [
    { phone: region.demoResidentPhone, label: `Mama Ngozi · ${zoneName(0)} · Pidgin · elderly + child` },
    { phone: "+2348000000002", label: `John · ${zoneName(1)} · English · pregnant` },
    { phone: "+2348000000003", label: `Hauwa · ${zoneName(2)} · Hausa (EN fallback)` },
    { phone: "+2348009990001", label: "Unregistered caller" },
  ];
  return (
    <main className="mx-auto grid max-w-5xl gap-8 px-4 py-8 md:grid-cols-[1fr_360px]">
      <PhoneSim presets={presets} ussdCode={region.ussdCode} shortcode={region.smsShortcode} exampleLandmark={region.exampleLandmark} />
      <aside className="space-y-4 text-sm text-slate-300">
        <h1 className="text-2xl font-black text-white">Phone simulator</h1>
        <p>
          This basic phone sends real SMS and USSD requests into FloodGuard&apos;s webhooks, exactly as Africa&apos;s Talking would. Replies, alerts and
          &ldquo;is safe&rdquo; messages appear on the phone. Nothing is sent to real numbers.
        </p>
        <ul className="list-disc space-y-1 pl-5">
          <li>
            <b>HELP</b>, <b>HELP 3 people roof</b>, <b>we dey trap</b> → rescue request
          </li>
          <li>
            <b>SAFE</b> → check-in, family told
          </li>
          <li>
            <b>WATER knee {region.exampleLandmark}</b> → crowd report
          </li>
          <li>
            <b>SHELTER</b> → nearest shelter · <b>STOP</b> / <b>DELETE</b> → privacy controls
          </li>
          <li>
            USSD <b>{region.ussdCode}</b> → menu for phones without credit
          </li>
        </ul>
        <div className="flex flex-col gap-2">
          <Link href="/command" target="_blank" className="rounded-lg bg-sky-700 px-4 py-2 text-center font-bold hover:bg-sky-600">
            Open command map (2nd screen) ↗
          </Link>
          <Link href="/volunteer" target="_blank" className="rounded-lg bg-slate-800 px-4 py-2 text-center font-bold hover:bg-slate-700">
            Open volunteer app ↗
          </Link>
          <Link href="/demo" className="rounded-lg border border-amber-700 px-4 py-2 text-center font-bold text-amber-300 hover:bg-amber-950/40">
            Demo control panel
          </Link>
        </div>
      </aside>
    </main>
  );
}
