import { error, handle, json } from "@/lib/api";
import { getFloodForecast } from "@/lib/services/weather";

export const dynamic = "force-dynamic";

export const GET = handle(async (req: Request) => {
  const u = new URL(req.url);
  const lat = Number(u.searchParams.get("lat"));
  const lon = Number(u.searchParams.get("lon"));
  if (!isFinite(lat) || !isFinite(lon)) return error(400, "lat/lon required");
  return json({ data: await getFloodForecast(lat, lon) });
});
