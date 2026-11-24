// GET  /api/reports — authority dashboard list (operators)
// POST /api/reports — citizen emergency report (multipart: fields + optional "audio" file).
//                     Becomes a FloodGuard help request: urgency scoring, rescue dispatch and
//                     the 3 nearest emergency centres (≤10 km) are notified by SMS/email.
import { z } from "zod";
import { error, handle, json, requireOperator } from "@/lib/api";
import { getSql } from "@/lib/db/client";
import { listReports, MAX_VOICE_BYTES, NEED_TYPES, submitWebReport } from "@/lib/services/citizen";

export const dynamic = "force-dynamic";

export const GET = handle(async () => {
  await requireOperator();
  return json({ data: await listReports(getSql()) }, { headers: { "Cache-Control": "no-store" } });
});

const Fields = z.object({
  name: z.string().trim().min(2, "Enter your name").max(80),
  phone: z.string().trim().max(20).optional().transform((v) => v || null),
  type_of_need: z.enum(NEED_TYPES),
  comments: z.string().trim().max(1000).optional().transform((v) => v || null),
  people: z.coerce.number().int().min(1).max(500).optional(),
  latitude: z.coerce.number().min(-90).max(90),
  longitude: z.coerce.number().min(-180).max(180),
});

// Small per-instance rate limit: a public form must not be usable to flood rescuers.
const hits = new Map<string, number[]>();
function limited(ip: string) {
  const now = Date.now();
  const recent = (hits.get(ip) ?? []).filter((t) => now - t < 10 * 60e3);
  recent.push(now);
  hits.set(ip, recent);
  return recent.length > 6;
}

export const POST = handle(async (req: Request) => {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0].trim() || "local";
  if (limited(ip)) return error(429, "Too many reports from this device. If you are in danger, SMS HELP.");
  const form = await req.formData();
  const raw: Record<string, string> = {};
  form.forEach((v, k) => {
    if (typeof v === "string") raw[k] = v;
  });
  const f = Fields.parse(raw);
  let voice: { mime: string; data: Buffer } | null = null;
  const audio = form.get("audio");
  if (audio && typeof audio !== "string" && audio.size > 0) {
    if (audio.size > MAX_VOICE_BYTES) return error(413, "Voice recording is too long (max ~3 minutes)");
    const mime = (audio.type || "audio/webm").split(";")[0];
    if (!/^audio\/(webm|ogg|mp4|mpeg|wav|x-m4a|aac)$/.test(mime)) return error(415, "Unsupported audio format");
    voice = { mime, data: Buffer.from(await audio.arrayBuffer()) };
  }
  const r = await submitWebReport(getSql(), {
    name: f.name,
    phone: f.phone,
    typeOfNeed: f.type_of_need,
    comments: f.comments,
    peopleCount: f.people ?? null,
    latitude: f.latitude,
    longitude: f.longitude,
    voice,
  });
  return json({ data: { ref: r.ref, locationName: r.locationName, merged: r.merged }, nearbyCenters: r.nearbyCenters, smsReplies: r.smsReplies });
});
