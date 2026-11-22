// Africa's Talking USSD callback (form-encoded: sessionId, serviceCode, phoneNumber, text).
// Must answer with text/plain starting "CON " (continue) or "END " (finish).
import { checkWebhook, handle, readBody } from "@/lib/api";
import { getSql } from "@/lib/db/client";
import { handleUssd } from "@/lib/services/inbound";

export const dynamic = "force-dynamic";

export const POST = handle(async (req: Request) => {
  if (!checkWebhook(req)) return new Response("END Service unavailable", { status: 401, headers: { "Content-Type": "text/plain" } });
  const b = await readBody(req);
  if (!b.phoneNumber || !b.sessionId) return new Response("END Bad request", { status: 400, headers: { "Content-Type": "text/plain" } });
  const sim = req.headers.get("x-floodguard-sim") === "1";
  const r = await handleUssd(getSql(), { provider: sim ? "sim" : "africastalking", sessionId: b.sessionId, phone: b.phoneNumber, text: b.text ?? "" });
  return new Response(r.response, { headers: { "Content-Type": "text/plain; charset=utf-8" } });
});
