/**
 * Seeds the database for a region (default: REGION env or "lokoja").
 *   npm run db:seed
 *   REGION=lokoja npm run db:seed
 * WARNING: truncates all FloodGuard tables first.
 */
import "dotenv/config";
import postgres from "postgres";
import { getRegion } from "../config/regions";
import { seedDatabase } from "../src/lib/seed/seed";
import type { Sql } from "../src/lib/db/client";

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL not set");
  const region = getRegion(process.env.REGION);
  const sql = postgres(url, { prepare: false, onnotice: () => {}, max: 1 }) as unknown as Sql;
  console.log(`Seeding region "${region.id}"…`);
  try {
    await seedDatabase(sql, region);
    console.log("Done. Operator login: operator@floodguard.demo / " + (process.env.SEED_OPERATOR_PASSWORD ? "(SEED_OPERATOR_PASSWORD)" : "floodguard-demo"));
  } finally {
    await sql.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
