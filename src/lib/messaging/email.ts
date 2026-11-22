// Email delivery: Brevo (https://developers.brevo.com/reference/sendtransacemail) or a mock
// that only logs to the outbox. Switch with EMAIL_PROVIDER=mock|brevo.
import { env } from "../env";
import type { SendResult } from "./provider";

export interface EmailMessage {
  to: string;
  toName?: string | null;
  subject: string;
  text: string;
  html?: string | null;
  tags?: string[];
}

export interface EmailProvider {
  readonly name: "mock" | "brevo";
  send(m: EmailMessage): Promise<SendResult>;
}

export const BREVO_URL = "https://api.brevo.com/v3/smtp/email";

/** The JSON body Brevo's transactional email API expects. Exported for tests. */
export function brevoPayload(m: EmailMessage, sender: { email: string; name: string }) {
  return {
    sender,
    to: [m.toName ? { email: m.to, name: m.toName } : { email: m.to }],
    subject: m.subject,
    textContent: m.text,
    htmlContent: m.html ?? undefined,
    tags: m.tags?.length ? m.tags : undefined,
  };
}

export class MockEmailProvider implements EmailProvider {
  readonly name = "mock" as const;
  async send(): Promise<SendResult> {
    return { ok: true, providerMessageId: `mock-email-${crypto.randomUUID()}` };
  }
}

export class BrevoEmailProvider implements EmailProvider {
  readonly name = "brevo" as const;
  constructor(private fetchImpl: typeof fetch = fetch) {}

  async send(m: EmailMessage): Promise<SendResult> {
    const cfg = env.brevo;
    if (!cfg.apiKey) return { ok: false, error: "BREVO_API_KEY not set", retryable: false };
    if (!cfg.fromEmail) return { ok: false, error: "EMAIL_FROM not set (must be a sender verified in Brevo)", retryable: false };
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 10000);
    try {
      const res = await this.fetchImpl(BREVO_URL, {
        method: "POST",
        signal: ctrl.signal,
        headers: { "api-key": cfg.apiKey, "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify(brevoPayload(m, { email: cfg.fromEmail, name: cfg.fromName })),
      });
      const text = await res.text();
      if (res.ok) {
        let id: string | undefined;
        try {
          id = JSON.parse(text).messageId;
        } catch {
          /* empty body */
        }
        return { ok: true, providerMessageId: id ?? `brevo-${Date.now()}` };
      }
      // 400 = bad request (invalid address, unverified sender) → don't retry; 429/5xx → retry.
      return { ok: false, error: `Brevo HTTP ${res.status}: ${text.slice(0, 200)}`, retryable: res.status === 429 || res.status >= 500 };
    } catch (e) {
      return { ok: false, error: (e as Error).message, retryable: true };
    } finally {
      clearTimeout(t);
    }
  }
}

let cached: EmailProvider | null = null;
export function getEmailProvider(): EmailProvider {
  const want = env.emailProvider;
  if (!cached || cached.name !== want) cached = want === "brevo" ? new BrevoEmailProvider() : new MockEmailProvider();
  return cached;
}

export function isEmail(s: string | null | undefined): s is string {
  return !!s && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.trim());
}

export function maskEmail(e: string): string {
  const [u, d] = e.split("@");
  return d ? `${u.slice(0, 1)}***@${d}` : "***";
}
