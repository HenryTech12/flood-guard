// Server-sent events: pushes "changed" signals (no personal data) from the in-process
// bus. Works when the app runs as one Node process; on Vercel use Supabase Realtime.
import { bus } from "@/lib/realtime/server";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const enc = new TextEncoder();
  let cleanup = () => {};
  const stream = new ReadableStream({
    start(controller) {
      const send = (event: string, data: unknown) => {
        try {
          controller.enqueue(enc.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
        } catch {
          cleanup();
        }
      };
      const onChange = (p: unknown) => send("change", p);
      bus.on("change", onChange);
      const ping = setInterval(() => send("ping", { at: Date.now() }), 15000);
      send("hello", { at: Date.now() });
      cleanup = () => {
        clearInterval(ping);
        bus.off("change", onChange);
      };
      req.signal.addEventListener("abort", () => {
        cleanup();
        try {
          controller.close();
        } catch {}
      });
    },
    cancel() {
      cleanup();
    },
  });
  return new Response(stream, { headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache, no-transform", Connection: "keep-alive", "X-Accel-Buffering": "no" } });
}
