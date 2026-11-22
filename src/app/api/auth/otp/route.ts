import { z } from "zod";
import { handle, json } from "@/lib/api";
import { requestOtp } from "@/lib/auth/otp";
import { normalizePhone } from "@/lib/core/phone";
import { getSql } from "@/lib/db/client";

export const dynamic = "force-dynamic";
const Body = z.object({ phone: z.string().min(7) });

export const POST = handle(async (req: Request) => {
  const { phone } = Body.parse(await req.json());
  const r = await requestOtp(getSql(), normalizePhone(phone));
  return json({ ok: r.ok, demoHint: r.demoCode ? `Demo mode: code is ${r.demoCode}` : undefined });
});
