import Link from "next/link";
import { ArrowRight, Bell, Droplets, Home as HomeIcon, MapPin, MessageSquare, Phone, Shield, ShieldCheck, TrendingUp, Truck, Users, UsersRound, Zap } from "lucide-react";
import { getRegion } from "../../config/regions";
import { env } from "@/lib/env";
import SignupCard from "./SignupCard";

export const dynamic = "force-dynamic";

const EMAIL_BANNER: Record<string, { text: string; cls: string }> = {
  confirmed: { text: "Email confirmed — flood alerts will now also come to your inbox.", cls: "border-green-300 bg-green-50 text-green-800" },
  unsubscribed: { text: "You will no longer receive alert emails. SMS alerts continue — send STOP to stop them too.", cls: "border-blue-300 bg-blue-50 text-blue-800" },
  invalid: { text: "That link is invalid or has expired. Sign up again to get a new one.", cls: "border-red-300 bg-red-50 text-red-800" },
};

const WHY = [
  { icon: HomeIcon, title: "Safety First", body: "Stay ahead of floods and protect your home and family with real-time monitoring and instant alerts.", tone: "blue", grad: "from-blue-500 to-blue-600" },
  { icon: Zap, title: "Predictive Alerts", body: "Know flood risks before they happen with satellite rainfall, river-flow forecasts and AI-assisted risk scoring.", tone: "orange", grad: "from-orange-500 to-red-500" },
  { icon: UsersRound, title: "Community Ready", body: "Report flooding, request rescue by SMS or USSD from any phone, and let volunteers with boats reach you fast.", tone: "green", grad: "from-green-500 to-emerald-500" },
] as const;
const TONE: Record<string, { border: string; hover: string; text: string; glow: string; blob: string }> = {
  blue: { border: "border-blue-100 hover:border-blue-400", hover: "group-hover:text-blue-600", text: "text-blue-600", glow: "bg-blue-500", blob: "bg-blue-500/10 group-hover:bg-blue-500/20" },
  orange: { border: "border-orange-100 hover:border-orange-400", hover: "group-hover:text-orange-600", text: "text-orange-600", glow: "bg-orange-500", blob: "bg-orange-500/10 group-hover:bg-orange-500/20" },
  green: { border: "border-green-100 hover:border-green-400", hover: "group-hover:text-green-600", text: "text-green-600", glow: "bg-green-500", blob: "bg-green-500/10 group-hover:bg-green-500/20" },
};

