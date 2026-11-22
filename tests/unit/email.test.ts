import { afterEach, describe, expect, it, vi } from "vitest";
import { BREVO_URL, BrevoEmailProvider, brevoPayload, isEmail, maskEmail } from "@/lib/messaging/email";
import { escapeHtml, renderEmail } from "@/lib/messaging/emailTemplate";
import { alertEmail, safeEmail } from "@/lib/services/notify";

afterEach(() => vi.unstubAllEnvs());

describe("Brevo provider", () => {
  it("builds the transactional email payload", () => {
    expect(brevoPayload({ to: "a@example.com", toName: "Ada", subject: "S", text: "T", html: "<p>T</p>", tags: ["floodguard"] }, { email: "alerts@floodguard.ng", name: "FloodGuard" })).toEqual({
      sender: { email: "alerts@floodguard.ng", name: "FloodGuard" },
      to: [{ email: "a@example.com", name: "Ada" }],
      subject: "S",
      textContent: "T",
      htmlContent: "<p>T</p>",
      tags: ["floodguard"],
    });
  });

  it("POSTs to Brevo with the api-key header and returns the message id", async () => {
    vi.stubEnv("BREVO_API_KEY", "xkeysib-test");
    vi.stubEnv("EMAIL_FROM", "alerts@floodguard.ng");
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ messageId: "<abc@smtp-relay.brevo.com>" }), { status: 201 }));
    const r = await new BrevoEmailProvider(fetchMock as unknown as typeof fetch).send({ to: "a@example.com", subject: "S", text: "T" });
    expect(r).toEqual({ ok: true, providerMessageId: "<abc@smtp-relay.brevo.com>" });
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(BREVO_URL);
    expect((init.headers as Record<string, string>)["api-key"]).toBe("xkeysib-test");
    expect(JSON.parse(String(init.body)).sender).toEqual({ email: "alerts@floodguard.ng", name: "FloodGuard" });
  });

  it("retries on 429/5xx but not on 400", async () => {
    vi.stubEnv("BREVO_API_KEY", "k");
    vi.stubEnv("EMAIL_FROM", "alerts@floodguard.ng");
    const res = (status: number) => new BrevoEmailProvider((async () => new Response('{"code":"x"}', { status })) as unknown as typeof fetch).send({ to: "a@example.com", subject: "S", text: "T" });
    expect((await res(429)).retryable).toBe(true);
    expect((await res(503)).retryable).toBe(true);
    expect((await res(400)).retryable).toBe(false);
  });

  it("fails permanently without configuration", async () => {
    vi.stubEnv("BREVO_API_KEY", "");
    expect(await new BrevoEmailProvider().send({ to: "a@example.com", subject: "S", text: "T" })).toMatchObject({ ok: false, retryable: false });
  });
});

describe("email content", () => {
  it("escapes HTML and produces a text version", () => {
    const e = renderEmail({ title: "Hi <b>", paragraphs: ["a & b"], bullets: ["x"], cta: { label: "Go", url: "https://x.test/?a=1&b=2" } });
    expect(e.html).toContain("Hi &lt;b&gt;");
    expect(e.html).toContain("a &amp; b");
    expect(e.html).toContain("https://x.test/?a=1&amp;b=2");
    expect(e.text).toContain("• x");
    expect(e.text).toContain("Go: https://x.test/?a=1&b=2");
    expect(escapeHtml(`"'`)).toBe("&quot;&#39;");
  });

  it("alert emails follow the resident's language with English fallback", () => {
    expect(alertEmail("en", "high", { zone: "Gadumo", shelter: "Otokiti School" }).subject).toBe("FloodGuard: FLOOD WARNING for Gadumo");
    expect(alertEmail("pcm", "high", { zone: "Gadumo", shelter: "Otokiti School" }).text).toContain("Carry pikin");
    expect(alertEmail("ha", "severe", { zone: "Gadumo", shelter: "X" }).subject).toContain("SEVERE FLOOD");
  });

  it("safe emails name the person", () => {
    expect(safeEmail("en", "rescued", { name: "Mama Ngozi", ref: "FG-1001" }).text).toContain("Mama Ngozi has been rescued");
    expect(safeEmail("pcm", "checkin", { name: "John", time: "10:00" }).subject).toBe("FloodGuard: John dey safe");
  });

  it("email helpers", () => {
    expect(isEmail("a@b.co")).toBe(true);
    expect(isEmail("nope")).toBe(false);
    expect(maskEmail("chinedu@example.com")).toBe("c***@example.com");
  });
});
