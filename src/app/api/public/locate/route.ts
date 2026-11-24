// Which FloodGuard area is this point in? Used to pre-fill the sign-up form.
// Coordinates are only used for this lookup — nothing is stored or logged.
import { error, handle, json } from "@/lib/api";
import { getRegion } from "../../../../../config/regions";
import { haversineM } from "@/lib/core/geo";
import { getSql } from "@/lib/db/client";
import { zoneForPoint } from "@/lib/services/reference";

export const dynamic = "force-dynamic";

export const GET = handle(async (req: Request) => {
  const u = new URL(req.url);
  const lat = Number(u.searchParams.get("lat"));
  const lng = Number(u.searchParams.get("lng"));
  if (!isFinite(lat) || !isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) return error(400, "lat/lng required");
  const sql = getSql();
  const region = getRegion();
  const zoneId = await zoneForPoint(sql, [lng, lat]); // inside a zone, or the nearest one within ~1.5 km
  const [z] = zoneId ? await sql<{ name: string }[]>`select name from zones where id = ${zoneId}` : [];
  return json(
    {
      zoneId: zoneId ?? null,
      zoneName: z?.name ?? null,
      region: region.name,
      distanceToRegionKm: Math.round(haversineM([lng, lat], region.center) / 1000),
    },
    { headers: { "Cache-Control": "no-store" } },
  );
});
