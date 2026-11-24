import { cookies } from "next/headers";
import { z } from "zod";
import { error, handle, json } from "@/lib/api";
import { verifyOtp } from "@/lib/auth/otp";
import { cookieOpts, signToken, VOL_COOKIE } from "@/lib/auth/session";
import { normalizePhone } from "@/lib/core/phone";
import { getSql } from "@/lib/db/client";
import { audit } from "@/lib/services/audit";

export const dynamic = "force-dynamic";
const Body = z.object({ phone: z.string().min(7), code: z.string().min(4).max(8) });

export const POST = handle(async (req: Request) => {
  const { phone, code } = Body.parse(await req.json());
  const sql = getSql();
  const v = await verifyOtp(sql, normalizePhone(phone), code);
  if (!v) return error(401, "Wrong or expired code");
  const token = await signToken({ sub: v.id, role: "volunteer", name: v.name, volunteerId: v.id }, "7d");
  (await cookies()).set(VOL_COOKIE, token, cookieOpts(7 * 24 * 3600));
  await audit(sql, `volunteer:${v.id}`, "volunteer", v.id, "login");
  return json({ ok: true, name: v.name });
});
