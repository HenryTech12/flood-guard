import { error, handle, json, requireOperator } from "@/lib/api";
import { getSql } from "@/lib/db/client";
import { safeRoute } from "@/lib/services/routing";

export const dynamic = "force-dynamic";

export const GET = handle(async (req: Request) => {
  await requireOperator();
  const u = new URL(req.url);
  const lng = Number(u.searchParams.get("lng"));
  const lat = Number(u.searchParams.get("lat"));
  if (!isFinite(lng) || !isFinite(lat)) return error(400, "lng/lat required");
  const profile = u.searchParams.get("profile") === "driving-car" ? "driving-car" : "foot-walking";
  return json(await safeRoute(getSql(), [lng, lat], profile));
});
