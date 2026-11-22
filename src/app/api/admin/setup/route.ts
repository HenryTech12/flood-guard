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
    const [{ n }] = await sql<{ n: number }[]>`select count(*)::int n from zones`;
    let seeded = false;
    if (n === 0) {
      await seedDatabase(sql, getRegion(), { dataDir: path.join(process.cwd(), "public", "data"), log: (m) => log.push(m) });
      seeded = true;
    } else log.push(`Database already has ${n} zones — not seeding (existing data is kept).`);
    return Response.json({ ok: true, migrationsApplied: applied, seeded, log, next: seeded ? "Open / or /demo?key=<DEMO_KEY>" : "Nothing else to do" });
  } catch (e) {
    console.error(e);
    return Response.json({ ok: false, error: (e as Error).message, log }, { status: 500 });
  }
}

export const GET = run;
export const POST = run;
