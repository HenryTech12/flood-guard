// Central, typed access to environment variables (read lazily so builds work without them).
const bool = (v: string | undefined, d: boolean) => (v === undefined || v === "" ? d : ["1", "true", "yes", "on"].includes(v.toLowerCase()));
const num = (v: string | undefined, d: number) => (v === undefined || v === "" || isNaN(Number(v)) ? d : Number(v));

export const env = {
  get databaseUrl() {
    const u = process.env.DATABASE_URL;
    if (!u) throw new Error("DATABASE_URL is not set. Copy .env.example to .env and fill it in.");
    return u;
  },
  get demoMode() {
    return bool(process.env.DEMO_MODE, true);
  },
  get demoKey() {
    return process.env.DEMO_KEY || "floodguard-demo";
  },
  get demoOtp() {
    return process.env.DEMO_OTP || "123456";
  },
  get authSecret() {
    const s = process.env.AUTH_SECRET;
    if (!s || s.length < 16) {
      if (process.env.NODE_ENV === "production" && !this.demoMode) throw new Error("AUTH_SECRET must be set (≥16 chars) in production.");
      return "dev-only-insecure-secret-change-me";
    }
    return s;
  },
  get messagingProvider(): "mock" | "africastalking" {
    return process.env.MESSAGING_PROVIDER === "africastalking" ? "africastalking" : "mock";
  },
  get africasTalking() {
    return {
      username: process.env.AT_USERNAME || "sandbox",
      apiKey: process.env.AT_API_KEY || "",
      senderId: process.env.AT_SENDER_ID || "",
      voiceNumber: process.env.AT_VOICE_NUMBER || "",
    };
  },
  get publicBaseUrl() {
    return (process.env.PUBLIC_BASE_URL || process.env.NEXT_PUBLIC_BASE_URL || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000")).replace(/\/$/, "");
  },
  get webhookSecret() {
    return process.env.WEBHOOK_SECRET || "";
  },
  get cronSecret() {
    return process.env.CRON_SECRET || "";
  },
  get orsApiKey() {
    return process.env.ORS_API_KEY || "";
  },
  get offerTtlSec() {
    return num(process.env.OFFER_TTL_SECONDS, 120);
  },
  get autopilotAcceptSec() {
    return num(process.env.AUTOPILOT_ACCEPT_SECONDS, 4);
  },
  get moveSpeedMps() {
    return num(process.env.DEMO_MOVE_SPEED_MPS, 70);
  },
  get alertCooldownMin() {
    return num(process.env.ALERT_COOLDOWN_MINUTES, 360);
  },
  get emailProvider(): "mock" | "brevo" {
    return process.env.EMAIL_PROVIDER === "brevo" ? "brevo" : "mock";
  },
  get brevo() {
    return {
      apiKey: process.env.BREVO_API_KEY || "",
      fromEmail: process.env.EMAIL_FROM || "",
      fromName: process.env.EMAIL_FROM_NAME || "FloodGuard",
    };
  },
  /** SEMA staff who get operational emails (comma-separated). Empty = no ops emails. */
  get opsNotifyEmails(): string[] {
    return (process.env.OPS_NOTIFY_EMAILS || "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
  },
  get opsNotifyMinUrgency() {
    return num(process.env.OPS_NOTIFY_MIN_URGENCY, 70);
  },
  get supabaseUrl() {
    return process.env.NEXT_PUBLIC_SUPABASE_URL || "";
  },
  get supabaseServiceKey() {
    return process.env.SUPABASE_SERVICE_ROLE_KEY || "";
  },
};
