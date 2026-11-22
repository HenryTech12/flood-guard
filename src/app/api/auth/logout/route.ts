import { cookies } from "next/headers";
import { DEMO_COOKIE, OP_COOKIE, VOL_COOKIE } from "@/lib/auth/session";

export async function POST(req: Request) {
  const which = new URL(req.url).searchParams.get("who");
  const jar = await cookies();
  if (!which || which === "operator") jar.delete(OP_COOKIE);
  if (!which || which === "volunteer") jar.delete(VOL_COOKIE);
  if (!which) jar.delete(DEMO_COOKIE);
  return Response.json({ ok: true });
}
