// GET /api/weather?city=Lagos | ?lat=..&lon=..  — live weather (Open-Meteo, no key needed).
// For named cities, heavy rain or storms are recorded server-side as flood events (at most
// one per city per hour) and nearby subscribers are alerted — the browser can't fake this.
import { error, handle, json } from "@/lib/api";
import { getSql } from "@/lib/db/client";
import { calculateWeatherRisk, weatherEventSeverity } from "@/lib/core/weatherRisk";
import { createFloodEvent } from "@/lib/services/citizen";
import { cityCoords, getFloodForecast, getWeather } from "@/lib/services/weather";

export const dynamic = "force-dynamic";

export const GET = handle(async (req: Request) => {
  const u = new URL(req.url);
  const sql = getSql();
  const cityName = u.searchParams.get("city");
  let lat = Number(u.searchParams.get("lat"));
  let lon = Number(u.searchParams.get("lon"));
  let name: string | undefined;
  if (cityName) {
    const c = cityCoords(cityName);
    if (!c) return error(400, "Unknown city");
    ({ lat, lon, name } = c);
  }
  if (!isFinite(lat) || !isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) return error(400, "city or lat/lon required");

  const withForecast = u.searchParams.get("forecast") !== "0";
  const [weather, forecast] = await Promise.all([getWeather(sql, lat, lon, name), withForecast ? getFloodForecast(lat, lon) : Promise.resolve(null)]);
  const risk = calculateWeatherRisk({
    rainfall: weather.rainfall,
    humidity: weather.humidity,
    pressure: weather.pressure,
    condition: weather.description,
    riverDischarge: forecast?.riverDischarge,
    riverDischargeMax: forecast?.riverDischargeMax,
  });

  let floodEvent: { id: string; created: boolean; notified: number; subscribers: number } | null = null;
  const severity = weatherEventSeverity(weather.rainfall, weather.description);
  if (cityName && severity && weather.source === "open-meteo") {
    floodEvent = await createFloodEvent(sql, {
      location: weather.name,
      latitude: lat,
      longitude: lon,
      severity,
      rainfall: weather.rainfall,
      description: weather.description,
      source: "weather",
    });
  }
  return json({ data: weather, forecast, risk, floodEvent }, { headers: { "Cache-Control": "no-store" } });
});
