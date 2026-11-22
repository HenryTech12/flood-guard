// Landing-page sign-up: a resident registers with email + phone for flood alerts.
// The email gets a confirmation link; alert emails start only after it is confirmed.
import { z } from "zod";
import { handle, json } from "@/lib/api";
import { isValidPhone, normalizePhone } from "@/lib/core/phone";
import { LANG_NAMES, LANGS } from "@/lib/core/types";
import { getSql } from "@/lib/db/client";
import { env } from "@/lib/env";
import { tx as tr } from "@/lib/i18n/templates";
import { sendNow } from "@/lib/messaging/outbox";
import { sendVerificationIfNeeded } from "@/lib/services/emailSignup";
import { registerResident } from "@/lib/services/residents";

export const dynamic = "force-dynamic";

const Body = z.object({
  name: z.string().trim().min(2, "Enter your name").max(80),
  email: z.string().trim().toLowerCase().pipe(z.email("Enter a valid email address")),
  phone: z.string().refine(isValidPhone, "Enter a valid phone number").transform(normalizePhone),
  // A covered area, or — for people elsewhere — the town/LGA they live in.
  zoneId: z.string().nullish().transform((v) => v || null),
  locality: z.string().trim().max(80).nullish().transform((v) => v || null),
  lang: z.enum(LANGS),
  consent: z.literal(true, { message: "Please agree to how we use your details" }),
});

export const POST = handle(async (req: Request) => {
  const b = Body.parse(await req.json());
  if (!b.zoneId && !b.locality) return json({ error: "Choose your area, or type your town if it is not listed" }, { status: 400 });
  const sql = getSql();
  if (b.zoneId) {
    const [known] = await sql`select 1 from zones where id = ${b.zoneId}`;
    if (!known) return json({ error: "Unknown area" }, { status: 400 });
  }
  // "append" mode: never wipes household details added earlier via /register or USSD.
  const r = await registerResident(sql, { phone: b.phone, name: b.name, email: b.email, locality: b.zoneId ? null : b.locality, lang: b.lang, zoneId: b.zoneId, consent: true, registeredBy: "web-signup", mode: "append" });
  const [z_] = b.zoneId ? await sql<{ short_name: string }[]>`select short_name from zones where id = ${b.zoneId}` : [];
  if (r.created) {
    const place = z_?.short_name ?? b.locality ?? "your area";
    await sendNow(sql, [{ channel: "sms", to: b.phone, body: tr(b.lang, "sms.register_ack", { name: b.name, zone: place, language: LANG_NAMES[b.lang] }), language: b.lang, purpose: "register_ack" }]);
  }
  const v = await sendVerificationIfNeeded(sql, r.id);
  return json({
    ok: true,
    created: r.created,
    email: b.email,
    covered: !!b.zoneId,
    emailVerification: v.sent ? "sent" : (v.reason ?? null),
    // Demo convenience: with the mock email provider nothing reaches an inbox, so return the link.
    demoVerifyUrl: env.demoMode && env.emailProvider === "mock" && v.url ? new URL(v.url).pathname + new URL(v.url).search : null,
  });
});
