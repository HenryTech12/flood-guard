// Small helpers for route handlers.
import { ZodError } from "zod";
import { getOperatorSession, getVolunteerSession, hasDemoAccess, type Session } from "./auth/session";
import { env } from "./env";
import { DispatchError } from "./services/dispatch";
import { RegistrationError } from "./services/residents";

export const json = (data: unknown, init?: ResponseInit) => Response.json(data, init);
export const error = (status: number, message: string) => Response.json({ error: message }, { status });

export function handle<A extends unknown[]>(fn: (...args: A) => Promise<Response>) {
  return async (...args: A): Promise<Response> => {
    try {
      return await fn(...args);
    } catch (e) {
      if (e instanceof Response) return e;
      if (e instanceof DispatchError) return error(e.status, e.message);
      if (e instanceof RegistrationError) return error(409, e.message);
      if (e instanceof ZodError) return error(400, e.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "));
      console.error(e);
      return error(500, (e as Error).message ?? "Internal error");
    }
  };
}

export async function requireOperator(): Promise<Session> {
  const s = await getOperatorSession();
  if (!s) throw error(401, "Operator login required");
  return s;
}

export async function requireVolunteer(): Promise<Session & { volunteerId: string }> {
  const s = await getVolunteerSession();
  if (!s?.volunteerId) throw error(401, "Volunteer login required");
  return s as Session & { volunteerId: string };
}

/** Demo controls: demo key cookie, or an operator session, and DEMO_MODE must be on. */
export async function requireDemo(): Promise<void> {
  if (!env.demoMode) throw error(403, "Demo mode is disabled (DEMO_MODE=false)");
  if (await hasDemoAccess()) return;
  if (await getOperatorSession()) return;
  throw error(401, "Demo key required: open /demo?key=…");
}

/** Webhook guard: shared secret in ?token=, or the in-app simulator while in demo mode. */
export function checkWebhook(req: Request): boolean {
  if (!env.webhookSecret) return true;
  const url = new URL(req.url);
  if (url.searchParams.get("token") === env.webhookSecret) return true;
  if (env.demoMode && req.headers.get("x-floodguard-sim") === "1") return true;
  return false;
}

export async function readBody(req: Request): Promise<Record<string, string>> {
  const ct = req.headers.get("content-type") ?? "";
  if (ct.includes("application/json")) return (await req.json()) as Record<string, string>;
  const form = await req.formData();
  const out: Record<string, string> = {};
  form.forEach((v, k) => (out[k] = String(v)));
  return out;
}