export default async function LandingPage({ searchParams }: { searchParams: Promise<{ email?: string }> }) {
  const { email } = await searchParams;
  const banner = email ? EMAIL_BANNER[email] : undefined;
  const region = getRegion();

  return (
    <div className="relative min-h-screen overflow-hidden bg-gradient-to-br from-slate-50 via-blue-50 to-cyan-50">
      <div className="animate-blob absolute left-10 top-20 h-72 w-72 rounded-full bg-blue-400 opacity-20 mix-blend-multiply blur-3xl filter" />
      <div className="animate-blob animation-delay-2000 absolute right-10 top-40 h-72 w-72 rounded-full bg-cyan-400 opacity-20 mix-blend-multiply blur-3xl filter" />
      <div className="animate-blob animation-delay-4000 absolute -bottom-8 left-1/2 h-72 w-72 rounded-full bg-teal-400 opacity-20 mix-blend-multiply blur-3xl filter" />

      <div className="relative flex flex-1 flex-col items-center px-4 py-12 sm:px-6 lg:px-8">
        {banner && (
          <div className={`mb-8 w-full max-w-3xl rounded-xl border-2 px-4 py-3 text-center font-semibold ${banner.cls}`} data-testid="email-banner">
            {banner.text}
          </div>
        )}

        {/* Hero */}
        <div className="mb-16 max-w-4xl text-center">
          <div className="mb-8 flex items-center justify-center">
            <div className="relative">
              <div className="absolute inset-0 animate-pulse rounded-2xl bg-gradient-to-r from-blue-600 to-cyan-600 opacity-20 blur-xl" />
              <div className="relative rounded-2xl bg-gradient-to-br from-blue-600 to-cyan-600 p-4 shadow-2xl">
                <ShieldCheck className="h-16 w-16 text-white" />
              </div>
            </div>
          </div>
          <h1 className="mb-6 text-5xl font-black tracking-tight md:text-7xl">
            <span className="bg-gradient-to-r from-blue-600 via-cyan-600 to-teal-600 bg-clip-text text-transparent">FloodGuard</span>
            <br />
            <span className="text-slate-900">Nigeria</span>
          </h1>
          <p className="mb-8 text-xl font-medium leading-relaxed text-slate-600 md:text-2xl">
            Advanced flood monitoring and emergency response system
            <br />
            <span className="text-lg text-slate-500">From early warning to rescue — live in {region.name}, expanding across Nigeria</span>
          </p>
          <div className="mb-8 flex flex-wrap items-center justify-center gap-4">
            <div className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-blue-600 to-cyan-600 px-5 py-3 text-sm font-bold text-white shadow-lg transition-all hover:shadow-xl">
              <span className="relative flex h-3 w-3">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-white opacity-75" />
                <span className="relative inline-flex h-3 w-3 rounded-full bg-white" />
              </span>
              Live Monitoring Active
            </div>
            <div className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-5 py-3 text-sm font-semibold text-slate-700 shadow-md">
              <Bell className="h-4 w-4" />
              SMS, Voice &amp; Email Alerts
            </div>
          </div>
          <div className="mx-auto grid max-w-2xl grid-cols-3 gap-4">
            {[
              { icon: Droplets, cls: "text-blue-600", big: "24/7", small: "Monitoring" },
              { icon: MapPin, cls: "text-cyan-600", big: "20km", small: "Alert radius" },
              { icon: TrendingUp, cls: "text-teal-600", big: "Real-Time", small: "Alerts" },
            ].map((s) => (
              <div key={s.small} className="rounded-xl border border-slate-200 bg-white/80 p-4 shadow-lg backdrop-blur-sm">
                <s.icon className={`mx-auto mb-2 h-8 w-8 ${s.cls}`} />
                <div className="text-2xl font-bold text-slate-900">{s.big}</div>
                <div className="text-xs font-medium text-slate-600">{s.small}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Emergency strip */}
        <div className="mb-16 grid w-full max-w-5xl gap-4 md:grid-cols-3">
          <div className="rounded-2xl border-2 border-red-200 bg-white p-5 shadow-xl">
            <div className="flex items-center gap-2 text-xs font-black uppercase tracking-wider text-red-600">
              <Phone className="h-4 w-4" /> Need rescue now?
            </div>
            <div className="mt-2 text-2xl font-black text-slate-900">SMS HELP to {region.smsShortcode}</div>
            <p className="mt-1 text-sm font-medium text-slate-600">Add how many people, e.g. “HELP 3 people roof”.</p>
          </div>
          <div className="rounded-2xl border-2 border-blue-200 bg-white p-5 shadow-xl">
            <div className="flex items-center gap-2 text-xs font-black uppercase tracking-wider text-blue-600">
              <MessageSquare className="h-4 w-4" /> No credit or data?
            </div>
            <div className="mt-2 text-2xl font-black text-slate-900">Dial {region.ussdCode}</div>
            <p className="mt-1 text-sm font-medium text-slate-600">Request help, report flooding or find a shelter.</p>
          </div>
          <div className="rounded-2xl border-2 border-green-200 bg-white p-5 shadow-xl">
            <div className="flex items-center gap-2 text-xs font-black uppercase tracking-wider text-green-600">
              <ShieldCheck className="h-4 w-4" /> You&apos;re safe?
            </div>
            <div className="mt-2 text-2xl font-black text-slate-900">SMS SAFE</div>
            <p className="mt-1 text-sm font-medium text-slate-600">Your family contacts are told straight away.</p>
          </div>
        </div>

        {/* Why FloodGuard */}
        <div className="mb-20 w-full max-w-6xl">
          <div className="mb-12 text-center">
            <h2 className="mb-4 text-4xl font-black text-slate-900 md:text-5xl">
              Why <span className="bg-gradient-to-r from-blue-600 to-cyan-600 bg-clip-text text-transparent">FloodGuard</span>?
            </h2>
            <p className="mx-auto max-w-2xl text-lg font-medium text-slate-600">Advanced technology and community-driven insights to keep you safe from flooding</p>
          </div>
          <div className="mb-12 grid grid-cols-1 gap-8 md:grid-cols-3">
            {WHY.map((w) => {
              const t = TONE[w.tone];
              return (
                <div key={w.title} className={`group relative overflow-hidden rounded-2xl border-2 bg-white p-8 shadow-xl transition-all duration-500 hover:-translate-y-2 hover:shadow-2xl ${t.border}`}>
                  <div className={`absolute right-0 top-0 h-32 w-32 rounded-full blur-3xl transition-all duration-500 ${t.blob}`} />
                  <div className="relative">
                    <div className="mb-6">
                      <div className="relative inline-block">
                        <div className={`absolute inset-0 rounded-2xl opacity-20 blur-xl transition-opacity group-hover:opacity-30 ${t.glow}`} />
                        <div className={`relative rounded-2xl bg-gradient-to-br p-4 shadow-lg transition-transform duration-300 group-hover:scale-110 ${w.grad}`}>
                          <w.icon className="h-10 w-10 text-white" />
                        </div>
                      </div>
                    </div>
                    <h3 className={`mb-3 text-2xl font-black text-slate-900 transition-colors ${t.hover}`}>{w.title}</h3>
                    <p className="mb-6 font-medium leading-relaxed text-slate-600">{w.body}</p>
                    <div className={`flex items-center gap-2 text-sm font-bold transition-all group-hover:gap-3 ${t.text}`}>
                      <span>Learn more</span>
                      <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
          <div className="text-center">
            <Link href="/citizen" className="group inline-flex items-center gap-3 rounded-xl bg-gradient-to-r from-blue-600 via-cyan-600 to-teal-600 px-8 py-4 text-lg font-black text-white shadow-2xl transition-all duration-300 hover:scale-105">
              <span>Get Started Now</span>
              <ArrowRight className="h-5 w-5 transition-transform group-hover:translate-x-2" />
            </Link>
            <p className="mt-4 text-sm font-medium text-slate-500">Free for everyone — works on any phone</p>
          </div>
        </div>

        {/* Alert registration */}
        <div className="mb-16 w-full max-w-5xl">
          <SignupCard regionName={region.name} />
        </div>

        {/* Access levels */}
        <div className="mb-12 w-full max-w-5xl">
          <h2 className="mb-10 text-center text-3xl font-bold text-slate-900">Choose Your Access Level</h2>
          <div className="grid grid-cols-1 gap-8 md:grid-cols-2">
            <Link href="/citizen" className="group relative overflow-hidden rounded-2xl border-2 border-transparent bg-white p-8 text-left shadow-xl transition-all duration-300 hover:border-blue-500 hover:shadow-2xl" data-testid="role-citizen">
              <div className="absolute inset-0 bg-gradient-to-br from-blue-50 to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
              <div className="relative">
                <div className="mb-6 flex items-center gap-4">
                  <div className="rounded-xl bg-gradient-to-br from-blue-500 to-cyan-500 p-4 shadow-lg transition-transform duration-300 group-hover:scale-110">
                    <Users className="h-10 w-10 text-white" />
                  </div>
                  <div>
                    <h3 className="mb-1 text-2xl font-bold text-slate-900">Citizen Portal</h3>
                    <div className="text-sm font-semibold text-blue-600">For Community Members</div>
                  </div>
                </div>
                <ul className="mb-6 space-y-3 text-slate-600">
                  {["Report flood emergencies by form or voice", "Monitor flood risk where you are, live", "Receive SMS & email alerts in your language", "Find nearby emergency centres and shelters"].map((t) => (
                    <li key={t} className="flex items-start gap-2">
                      <div className="mt-2 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-blue-500" />
                      <span>{t}</span>
                    </li>
                  ))}
                </ul>
                <div className="flex items-center justify-between">
                  <div className="text-sm font-bold text-blue-600 transition-transform duration-300 group-hover:translate-x-2">Enter Citizen Portal →</div>
                  <div className="rounded-full bg-blue-100 px-3 py-1 text-xs font-bold text-blue-700">Public Access</div>
                </div>
              </div>
            </Link>
            <Link href="/authority" className="group relative overflow-hidden rounded-2xl border-2 border-transparent bg-white p-8 text-left shadow-xl transition-all duration-300 hover:border-orange-500 hover:shadow-2xl" data-testid="role-authority">
              <div className="absolute inset-0 bg-gradient-to-br from-orange-50 to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
              <div className="relative">
                <div className="mb-6 flex items-center gap-4">
                  <div className="rounded-xl bg-gradient-to-br from-orange-500 to-red-500 p-4 shadow-lg transition-transform duration-300 group-hover:scale-110">
                    <Shield className="h-10 w-10 text-white" />
                  </div>
                  <div>
                    <h3 className="mb-1 text-2xl font-bold text-slate-900">Authority Dashboard</h3>
                    <div className="text-sm font-semibold text-orange-600">For Emergency Response</div>
                  </div>
                </div>
                <ul className="mb-6 space-y-3 text-slate-600">
                  {["Manage emergency reports and listen to voice messages", "Live command map with rescue dispatch", "Broadcast SMS, voice & email alerts by zone", "Weather, river-flow and satellite flood analytics"].map((t) => (
                    <li key={t} className="flex items-start gap-2">
                      <div className="mt-2 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-orange-500" />
                      <span>{t}</span>
                    </li>
                  ))}
                </ul>
                <div className="flex items-center justify-between">
                  <div className="text-sm font-bold text-orange-600 transition-transform duration-300 group-hover:translate-x-2">Enter Authority Dashboard →</div>
                  <div className="rounded-full bg-orange-100 px-3 py-1 text-xs font-bold text-orange-700">Staff Login</div>
                </div>
              </div>
            </Link>
          </div>
          <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-3">
            {[
              { href: "/volunteer", icon: Truck, title: "Volunteer app", body: "Boat owners & drivers accept rescue jobs" },
              { href: "/register", icon: Users, title: "Priority register", body: "Elderly, disabled, pregnant or sick at home" },
              { href: "/report", icon: Droplets, title: "Report flooding", body: "Water rising or a road blocked near you" },
            ].map((c) => (
              <Link key={c.href} href={c.href} className="group flex items-center gap-4 rounded-xl border border-slate-200 bg-white/80 p-4 shadow-md backdrop-blur-sm transition-all hover:-translate-y-0.5 hover:border-blue-300 hover:shadow-lg">
                <div className="rounded-lg bg-blue-100 p-2.5">
                  <c.icon className="h-5 w-5 text-blue-600" />
                </div>
                <div>
                  <div className="font-bold text-slate-900 group-hover:text-blue-600">{c.title}</div>
                  <div className="text-xs font-medium text-slate-500">{c.body}</div>
                </div>
              </Link>
            ))}
          </div>
        </div>

        {env.demoMode && (
          <div className="mb-12 w-full max-w-5xl rounded-2xl border-2 border-dashed border-blue-300 bg-white/70 p-5 text-center backdrop-blur-sm">
            <p className="text-sm font-bold uppercase tracking-wider text-blue-700">Demo mode</p>
            <div className="mt-3 flex flex-wrap justify-center gap-3">
              <Link href="/demo" className="rounded-xl bg-gradient-to-r from-blue-600 to-cyan-600 px-5 py-2.5 font-bold text-white shadow-lg hover:shadow-xl">
                Demo control panel
              </Link>
              <Link href="/sim" className="rounded-xl border-2 border-slate-300 bg-white px-5 py-2.5 font-semibold text-slate-700 hover:border-slate-400">
                Phone simulator
              </Link>
            </div>
            <p className="mt-2 text-xs text-slate-500">All people, phone numbers and messages in the demo are fictional.</p>
          </div>
        )}

        <div className="max-w-3xl text-center">
          <div className="rounded-xl border border-slate-200 bg-white/60 p-6 shadow-lg backdrop-blur-sm">
            <p className="mb-2 text-sm font-medium text-slate-600">Powered by</p>
            <div className="flex flex-wrap items-center justify-center gap-3 text-xs text-slate-500">
              {["Open-Meteo weather & river flow", "NASA IMERG rainfall", "Copernicus Sentinel-1", "Africa's Talking SMS/USSD", "Brevo email", "Supabase + PostGIS"].map((t) => (
                <span key={t} className="rounded-full bg-white px-3 py-1 font-semibold">
                  {t}
                </span>
              ))}
            </div>
            <div className="mt-3 flex justify-center gap-4 text-xs text-slate-500">
              <Link href="/privacy" className="hover:text-slate-700">
                Privacy
              </Link>
              <Link href="/roadmap" className="hover:text-slate-700">
                Roadmap
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
