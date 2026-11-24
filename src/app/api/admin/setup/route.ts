// One-time database setup from the browser (no laptop needed):
//   https://<your-app>/api/admin/setup?key=<DEMO_KEY or SETUP_KEY>
// 1. Applies any pending migrations (safe to repeat — each runs once).
// 2. Seeds the demo region ONLY if the database has no zones yet — it never wipes data.
import path from "node:path";
import { getRegion } from "../../../../../config/regions";
import { getSql } from "@/lib/db/client";
import { runMigrations } from "@/lib/db/migrate";
import { env } from "@/lib/env";
import { seedDatabase } from "@/lib/seed/seed";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

async function run(req: Request) {
  const key = new URL(req.url).searchParams.get("key");
  const expected = process.env.SETUP_KEY || (env.demoMode ? env.demoKey : "");
  if (!expected) return Response.json({ error: "Set SETUP_KEY (or DEMO_MODE=true with DEMO_KEY) to enable setup." }, { status: 403 });
  if (key !== expected) return Response.json({ error: "Wrong or missing ?key=" }, { status: 401 });

  const sql = getSql();
  const log: string[] = [];
  try {
    const applied = await runMigrations(sql, { log: (m) => log.push(m) });
    const region = getRegion();
    const [{ n, mine }] = await sql<{ n: number; mine: number }[]>`
      select count(*)::int n, count(*) filter (where region_id = ${region.id})::int mine from zones`;
    const switching = new URL(req.url).searchParams.get("switch") === "1";
    let seeded = false;
    if (n === 0 || (mine === 0 && switching)) {
      if (n > 0) log.push(`Replacing the previous region's demo data with ${region.name} (all existing data is removed).`);
      await seedDatabase(sql, region, { dataDir: path.join(process.cwd(), "public", "data"), log: (m) => log.push(m) });
      seeded = true;
    } else if (mine === 0) {
      return Response.json({
        ok: false,
        error: `The database holds another region's data, but this deployment is configured for ${region.name}. Open this link again with &switch=1 to replace it (this deletes ALL existing data, including sign-ups).`,
        log,
      }, { status: 409 });
    } else log.push(`Database already has ${n} ${region.name} zones — not seeding (existing data is kept).`);
    return Response.json({ ok: true, migrationsApplied: applied, seeded, log, next: seeded ? "Open / or /demo?key=<DEMO_KEY>" : "Nothing else to do" });
  } catch (e) {
    console.error(e);
    return Response.json({ ok: false, error: (e as Error).message, log }, { status: 500 });
  }
}

export const GET = run;
export const POST = run;
