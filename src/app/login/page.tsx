import { env } from "@/lib/env";
import LoginForm from "./LoginForm";

export const dynamic = "force-dynamic";
export const metadata = { title: "Operator login" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  const safeNext = next?.startsWith("/") ? next : "/command";
  return (
    <main className="grid min-h-screen place-items-center px-4">
      <div className="w-full max-w-sm rounded-2xl border border-slate-800 bg-slate-900/70 p-6">
        <h1 className="text-2xl font-black">Operator login</h1>
        <p className="text-sm text-slate-400">State Emergency Management Agency staff</p>
        <LoginForm next={safeNext} demo={env.demoMode} />
        {env.demoMode && (
          <a href={`/api/demo/enter?key=${encodeURIComponent(env.demoKey)}&next=${encodeURIComponent(safeNext)}`} className="mt-4 block rounded-lg border border-amber-700 px-4 py-2 text-center text-sm font-bold text-amber-300 hover:bg-amber-950/40">
            Demo mode: enter without password
          </a>
        )}
      </div>
    </main>
  );
}
