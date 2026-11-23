import { getOperatorSession, hasDemoAccess } from "@/lib/auth/session";
import { env } from "@/lib/env";
import DemoPanel from "./DemoPanel";

export const dynamic = "force-dynamic";
export const metadata = { title: "Demo control panel" };

export default async function DemoPage({ searchParams }: { searchParams: Promise<{ key?: string; error?: string }> }) {
  const { key, error } = await searchParams;
  if (!env.demoMode) return <main className="p-10 text-center text-slate-400">Demo mode is disabled (DEMO_MODE=false).</main>;
  if (key) {
    // Cookies can only be set from a route handler: bounce through /api/demo/enter.
    const { redirect } = await import("next/navigation");
    redirect(`/api/demo/enter?key=${encodeURIComponent(key)}`);
  }
  const ok = (await hasDemoAccess()) || !!(await getOperatorSession());
  if (!ok)
    return (
      <main className="grid min-h-screen place-items-center px-4">
        <form action="/api/demo/enter" method="get" className="w-full max-w-sm rounded-2xl border border-slate-800 bg-slate-900/70 p-6">
          <h1 className="text-2xl font-black">Demo control panel</h1>
          <p className="text-sm text-slate-400">Enter the demo key (DEMO_KEY).</p>
          <input name="key" type="password" className="mt-4 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2" placeholder="Demo key" autoFocus />
          {error && <div className="mt-2 text-sm text-red-700">Wrong key.</div>}
          <button className="mt-3 w-full rounded-lg bg-sky-600 px-4 py-2 font-bold text-[#08203f]">Unlock</button>
        </form>
      </main>
    );
  return <DemoPanel />;
}
