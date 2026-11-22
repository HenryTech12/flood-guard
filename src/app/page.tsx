import Link from "next/link";
import { getRegion } from "../../config/regions";
import { env } from "@/lib/env";
import SignupCard from "./SignupCard";

const EMAIL_BANNER: Record<string, { text: string; cls: string }> = {
  confirmed: { text: "Email confirmed ✓ — flood alerts for your area will now also come by email.", cls: "border-green-700 bg-green-950/50 text-green-200" },
  unsubscribed: { text: "You will no longer receive alert emails. SMS alerts continue — send STOP to stop them too.", cls: "border-slate-600 bg-slate-900 text-slate-200" },
  invalid: { text: "That link is invalid or has expired. Sign up again to get a new one.", cls: "border-red-800 bg-red-950/50 text-red-200" },
};

export const dynamic = "force-dynamic";

const CARDS = [
  { href: "/command", title: "Command map", body: "God's-eye view for State Emergency Management operators.", tag: "Operators" },
  { href: "/volunteer", title: "Volunteer app", body: "Accept rescue jobs, navigate, mark people rescued. Works on slow 3G.", tag: "Volunteers" },
  { href: "/register", title: "Register a household", body: "Add vulnerable people so they are prioritised and warned first.", tag: "Residents" },
  { href: "/report", title: "Report flooding", body: "Tell us where water is rising or roads are blocked.", tag: "Residents" },
];

export default async function Home({ searchParams }: { searchParams: Promise<{ email?: string }> }) {
  const { email } = await searchParams;
  const banner = email ? EMAIL_BANNER[email] : undefined;
  const region = getRegion();
  const demo = env.demoMode;
  return (
    <main className="mx-auto max-w-5xl px-6 py-12">
      <div className="flex items-center gap-3">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/icon.svg" alt="" className="h-12 w-12" />
        <div>
          <h1 className="text-4xl font-black tracking-tight">FloodGuard</h1>
          <p className="text-slate-400">From early warning to rescue · {region.name}, {region.state} State</p>
        </div>
      </div>

      {banner && (
        <div className={`mt-6 rounded-xl border px-4 py-3 ${banner.cls}`} data-testid="email-banner">
          {banner.text}
        </div>
      )}

      <section className="mt-8">
        <SignupCard />
      </section>

      <section className="mt-8 grid gap-4 rounded-2xl border border-sky-900 bg-sky-950/40 p-6 sm:grid-cols-3">
        <div>
          <div className="text-xs font-bold uppercase tracking-wider text-sky-400">Need rescue?</div>
          <div className="mt-1 text-2xl font-black">SMS HELP to {region.smsShortcode}</div>
          <div className="text-sm text-slate-400">e.g. “HELP 3 people roof”</div>
        </div>
        <div>
          <div className="text-xs font-bold uppercase tracking-wider text-sky-400">No credit / basic phone</div>
          <div className="mt-1 text-2xl font-black">Dial {region.ussdCode}</div>
          <div className="text-sm text-slate-400">Help · I am safe · Report · Shelter</div>
        </div>
        <div>
          <div className="text-xs font-bold uppercase tracking-wider text-sky-400">You are safe?</div>
          <div className="mt-1 text-2xl font-black">SMS SAFE</div>
          <div className="text-sm text-slate-400">Your family contacts are told.</div>
        </div>
      </section>

      <section className="mt-8 grid gap-4 sm:grid-cols-2">
        {CARDS.map((c) => (
          <Link key={c.href} href={c.href} className="group rounded-2xl border border-slate-800 bg-slate-900/60 p-5 transition hover:border-sky-600 hover:bg-slate-900">
            <div className="text-xs font-bold uppercase tracking-wider text-slate-500">{c.tag}</div>
            <div className="mt-1 text-xl font-bold group-hover:text-sky-300">{c.title} →</div>
            <p className="mt-1 text-slate-400">{c.body}</p>
          </Link>
        ))}
      </section>

      {demo && (
        <section className="mt-8 rounded-2xl border border-amber-800 bg-amber-950/30 p-5">
          <div className="text-xs font-bold uppercase tracking-wider text-amber-400">Demo mode</div>
          <div className="mt-2 flex flex-wrap gap-3">
            <Link href="/demo" className="rounded-lg bg-amber-500 px-4 py-2 font-bold text-slate-950 hover:bg-amber-400">Demo control panel</Link>
            <Link href="/sim" className="rounded-lg border border-amber-600 px-4 py-2 font-bold text-amber-200 hover:bg-amber-900/40">Phone simulator</Link>
          </div>
          <p className="mt-2 text-sm text-amber-200/70">All people, phone numbers and messages are fake. No real SMS is sent while MESSAGING_PROVIDER=mock.</p>
        </section>
      )}

      <footer className="mt-12 flex flex-wrap gap-4 text-sm text-slate-500">
        <Link href="/privacy" className="hover:text-slate-300">Privacy</Link>
        <Link href="/roadmap" className="hover:text-slate-300">Roadmap</Link>
        <span>Satellite data: NASA GPM IMERG, Copernicus Sentinel-1 & DEM · Map © OpenStreetMap contributors</span>
      </footer>
    </main>
  );
}
