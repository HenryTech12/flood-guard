// Applies supabase/migrations/*.sql in order, once each (tracked in public.schema_migrations).
// Shared by `npm run db:migrate` and the one-time /api/admin/setup route.
import fs from "node:fs";
import path from "node:path";
import type { Sql } from "./client";

export const MIGRATIONS_DIR = path.join(process.cwd(), "supabase", "migrations");

export async function runMigrations(sql: Sql, { dir = MIGRATIONS_DIR, log = console.log }: { dir?: string; log?: (m: string) => void } = {}) {
  const applied: string[] = [];
  await sql.begin(async (tx) => {
    // Serialise concurrent runs (two deploys, two browser tabs).
    await tx`select pg_advisory_xact_lock(7311001)`;
    await tx`create table if not exists public.schema_migrations (name text primary key, applied_at timestamptz not null default now())`;
    const done = new Set((await tx<{ name: string }[]>`select name from public.schema_migrations`).map((r) => r.name));
    const files = fs.readdirSync(/*turbopackIgnore: true*/ dir).filter((f) => f.endsWith(".sql")).sort();
    for (const f of files) {
      if (done.has(f)) continue;
      await tx.unsafe(fs.readFileSync(path.join(/*turbopackIgnore: true*/ dir, f), "utf8"));
      await tx`insert into public.schema_migrations (name) values (${f})`;
      applied.push(f);
      log(`→ applied ${f}`);
    }
  });
  return applied;
}
