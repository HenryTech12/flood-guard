/**
 * Applies supabase/migrations/*.sql in order, once each (tracked in public.schema_migrations).
 * Works against Supabase (use the *session pooler* connection string) or local PostGIS.
 *
 *   npm run db:migrate
 *   npm run db:migrate -- --fresh   # DROP everything first (local dev only!)
 */
import "dotenv/config";
import postgres from "postgres";
import { runMigrations } from "../src/lib/db/migrate";
import type { Sql } from "../src/lib/db/client";

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL not set");
  const sql = postgres(url, { prepare: false, onnotice: () => {}, max: 1 }) as unknown as Sql;
  try {
    if (process.argv.includes("--fresh")) {
      if (/supabase\.(co|com)/.test(url) && !process.argv.includes("--yes")) throw new Error("Refusing --fresh against Supabase without --yes");
      console.log("Dropping public schema objects…");
      await sql.unsafe(`drop schema if exists public cascade; create schema public; grant all on schema public to public;`);
    }
    const applied = await runMigrations(sql);
    if (!applied.length) console.log("✓ database is up to date");
  } finally {
    await sql.end();
  }
}

main().catch((e) => {
  console.error(e.message ?? e);
  process.exit(1);
});
