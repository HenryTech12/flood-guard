// Crowd report web form.
import { z } from "zod";
import { handle, json } from "@/lib/api";
import { isValidPhone, normalizePhone } from "@/lib/core/phone";
import { REPORT_TYPES } from "@/lib/core/types";
import { getSql } from "@/lib/db/client";
import { createCrowdReport } from "@/lib/services/reports";

export const dynamic = "force-dynamic";

const Body = z.object({
  phone: z.string().refine((p) => !p || isValidPhone(p)).transform((p) => (p ? normalizePhone(p) : null)).nullish(),
  type: z.enum(REPORT_TYPES),
  depthCm: z.number().int().min(0).max(500).nullish(),
  landmarkId: z.string().nullish(),
  zoneId: z.string().nullish(),
  gps: z.tuple([z.number(), z.number()]).nullish(),
  description: z.string().max(500).nullish(),
  // Small client-resized JPEG as a data URL (≤ ~150 KB) or an https URL.
  photoUrl: z.string().max(220_000).refine((u) => /^data:image\/(jpeg|png|webp);base64,/.test(u) || /^https:\/\//.test(u), "invalid photo").nullish(),
});

export const POST = handle(async (req: Request) => {
  const b = Body.parse(await req.json());
  const sql = getSql();
  let loc: [number, number] | null = b.gps ?? null;
  let source = "gps";
  if (!loc && b.landmarkId) {
    const [l] = await sql<{ lng: number; lat: number }[]>`select ST_X(geom) lng, ST_Y(geom) lat from landmarks where id = ${b.landmarkId}`;
    if (l) {
      loc = [l.lng, l.lat];
      source = "ussd_landmark";
    }
  }
  if (!loc && b.zoneId) {
    const [z_] = await sql<{ lng: number; lat: number }[]>`select ST_X(centroid) lng, ST_Y(centroid) lat from zones where id = ${b.zoneId}`;
    if (z_) {
      loc = [z_.lng, z_.lat];
      source = "zone_centroid";
    }
  }
  if (!loc) return json({ error: "Choose a landmark or share your location" }, { status: 400 });
  const r = await createCrowdReport(sql, { phone: b.phone ?? null, location: loc, locationSource: source, zoneId: b.zoneId, landmarkId: b.landmarkId, type: b.type, depthCm: b.depthCm, description: b.description, photoUrl: b.photoUrl, channel: "web" });
  return json({ ok: true, verification: r.verification });
});
