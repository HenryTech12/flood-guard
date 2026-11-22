// MessagingProvider: the only place that talks to an SMS/voice gateway.
import { env } from "../env";

export interface SendResult {
  ok: boolean;
  providerMessageId?: string;
  error?: string;
  /** false = permanent failure (bad number); true/undefined = retry with backoff */
  retryable?: boolean;
}

export interface MessagingProvider {
  readonly name: "mock" | "africastalking";
  sendSms(to: string, body: string): Promise<SendResult>;
  /** Place an outbound call; the provider fetches /api/webhooks/voice to learn what to play. */
  startVoiceCall(to: string): Promise<SendResult>;
}

/** Logs to the outbox only. Set MOCK_FAILURE_RATE=0.3 to exercise retries. */
export class MockProvider implements MessagingProvider {
  readonly name = "mock" as const;
  private fail() {
    const rate = Number(process.env.MOCK_FAILURE_RATE ?? 0);
    return rate > 0 && Math.random() < rate;
  }
  async sendSms(): Promise<SendResult> {
    if (this.fail()) return { ok: false, error: "mock transient failure", retryable: true };
    return { ok: true, providerMessageId: `mock-${crypto.randomUUID()}` };
  }
  async startVoiceCall(): Promise<SendResult> {
    if (this.fail()) return { ok: false, error: "mock transient failure", retryable: true };
    return { ok: true, providerMessageId: `mock-call-${crypto.randomUUID()}` };
  }
}

/**
 * Africa's Talking REST API (https://developers.africastalking.com).
 * Sandbox is used automatically when AT_USERNAME=sandbox.
 */
export class AfricasTalkingProvider implements MessagingProvider {
  readonly name = "africastalking" as const;
  private get cfg() {
    return env.africasTalking;
  }
  private get sandbox() {
    return this.cfg.username === "sandbox";
  }

  private async post(url: string, form: Record<string, string>): Promise<Response> {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 8000);
    try {
      return await fetch(url, {
        method: "POST",
        signal: ctrl.signal,
        headers: { apiKey: this.cfg.apiKey, Accept: "application/json", "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams(form).toString(),
      });
    } finally {
      clearTimeout(t);
    }
  }

  async sendSms(to: string, body: string): Promise<SendResult> {
    if (!this.cfg.apiKey) return { ok: false, error: "AT_API_KEY not set", retryable: false };
    const url = this.sandbox ? "https://api.sandbox.africastalking.com/version1/messaging" : "https://api.africastalking.com/version1/messaging";
    const form: Record<string, string> = { username: this.cfg.username, to, message: body };
    if (this.cfg.senderId) form.from = this.cfg.senderId;
    try {
      const res = await this.post(url, form);
      const text = await res.text();
      if (!res.ok) return { ok: false, error: `HTTP ${res.status}: ${text.slice(0, 200)}`, retryable: res.status >= 500 || res.status === 429 };
      const json = JSON.parse(text);
      const r = json?.SMSMessageData?.Recipients?.[0];
      if (!r) return { ok: false, error: json?.SMSMessageData?.Message ?? "no recipient in response", retryable: true };
      // statusCode 100/101/102 = processed/sent/queued
      if ([100, 101, 102].includes(r.statusCode)) return { ok: true, providerMessageId: r.messageId };
      return { ok: false, error: `${r.status} (${r.statusCode})`, retryable: ![403, 404, 405, 406, 407].includes(r.statusCode) };
    } catch (e) {
      return { ok: false, error: (e as Error).message, retryable: true };
    }
  }

  async startVoiceCall(to: string): Promise<SendResult> {
    if (!this.cfg.apiKey || !this.cfg.voiceNumber) return { ok: false, error: "AT_API_KEY / AT_VOICE_NUMBER not set", retryable: false };
    const url = this.sandbox ? "https://voice.sandbox.africastalking.com/call" : "https://voice.africastalking.com/call";
    try {
      const res = await this.post(url, { username: this.cfg.username, from: this.cfg.voiceNumber, to });
      const text = await res.text();
      if (!res.ok) return { ok: false, error: `HTTP ${res.status}: ${text.slice(0, 200)}`, retryable: res.status >= 500 };
      const json = JSON.parse(text);
      const e = json?.entries?.[0];
      if (e && /Queued/i.test(e.status)) return { ok: true, providerMessageId: e.sessionId };
      return { ok: false, error: json?.errorMessage ?? e?.status ?? "call failed", retryable: true };
    } catch (e) {
      return { ok: false, error: (e as Error).message, retryable: true };
    }
  }
}

let cached: MessagingProvider | null = null;
export function getProvider(): MessagingProvider {
  const want = env.messagingProvider;
  if (!cached || cached.name !== want) cached = want === "africastalking" ? new AfricasTalkingProvider() : new MockProvider();
  return cached;
}
