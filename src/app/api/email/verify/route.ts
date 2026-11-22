import { getSql } from "@/lib/db/client";
import { confirmEmail } from "@/lib/services/emailSignup";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const ok = await confirmEmail(getSql(), new URL(req.url).searchParams.get("token")).catch(() => false);
  return new Response(null, { status: 303, headers: { Location: `/?email=${ok ? "confirmed" : "invalid"}` } });
}
