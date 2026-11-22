// One-click unsubscribe from alert emails (GET from the link; POST for mail clients that
// support RFC 8058 one-click). SMS alerts are unaffected — residents use STOP for those.
import { getSql } from "@/lib/db/client";
import { unsubscribeEmail } from "@/lib/services/emailSignup";

export const dynamic = "force-dynamic";

async function run(req: Request) {
  const ok = await unsubscribeEmail(getSql(), new URL(req.url).searchParams.get("token")).catch(() => false);
  return new Response(null, { status: 303, headers: { Location: `/?email=${ok ? "unsubscribed" : "invalid"}` } });
}
export const GET = run;
export const POST = run;
