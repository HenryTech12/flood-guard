// Guardy app shell: sticky glass header with the gradient shield logo, role switch and Home.
import Link from "next/link";
import { ArrowLeft, Home, Map, Shield, ShieldCheck, Truck } from "lucide-react";

export type ShellMode = "citizen" | "authority" | "page";

export function GuardyHeader({ mode, subtitle }: { mode: ShellMode; subtitle?: string }) {
  return (
    <header className="sticky top-0 z-50 border-b border-slate-200 bg-white/80 shadow-lg backdrop-blur-md">
      <div className="mx-auto max-w-7xl px-4 py-5 sm:px-6 lg:px-8">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <Link href="/" className="flex items-center space-x-4">
            <div className="relative">
              <div className="absolute inset-0 animate-pulse rounded-xl bg-gradient-to-r from-blue-600 to-cyan-600 opacity-20 blur-md" />
              <div className="relative rounded-xl bg-gradient-to-br from-blue-600 to-cyan-600 p-2.5 shadow-lg">
                <ShieldCheck className="h-7 w-7 text-white" />
              </div>
            </div>
            <div>
              <h1 className="text-2xl font-black tracking-tight text-slate-900">
                <span className="bg-gradient-to-r from-blue-600 to-cyan-600 bg-clip-text text-transparent">FloodGuard</span> Nigeria
              </h1>
              <p className="text-xs font-semibold text-slate-600">{subtitle ?? (mode === "citizen" ? "Citizen Portal" : mode === "authority" ? "Authority Dashboard" : "")}</p>
            </div>
          </Link>
          <nav className="flex flex-wrap items-center justify-end gap-3">
            {mode === "citizen" && (
              <Link href="/authority" className="group flex items-center rounded-xl bg-gradient-to-r from-orange-500 to-red-500 px-5 py-2.5 font-bold text-white transition-all duration-300 hover:scale-105 hover:shadow-xl">
                <Shield className="mr-2 h-4 w-4 transition-transform group-hover:rotate-12" />
                Authority
              </Link>
            )}
            {mode === "authority" && (
              <>
                <Link href="/command" className="group flex items-center rounded-xl bg-gradient-to-r from-slate-800 to-slate-900 px-5 py-2.5 font-bold text-white transition-all duration-300 hover:scale-105 hover:shadow-xl">
                  <Map className="mr-2 h-4 w-4" />
                  Live command map
                </Link>
                <Link href="/citizen" className="group flex items-center rounded-xl bg-gradient-to-r from-blue-500 to-cyan-500 px-5 py-2.5 font-bold text-white transition-all duration-300 hover:scale-105 hover:shadow-xl">
                  <Home className="mr-2 h-4 w-4 transition-transform group-hover:scale-110" />
                  Citizen
                </Link>
              </>
            )}
            {mode === "page" && (
              <Link href="/volunteer" className="flex items-center rounded-xl bg-gradient-to-r from-green-600 to-emerald-600 px-5 py-2.5 font-bold text-white transition-all duration-300 hover:scale-105 hover:shadow-xl">
                <Truck className="mr-2 h-4 w-4" />
                Volunteer
              </Link>
            )}
            <Link href="/" className="flex items-center rounded-xl border-2 border-slate-300 bg-slate-50 px-5 py-2.5 font-semibold text-slate-700 transition-all duration-300 hover:border-slate-400 hover:bg-white">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Home
            </Link>
          </nav>
        </div>
      </div>
    </header>
  );
}

export function GuardyFooter() {
  return (
    <footer className="mt-12 border-t border-gray-200 bg-white py-6">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <p className="text-center text-sm text-gray-600">FloodGuard Nigeria — real-time flood monitoring, early warning and emergency response</p>
        <p className="mt-2 text-center text-xs text-gray-500">
          Weather &amp; river data: Open-Meteo · Satellite: NASA IMERG, Copernicus Sentinel-1 · Map © OpenStreetMap contributors ·{" "}
          <Link href="/privacy" className="underline hover:text-gray-700">
            Privacy
          </Link>
        </p>
      </div>
    </footer>
  );
}

/** Guardy card heading: gradient icon tile + title + subtitle. */
export function CardTitle({ icon, title, subtitle, from = "from-blue-500", to = "to-cyan-500" }: { icon: React.ReactNode; title: string; subtitle?: string; from?: string; to?: string }) {
  return (
    <div className="flex items-center">
      <div className="relative mr-4">
        <div className={`absolute inset-0 rounded-xl bg-gradient-to-r ${from} ${to} opacity-20 blur-md`} />
        <div className={`relative rounded-xl bg-gradient-to-br ${from} ${to} p-3 shadow-lg`}>{icon}</div>
      </div>
      <div>
        <h2 className="text-2xl font-black text-slate-900">{title}</h2>
        {subtitle && <p className="text-sm font-semibold text-slate-600">{subtitle}</p>}
      </div>
    </div>
  );
}
