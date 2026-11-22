// Africa's Talking SMS delivery reports (id, status, phoneNumber, failureReason).
import { checkWebhook, error, handle, json, readBody } from "@/lib/api";
import { getSql } from "@/lib/db/client";

export const dynamic = "force-dynamic";

export const POST = handle(async (req: Request) => {
  if (!checkWebhook(req)) return error(401, "bad webhook token");
  const b = await readBody(req);
  if (!b.id) return error(400, "missing id");
  const status = /success/i.test(b.status ?? "") ? "delivered" : /fail|reject/i.test(b.status ?? "") ? "failed" : null;
  if (status) await getSql()`update outbound_messages set status = ${status}, last_error = ${b.failureReason ?? null} where provider_message_id = ${b.id}`;
  return json({ ok: true });
});
