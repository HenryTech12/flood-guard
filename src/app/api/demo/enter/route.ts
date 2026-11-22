// /api/demo/enter?key=… → sets the demo cookie and redirects to /demo (or ?next=).
import { cookies } from "next/headers";
import { cookieOpts, DEMO_COOKIE, signToken } from "@/lib/auth/session";
import { env } from "@/lib/env";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const u = new URL(req.url);
  const next = u.searchParams.get("next")?.startsWith("/") ? u.searchParams.get("next")! : "/demo";
  if (!env.demoMode || u.searchParams.get("key") !== env.demoKey) {
    return new Response(null, { status: 303, headers: { Location: "/demo?error=1" } });
  }
  (await cookies()).set(DEMO_COOKIE, await signToken({ demo: true }, "24h"), cookieOpts(24 * 3600));
  return new Response(null, { status: 303, headers: { Location: next } });
}
