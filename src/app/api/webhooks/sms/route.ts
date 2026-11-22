// Africa's Talking inbound SMS callback (form-encoded: from, to, text, date, id, linkId).
// Also used by /sim. Idempotent on the provider message id.
import { checkWebhook, error, handle, json, readBody } from "@/lib/api";
import { getSql } from "@/lib/db/client";
import { handleInboundSms } from "@/lib/services/inbound";

export const dynamic = "force-dynamic";

export const POST = handle(async (req: Request) => {
  if (!checkWebhook(req)) return error(401, "bad webhook token");
  const b = await readBody(req);
  const from = b.from ?? b.phoneNumber;
  if (!from) return error(400, "missing from");
  const sim = req.headers.get("x-floodguard-sim") === "1";
  const id = b.id || b.messageId || `${sim ? "sim" : "at"}-${from}-${b.date ?? ""}-${b.text ?? ""}`;
  const result = await handleInboundSms(getSql(), { provider: sim ? "sim" : "africastalking", providerMessageId: id, from, text: b.text ?? "", channel: "sms" });
  return json(result);
});
