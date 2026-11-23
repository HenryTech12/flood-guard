import { ShieldCheck } from "lucide-react";
import { GuardyFooter, GuardyHeader } from "@/components/guardy/Shell";
import { env } from "@/lib/env";
import LoginForm from "./LoginForm";

export const dynamic = "force-dynamic";
export const metadata = { title: "Authority login" };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;
  const safeNext =
    next?.startsWith("/") && !next.startsWith("//") ? next : "/authority";
  return (
    <div className="flex min-h-screen flex-col bg-gradient-to-br from-slate-50 via-blue-50 to-cyan-50">
      <GuardyHeader mode="page" subtitle="Authority access" />
      <main className="grid flex-1 place-items-center px-4 py-12">
        <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white/80 p-8 shadow-xl backdrop-blur-sm">
          <div className="mb-6 flex items-center">
            <div className="relative mr-4">
              <div className="absolute inset-0 rounded-xl bg-gradient-to-r from-purple-600 to-blue-600 opacity-20 blur-md" />
              <div className="relative rounded-xl bg-gradient-to-br from-purple-500 to-blue-500 p-3 shadow-lg">
                <ShieldCheck className="h-6 w-6 text-white" />
              </div>
            </div>
            <div>
              <h1 className="text-2xl font-black text-slate-900">
                Authority login
              </h1>
              <p className="text-sm font-semibold text-slate-600">
                State Emergency Management Agency staff
              </p>
            </div>
          </div>
          <LoginForm next={safeNext} demo={env.demoMode} />
          {env.demoMode && (
            <a
              href={`/api/demo/enter?key=${encodeURIComponent(env.demoKey)}&next=${encodeURIComponent(safeNext)}`}
              className="mt-4 block rounded-xl border-2 border-blue-200 bg-blue-50 px-4 py-3 text-center text-sm font-bold text-blue-700 transition-colors hover:bg-blue-100"
            >
              Demo mode: enter without password
            </a>
          )}
        </div>
      </main>
      <GuardyFooter />
    </div>
  );
}
