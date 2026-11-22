import Link from "next/link";
import { getRegion } from "../../config/regions";
import { env } from "@/lib/env";
import SignupCard from "./SignupCard";

export const dynamic = "force-dynamic";

const EMAIL_BANNER: Record<string, { text: string; tone: "ok" | "info" | "bad" }> = {
  confirmed: { text: "Email confirmed — flood alerts will now also come to your inbox.", tone: "ok" },
  unsubscribed: { text: "You will no longer receive alert emails. SMS alerts continue — send STOP to stop them too.", tone: "info" },
  invalid: { text: "That link is invalid or has expired. Sign up again to get a new one.", tone: "bad" },
};
const TONE = {
  ok: "border-green-400/60 bg-green-500/15 text-green-100",
  info: "border-[#8fd0ff]/50 bg-[#8fd0ff]/10 text-[#dcedff]",
  bad: "border-red-400/60 bg-red-500/15 text-red-100",
};

const STEPS = [
  { icon: "🛰️", title: "Sense", body: "Satellite rainfall and flood maps, terrain and residents' reports score every neighbourhood's risk — with the reasons shown." },
  { icon: "📣", title: "Warn", body: "When risk rises, everyone registered in that area gets SMS, email and voice alerts in English, Pidgin, Hausa, Yoruba or Igbo." },
  { icon: "🚤", title: "Respond", body: "Help requests reach a live map for emergency teams, and the nearest boat or volunteer is dispatched like a ride-hailing trip." },
];

const TOOLS = [
  { href: "/register", title: "Priority register", body: "Add elderly, disabled, pregnant or sick family members so they're warned and rescued first.", tag: "Residents" },
  { href: "/report", title: "Report flooding", body: "Tell us where water is rising or a road is blocked.", tag: "Residents" },
  { href: "/volunteer", title: "Volunteer app", body: "Boat owners and drivers: accept rescue jobs and navigate to people.", tag: "Volunteers" },
  { href: "/command", title: "Command map", body: "Live view of every request, rescuer and shelter for emergency operators.", tag: "Agencies" },
];

