// "Something changed" notifications for live dashboards.
//
// 1. In-process event bus → /api/stream (server-sent events). Instant when the app runs
//    as a single Node process (npm start, docker).
// 2. Supabase Realtime broadcast (if NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY
//    are set). Needed on Vercel where each request may run in a different instance.
//
// Payloads carry NO personal data — only which kind of thing changed. Clients then
// refetch /api/state, which enforces auth.
import { EventEmitter } from "node:events";
import { env } from "../env";

export const CHANNEL = "floodguard";

const g = globalThis as unknown as { __fgBus?: EventEmitter };
export const bus: EventEmitter = g.__fgBus ?? (g.__fgBus = new EventEmitter().setMaxListeners(500));

let pending = new Set<string>();
let timer: ReturnType<typeof setTimeout> | null = null;

async function broadcastSupabase(kinds: string[]) {
  if (!env.supabaseUrl || !env.supabaseServiceKey) return;
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 1500);
  try {
    await fetch(`${env.supabaseUrl}/realtime/v1/api/broadcast`, {
      method: "POST",
      signal: ctrl.signal,
      headers: { "Content-Type": "application/json", apikey: env.supabaseServiceKey, Authorization: `Bearer ${env.supabaseServiceKey}` },
      body: JSON.stringify({ messages: [{ topic: CHANNEL, event: "change", payload: { kinds, at: Date.now() } }] }),
    });
  } catch {
    // Best effort: clients also poll.
  } finally {
    clearTimeout(t);
  }
}

/** Notify listeners. Await it at the end of a request so the broadcast completes on serverless. */
export async function publishChange(...kinds: string[]): Promise<void> {
  const list = kinds.length ? kinds : ["state"];
  bus.emit("change", { kinds: list, at: Date.now() });
  await broadcastSupabase(list);
}

/** Debounced variant for hot loops (tick). */
export function publishChangeSoon(kind: string) {
  pending.add(kind);
  if (timer) return;
  timer = setTimeout(() => {
    const kinds = [...pending];
    pending = new Set();
    timer = null;
    void publishChange(...kinds);
  }, 100);
}
