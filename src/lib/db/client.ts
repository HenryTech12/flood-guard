import postgres from "postgres";
import { env } from "../env";

export type Sql = postgres.Sql<Record<string, never>>;
export type Tx = postgres.TransactionSql<Record<string, never>>;
/** Either the pool or a transaction — services accept both. */
export type Db = Sql | Tx;

const g = globalThis as unknown as { __fgSql?: Sql };

export function getSql(): Sql {
  if (!g.__fgSql) {
    g.__fgSql = postgres(env.databaseUrl, {
      prepare: false, // required for Supabase's transaction pooler (port 6543)
      max: Number(process.env.DB_POOL_MAX ?? 5),
      idle_timeout: 20,
      connect_timeout: 15,
      onnotice: () => {},
      transform: { undefined: null },
    }) as unknown as Sql;
  }
  return g.__fgSql;
}

/** Point literal helper: sql`... ${pt(sql, lng, lat)} ...` */
export function pt(sql: Db, lngLat: [number, number] | null | undefined) {
  if (!lngLat) return sql`null::geometry`;
  return sql`ST_SetSRID(ST_MakePoint(${lngLat[0]}::float8, ${lngLat[1]}::float8), 4326)`;
}
