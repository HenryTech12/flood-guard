/** Seeds only when the zones table is empty (used by the Docker image on first start). */
import "dotenv/config";
import postgres from "postgres";
import { getRegion } from "../config/regions";
import { seedDatabase } from "../src/lib/seed/seed";
import type { Sql } from "../src/lib/db/client";

async function main() {
  const sql = postgres(process.env.DATABASE_URL!, { prepare: false, onnotice: () => {}, max: 1 }) as unknown as Sql;
  try {
    const [{ n }] = await sql<{ n: number }[]>`select count(*)::int as n from zones`;
    if (n > 0) return console.log("Database already seeded — skipping.");
    await seedDatabase(sql, getRegion(process.env.REGION));
  } finally {
    await sql.end();
  }
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
