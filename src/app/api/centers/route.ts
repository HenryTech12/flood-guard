// Emergency centres (shelters + hospitals). Public: names and duty phone numbers.
import { handle, json } from "@/lib/api";
import { getSql } from "@/lib/db/client";

export const dynamic = "force-dynamic";

export const GET = handle(async () => {
  const rows = await getSql()<{ id: string; name: string; type: string; lat: number; lng: number; contact_phone: string; capacity: number; current_occupancy: number }[]>`
    select id, name, type, ST_Y(geom) lat, ST_X(geom) lng, contact_phone, capacity, current_occupancy from shelters order by type desc, name`;
  return json({
    data: rows.map((r) => ({ id: r.id, name: r.name, type: r.type, latitude: r.lat, longitude: r.lng, phone: r.contact_phone, capacity: r.capacity, occupancy: r.current_occupancy })),
  });
});