export default async function Home({ searchParams }: { searchParams: Promise<{ email?: string }> }) {
  const { email } = await searchParams;
  const banner = email ? EMAIL_BANNER[email] : undefined;
  const region = getRegion();

  return (
    <div className="min-h-screen">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-5 py-5">
        <Link href="/" className="flex items-center gap-2.5">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/icon.svg" alt="" className="h-10 w-10" />
          <span className="text-xl font-black tracking-tight text-white">FloodGuard</span>
        </Link>
        <nav className="hidden items-center gap-6 text-sm font-semibold text-[#c4e2ff] sm:flex">
          <Link href="/report" className="hover:text-white">
            Report flooding
          </Link>
          <Link href="/volunteer" className="hover:text-white">
            Volunteer
          </Link>
          <Link href="/command" className="rounded-full border border-[#8fd0ff]/50 px-4 py-1.5 hover:bg-[#8fd0ff]/10 hover:text-white">
            Agency login
          </Link>
        </nav>
      </header>

      <main className="mx-auto max-w-6xl px-5 pb-16">
        {banner && (
          <div className={`mb-6 rounded-2xl border px-4 py-3 text-[15px] font-medium ${TONE[banner.tone]}`} data-testid="email-banner">
            {banner.text}
          </div>
        )}

        {/* Hero */}
        <section className="grid items-start gap-10 pt-4 lg:grid-cols-[1.1fr_1fr] lg:pt-10">
          <div>
            <span className="inline-flex items-center gap-2 rounded-full border border-[#8fd0ff]/40 bg-[#8fd0ff]/10 px-3 py-1 text-xs font-bold uppercase tracking-wider text-[#8fd0ff]">
              <span className="h-2 w-2 animate-pulse rounded-full bg-green-400" />
              Live in {region.name} · expanding across Nigeria
            </span>
            <h1 className="mt-5 text-4xl font-black leading-[1.08] tracking-tight text-white sm:text-5xl lg:text-6xl">
              Flood warnings before the water comes.
              <span className="block text-[#8fd0ff]">Help when it does.</span>
            </h1>
            <p className="mt-5 max-w-xl text-lg leading-relaxed text-[#c4e2ff]">
              FloodGuard watches the rain and the rivers for your neighbourhood, warns you early by SMS and email, and sends the nearest rescuer if you get trapped — even from a basic phone.
            </p>
            <ul className="mt-6 space-y-2.5 text-[15px] text-[#dcedff]">
              {["Alerts in English, Pidgin, Hausa, Yoruba and Igbo", "Works without internet — SMS and USSD on any phone", "Your family is told the moment you're safe"].map((t) => (
                <li key={t} className="flex gap-3">
                  <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-green-500 text-xs font-black text-white">✓</span>
                  {t}
                </li>
              ))}
            </ul>
          </div>
          <SignupCard regionName={region.name} />
        </section>

        {/* Emergency actions */}
        <section className="mt-14 grid gap-4 md:grid-cols-3">
          <div className="rounded-2xl border border-red-400/50 bg-gradient-to-br from-red-600/30 to-red-700/10 p-5">
            <div className="text-xs font-extrabold uppercase tracking-widest text-red-200">⚠ Need rescue now?</div>
            <div className="mt-2 text-2xl font-black text-white">SMS HELP to {region.smsShortcode}</div>
            <div className="mt-1 text-sm text-red-100/90">Add how many people, e.g. “HELP 3 people roof”.</div>
          </div>
          <div className="rounded-2xl border border-[#8fd0ff]/40 bg-[#8fd0ff]/10 p-5">
            <div className="text-xs font-extrabold uppercase tracking-widest text-[#8fd0ff]">No credit or data?</div>
            <div className="mt-2 text-2xl font-black text-white">Dial {region.ussdCode}</div>
            <div className="mt-1 text-sm text-[#c4e2ff]">Ask for help, report flooding or find a shelter.</div>
          </div>
          <div className="rounded-2xl border border-green-400/50 bg-gradient-to-br from-green-600/25 to-green-700/10 p-5">
            <div className="text-xs font-extrabold uppercase tracking-widest text-green-200">✓ You&apos;re safe?</div>
            <div className="mt-2 text-2xl font-black text-white">SMS SAFE</div>
            <div className="mt-1 text-sm text-green-100/90">We tell your family contacts straight away.</div>
          </div>
        </section>

        {/* How it works */}
        <section className="mt-16">
          <h2 className="text-sm font-extrabold uppercase tracking-widest text-[#8fd0ff]">How it works</h2>
          <div className="mt-4 grid gap-4 md:grid-cols-3">
            {STEPS.map((s, i) => (
              <div key={s.title} className="rounded-2xl border border-white/10 bg-white/[0.06] p-6 backdrop-blur">
                <div className="flex items-center gap-3">
                  <span className="grid h-11 w-11 place-items-center rounded-xl bg-[#8fd0ff]/15 text-2xl">{s.icon}</span>
                  <span className="text-xs font-bold text-[#86bdf2]">STEP {i + 1}</span>
                </div>
                <div className="mt-3 text-xl font-black text-white">{s.title}</div>
                <p className="mt-1.5 text-[15px] leading-relaxed text-[#c4e2ff]">{s.body}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Tools */}
        <section className="mt-16">
          <h2 className="text-sm font-extrabold uppercase tracking-widest text-[#8fd0ff]">For residents, volunteers and agencies</h2>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            {TOOLS.map((c) => (
              <Link key={c.href} href={c.href} className="group rounded-2xl border border-white/10 bg-white/[0.04] p-5 transition hover:border-[#8fd0ff]/60 hover:bg-white/[0.08]">
                <div className="text-xs font-bold uppercase tracking-wider text-[#86bdf2]">{c.tag}</div>
                <div className="mt-1 text-lg font-black text-white group-hover:text-[#8fd0ff]">{c.title} →</div>
                <p className="mt-1 text-[15px] text-[#c4e2ff]">{c.body}</p>
              </Link>
            ))}
          </div>
        </section>

        {env.demoMode && (
          <section className="mt-12 rounded-2xl border border-dashed border-[#8fd0ff]/50 p-5">
            <div className="text-xs font-extrabold uppercase tracking-widest text-[#8fd0ff]">Demo mode</div>
            <div className="mt-3 flex flex-wrap gap-3">
              <Link href="/demo" className="rounded-xl bg-[#8fd0ff] px-4 py-2 font-bold text-[#0a2452] hover:bg-white">
                Demo control panel
              </Link>
              <Link href="/sim" className="rounded-xl border border-[#8fd0ff]/60 px-4 py-2 font-bold text-[#dcedff] hover:bg-[#8fd0ff]/10">
                Phone simulator
              </Link>
            </div>
            <p className="mt-2 text-sm text-[#86bdf2]">All people, phone numbers and messages in the demo are fictional. No real SMS is sent in mock mode.</p>
          </section>
        )}
      </main>

      <footer className="border-t border-white/10">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-2 px-5 py-6 text-sm text-[#86bdf2]">
          <span className="font-bold text-white">FloodGuard</span>
          <Link href="/privacy" className="hover:text-white">
            Privacy
          </Link>
          <Link href="/roadmap" className="hover:text-white">
            Roadmap
          </Link>
          <span className="w-full text-xs sm:ml-auto sm:w-auto">Satellite data: NASA GPM IMERG, Copernicus Sentinel-1 &amp; DEM · Map © OpenStreetMap contributors</span>
        </div>
      </footer>
    </div>
  );
}
