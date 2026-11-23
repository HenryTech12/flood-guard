// Optional AI flood-risk score from the Python microservice in /ai-microservice
// (set AI_SERVICE_URL). Returns { available: false } when it is not configured or down,
// so the UI falls back to the transparent rule-based score.
import { z } from "zod";
import { handle, json } from "@/lib/api";

export const dynamic = "force-dynamic";

const Body = z.object({
  latitude: z.number(),
  longitude: z.number(),
  location_name: z.string().max(120).optional(),
  rainfall_mm: z.number().min(0),
  temperature: z.number(),
  humidity: z.number().min(0).max(100),
});

export const POST = handle(async (req: Request) => {
  const base = process.env.AI_SERVICE_URL?.replace(/\/$/, "");
  if (!base) return json({ available: false, reason: "AI_SERVICE_URL not set" });
  const b = Body.parse(await req.json());
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 6000);
  try {
    const res = await fetch(`${base}/api/v1/predict/flood-risk`, {
      method: "POST",
      signal: ctrl.signal,
      headers: { "Content-Type": "application/json", ...(process.env.AI_SERVICE_KEY ? { "X-API-Key": process.env.AI_SERVICE_KEY } : {}) },
      body: JSON.stringify({ ...b, humidity: Math.round(b.humidity) }),
    });
    if (!res.ok) return json({ available: false, reason: `AI service HTTP ${res.status}` });
    return json({ available: true, ...(await res.json()) });
  } catch (e) {
    return json({ available: false, reason: (e as Error).name === "AbortError" ? "AI service timed out" : "AI service unreachable" });
  } finally {
    clearTimeout(t);
  }
});
