// Vulnerable-people register (web form). Residents or a community volunteer on their behalf.
import { z } from "zod";
import { handle, json } from "@/lib/api";
import { isValidPhone, normalizePhone } from "@/lib/core/phone";
import { LANGS, VULNERABLE_TYPES } from "@/lib/core/types";
import { getSql } from "@/lib/db/client";
import { tx as tr } from "@/lib/i18n/templates";
import { sendNow } from "@/lib/messaging/outbox";
import { registerResident } from "@/lib/services/residents";
import { LANG_NAMES } from "@/lib/core/types";

export const dynamic = "force-dynamic";

const Phone = z.string().refine(isValidPhone, "invalid phone").transform(normalizePhone);
const Email = z.union([z.literal(""), z.string().trim().toLowerCase().pipe(z.email("invalid email"))]).nullish().transform((e) => e || null);
const Body = z.object({
  phone: Phone,
  name: z.string().min(2).max(80),
  email: Email,
  lang: z.enum(LANGS),
  zoneId: z.string().min(1),
  landmarkId: z.string().nullish(),
  gps: z.tuple([z.number(), z.number()]).nullish(),
  shareLocation: z.boolean(),
  consent: z.literal(true, { message: "Consent is required" }),
  registeredBy: z.string().max(80).nullish(),
  vulnerable: z.array(z.object({ type: z.enum(VULNERABLE_TYPES), count: z.number().int().min(1).max(20), notes: z.string().max(200).nullish() })).max(10),
  family: z.array(z.object({ phone: Phone, name: z.string().max(80).nullish(), email: Email })).max(3),
});

export const POST = handle(async (req: Request) => {
  const b = Body.parse(await req.json());
  const sql = getSql();
  let home: [number, number] | null = null;
  if (b.shareLocation) {
    if (b.gps) home = b.gps;
    else if (b.landmarkId) {
      const [l] = await sql<{ lng: number; lat: number }[]>`select ST_X(geom) lng, ST_Y(geom) lat from landmarks where id = ${b.landmarkId}`;
      if (l) home = [l.lng, l.lat];
    }
  }
  const r = await registerResident(sql, {
    phone: b.phone,
    name: b.name,
    email: b.email,
    lang: b.lang,
    zoneId: b.zoneId,
    home,
    consent: b.consent,
    registeredBy: b.registeredBy || "self",
    vulnerable: b.vulnerable,
    family: b.family,
    mode: "replace",
  });
  const [z_] = await sql<{ short_name: string }[]>`select short_name from zones where id = ${b.zoneId}`;
  await sendNow(sql, [{ channel: "sms", to: b.phone, body: tr(b.lang, "sms.register_ack", { name: b.name, zone: z_?.short_name ?? b.zoneId, language: LANG_NAMES[b.lang] }), language: b.lang, purpose: "register_ack" }]);
  return json({ ok: true, created: r.created });
});
