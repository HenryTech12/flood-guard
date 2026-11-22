import { lokoja } from "./lokoja";
import type { RegionConfig } from "./types";

export type { RegionConfig } from "./types";

// To add a region: create config/regions/<id>.ts, register it here, add its data files
// under public/data, then run `REGION=<id> npm run db:seed`.
const REGIONS: Record<string, RegionConfig> = {
  lokoja,
};

export function getRegion(id: string | undefined = process.env.NEXT_PUBLIC_REGION ?? process.env.REGION): RegionConfig {
  const region = REGIONS[id ?? "lokoja"];
  if (!region) throw new Error(`Unknown region "${id}". Known: ${Object.keys(REGIONS).join(", ")}`);
  return region;
}

export const regionIds = Object.keys(REGIONS);
