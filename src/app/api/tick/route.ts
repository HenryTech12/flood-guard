// Heartbeat: POST (or GET) from open dashboards, Supabase pg_cron, or any scheduler.
import { error, handle, json } from "@/lib/api";
import { getSql } from "@/lib/db/client";
import { env } from "@/lib/env";
import { runTick } from "@/lib/services/tick";

export const dynamic = "force-dynamic";

const run = handle(async (req: Request) => {
  if (env.cronSecret) {
    const auth = req.headers.get("authorization");
    const fromPage = req.headers.get("x-floodguard-page") === "1";
    if (auth !== `Bearer ${env.cronSecret}` && !fromPage) return error(401, "bad cron secret");
  }
  return json(await runTick(getSql()));
});
export const POST = run;
export const GET = run;
