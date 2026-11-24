// Public reference data for forms: zones + landmarks + shelters. No personal data.
import { handle, json } from "@/lib/api";
import { getSql } from "@/lib/db/client";
import { getShelters, getZones } from "@/lib/services/reference";

export const dynamic = "force-dynamic";

export const GET = handle(async () => {
  const sql = getSql();
  const [zones, shelters] = await Promise.all([getZones(sql), getShelters(sql)]);
  return json({ zones: zones.map((z) => ({ id: z.id, name: z.name, shortName: z.shortName, level: z.level, landmarks: z.landmarks })), shelters });
});
