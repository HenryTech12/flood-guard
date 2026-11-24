/**
 * Vercel build step (package.json "vercel-build"): apply pending database migrations, then
 * build. Keeps the database schema in step with the code on every deploy, so new columns
 * exist before new code uses them. Skips migrations when DATABASE_URL is not set.
 */
import { execSync } from "node:child_process";
import postgres from "postgres";
import { runMigrations } from "../src/lib/db/migrate";
import type { Sql } from "../src/lib/db/client";

async function main() {
  const url = process.env.DATABASE_URL;
  if (url) {
    const sql = postgres(url, { prepare: false, onnotice: () => {}, max: 1, connect_timeout: 20 }) as unknown as Sql;
    try {
      const applied = await runMigrations(sql);
      console.log(applied.length ? `Database migrations applied: ${applied.join(", ")}` : "Database schema is up to date.");
    } finally {
      await sql.end();
    }
  } else console.log("DATABASE_URL not set — skipping migrations.");
  execSync("next build", { stdio: "inherit" });
}

main().catch((e) => {
  console.error("Build failed while migrating the database:", e.message ?? e);
  process.exit(1);
});
