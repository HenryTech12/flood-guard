// Africa's Talking voice callback. When our outbound alert call is answered, AT asks this
// URL what to do; we play the pre-recorded audio for that resident's language/level, or
// read the transcript if no recording exists yet.
import { checkWebhook, readBody } from "@/lib/api";
import { getSql } from "@/lib/db/client";
import { normalizePhone } from "@/lib/core/phone";

export const dynamic = "force-dynamic";

const xml = (body: string) => new Response(`<?xml version="1.0" encoding="UTF-8"?><Response>${body}</Response>`, { headers: { "Content-Type": "application/xml" } });
const esc = (s: string) => s.replace(/[<>&'"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&apos;", '"': "&quot;" })[c]!);

export async function POST(req: Request) {
  if (!checkWebhook(req)) return xml("<Reject/>");
  const b = await readBody(req);
  if (b.isActive === "0") return xml(""); // end-of-call notification
  const phone = normalizePhone(b.destinationNumber || b.callerNumber || "");
  const [msg] = await getSql()<{ body: string; audio_url: string | null }[]>`
    select body, audio_url from outbound_messages where channel = 'voice' and to_phone = ${phone} and created_at > now() - interval '30 minutes'
    order by created_at desc limit 1`;
  if (!msg) return xml(`<Say>This is FloodGuard. If you need help, send HELP by SMS.</Say>`);
  if (msg.audio_url) {
    try {
      const head = await fetch(msg.audio_url, { method: "HEAD" });
      if (head.ok) return xml(`<Play url="${esc(msg.audio_url)}"/>`);
    } catch {
      /* fall through to text-to-speech */
    }
  }
  return xml(`<Say voice="woman" playBeep="false">${esc(msg.body)}</Say>`);
}
