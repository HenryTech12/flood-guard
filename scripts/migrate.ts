/**
 * Applies supabase/migrations/*.sql in order, once each (tracked in public.schema_migrations).
 * Works against Supabase (use the *direct* or session-pooler connection string) or local PostGIS.
 *
 *   npm run db:migrate
 *   npm run db:migrate -- --fresh   # DROP everything first (local dev only!)
 */
import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import postgres from "postgres";

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL not set");
  const sql = postgres(url, { prepare: false, onnotice: () => {}, max: 1 });
  try {
    if (process.argv.includes("--fresh")) {
      if (/supabase\.(co|com)/.test(url) && !process.argv.includes("--yes")) throw new Error("Refusing --fresh against Supabase without --yes");
      console.log("Dropping public schema objects…");
      await sql.unsafe(`drop schema if exists public cascade; create schema public; grant all on schema public to public;`);
    }
    await sql`create table if not exists public.schema_migrations (name text primary key, applied_at timestamptz not null default now())`;
    const dir = path.join(process.cwd(), "supabase", "migrations");
    const files = fs.readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();
    const applied = new Set((await sql<{ name: string }[]>`select name from public.schema_migrations`).map((r) => r.name));
    for (const f of files) {
      if (applied.has(f)) {
        console.log(`✓ ${f} (already applied)`);
        continue;
      }
      const body = fs.readFileSync(path.join(dir, f), "utf8");
      await sql.begin(async (tx) => {
        await tx.unsafe(body);
        await tx`insert into public.schema_migrations (name) values (${f})`;
      });
      console.log(`→ applied ${f}`);
    }
  } finally {
    await sql.end();
  }
}

main().catch((e) => {
  console.error(e.message ?? e);
  process.exit(1);
});
