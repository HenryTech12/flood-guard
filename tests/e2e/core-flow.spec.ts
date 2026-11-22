// The one flow that must work end-to-end (brief §2), driven through the real UI and
// webhooks with the mock messaging provider:
//   1. risk rises to HIGH   2. alerts go out in each resident's language
//   3. resident SMSes HELP  4. request appears live on the command map, ranked
//   5. nearest volunteer gets the offer, accepts, moves  6. rescued → green, family SMS
import { expect, test, type APIRequestContext } from "@playwright/test";

const DEMO_KEY = process.env.DEMO_KEY ?? "floodguard-demo";
const RESIDENT = "+2348000000001"; // Mama Ngozi, Gadumo, Pidgin, elderly + child under 5
const FAMILY = ["+2348002000001", "+2348002000002"];

interface Msg {
  to: string;
  body: string;
  purpose: string;
  language: string | null;
  channel: string;
}
async function messages(req: APIRequestContext, purpose?: string): Promise<Msg[]> {
  const r = await req.get(`/api/messages?limit=500${purpose ? `&purpose=${purpose}` : ""}`);
  expect(r.ok()).toBeTruthy();
  return (await r.json()).messages;
}

test("early warning → help → dispatch → rescue → family notified", async ({ browser }) => {
  const ops = await browser.newContext();
  const page = await ops.newPage();
  await page.goto(`/api/demo/enter?key=${DEMO_KEY}&next=/demo`);
  await expect(page.getByRole("heading", { name: "Demo control panel" })).toBeVisible();
  const api = page.request;
  expect((await api.post("/api/demo/reset", { data: {} })).ok()).toBeTruthy();

  // Command map on a "second screen" — opened once, never reloaded.
  const cmd = await ops.newPage();
  await cmd.goto("/command");
  await expect(cmd.getByTestId("command-map")).toBeVisible();

  // 1. Risk rises to HIGH for Gadumo (via the demo control panel UI).
  await page.getByTestId("zone-select").selectOption("gadumo");
  await page.getByTestId("btn-raise").click();
  await expect(page.getByTestId("demo-result")).toContainText("gadumo low→high");

  // 2. Alerts went out automatically: SMS + voice, in each resident's language.
  const alerts = await messages(api, "alert");
  expect(alerts.length).toBeGreaterThan(10);
  const toResident = alerts.filter((m) => m.to === RESIDENT);
  expect(toResident.map((m) => m.channel).sort()).toEqual(["sms", "voice"]);
  expect(toResident.find((m) => m.channel === "sms")!.body).toContain("Carry pikin"); // Pidgin
  expect(alerts.some((m) => m.language === "en" && m.body.includes("FLOOD WARNING"))).toBeTruthy();
  // Re-sending immediately is de-duplicated.
  const again = await (await api.post("/api/demo/send-alerts", { data: { zoneId: "gadumo" } })).json();
  expect(again.summaries[0].sms).toBe(0);
  // The command map shows the zone as HIGH without a refresh.
  await cmd.getByRole("button", { name: "Risk zones" }).click();
  await expect(cmd.getByTestId("zone-gadumo")).toContainText("HIGH");
  await cmd.getByRole("button", { name: /Queue/ }).click();

  // 3. Resident sends HELP from the phone simulator (real SMS webhook).
  const sim = await ops.newPage();
  await sim.goto("/sim");
  await sim.getByTestId("sim-phone").selectOption(RESIDENT);
  await sim.getByTestId("sim-input").fill("HELP 3 people roof");
  await sim.getByTestId("sim-send").click();
  await expect(sim.getByTestId("sim-thread")).toContainText("FG-1001");
  await expect(sim.getByTestId("sim-thread")).toContainText("We don receive your help request"); // reply in Pidgin

  // 4. It appears on the command map instantly, ranked with explainable urgency.
  const row = cmd.getByTestId("req-FG-1001");
  await expect(row).toBeVisible();
  await row.click();
  const detail = cmd.getByTestId("request-detail");
  await expect(detail).toContainText("Zone risk HIGH");
  await expect(detail).toContainText("Vulnerable: elderly, child under 5");
  await expect(detail).toContainText("on roof");

  // 5. Nearest volunteer (the demo boat captain) gets the offer and accepts.
  const volCtx = await browser.newContext({ viewport: { width: 412, height: 915 } });
  const vol = await volCtx.newPage();
  await vol.goto("/volunteer");
  await vol.getByTestId("login-submit").click(); // phone is prefilled in demo mode
  await vol.getByTestId("code").fill("123456");
  await vol.getByTestId("login-submit").click();
  await expect(vol.getByTestId("offer")).toContainText("FG-1001");
  await vol.getByTestId("accept").click();
  await expect(vol.getByTestId("job")).toContainText("Mama Ngozi");
  await expect(detail).toContainText("Accepted");

  // Live position update moves the boat and flips the request to En route.
  expect((await vol.request.post("/api/volunteer/location", { data: { lngLat: [6.7595, 7.8045] } })).ok()).toBeTruthy();
  await expect(row).toContainText("En route");

  // 6. Rescued → pin turns green, family gets "is safe".
  await vol.getByTestId("arrived").click();
  await vol.getByTestId("rescued").click();
  await expect(vol.getByTestId("availability")).toBeVisible();
  await expect(cmd.getByTestId("closed-FG-1001")).toContainText("Rescued");
  await expect(cmd.getByTestId("stat-rescued")).toHaveText("1");

  const familyAll = await messages(api, "family_safe");
  const family = familyAll.filter((m) => FAMILY.includes(m.to));
  expect(family).toHaveLength(2);
  // The son also registered an email: he gets an "is safe" email (Brevo, or mock here).
  const famEmail = familyAll.find((m) => m.channel === "email");
  expect(famEmail?.to).toBe("chinedu.adefake@example.com");
  expect(famEmail?.body).toContain("Mama Ngozi Adefake");
  expect(family[0].body).toContain("Mama Ngozi Adefake");
  await expect(sim.getByTestId("sim-thread")).toContainText("RESCUED");

  await volCtx.close();
  await ops.close();
});

test("USSD help request from an unregistered basic phone", async ({ browser }) => {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.goto(`/api/demo/enter?key=${DEMO_KEY}&next=/demo`);
  await page.request.post("/api/demo/reset", { data: {} });
  await page.goto("/sim");
  await page.getByTestId("sim-phone").selectOption("+2348009990001");
  await page.getByTestId("mode-ussd").click();
  await page.getByTestId("ussd-dial").click();
  const screen = page.getByTestId("ussd-screen");
  await expect(screen).toContainText("1. I need help");
  for (const [input, expectText] of [
    ["1", "How many people"],
    ["4", "Anyone elderly"],
    ["1", "Who needs extra care"],
    ["1", "Choose your area"],
    ["3", "Nearest landmark"],
    ["1", "Send help for 4 people near Kpata Market"],
    ["1", "Help request FG-1001 received"],
  ]) {
    await page.getByTestId("ussd-input").fill(input);
    await page.getByTestId("ussd-input").press("Enter");
    await expect(screen).toContainText(expectText);
  }
  const state = await (await page.request.get("/api/state")).json();
  const req = state.requests.find((r: { ref: string }) => r.ref === "FG-1001");
  expect(req.locationSource).toBe("ussd_landmark");
  expect(req.landmark).toBe("Kpata Market");
  expect(req.registered).toBe(false);
  const labels = req.reasons.map((r: { label: string }) => r.label);
  expect(labels).toContain("Vulnerable: elderly");
  expect(labels.some((l: string) => l.startsWith("Message"))).toBe(false); // no double counting
  await ctx.close();
});

test("landing-page sign-up → confirm email → alert email → unsubscribe", async ({ browser }) => {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.goto(`/api/demo/enter?key=${DEMO_KEY}&next=/demo`);
  const api = page.request;
  await api.post("/api/demo/reset", { data: {} });

  const email = `amina.e2e.${Date.now()}@example.com`;
  await page.goto("/");
  const form = page.getByTestId("signup");
  await form.getByLabel("Name", { exact: true }).fill("Amina Testfake");
  await form.getByLabel("Email", { exact: true }).fill(email);
  await form.getByLabel("Phone", { exact: true }).fill(`0800${String(Date.now()).slice(-7)}`);
  await form.getByLabel("Area", { exact: true }).selectOption("ganaja");
  await form.getByRole("checkbox").check();
  await form.getByRole("button", { name: "Sign up" }).click();
  await expect(page.getByTestId("signup-done")).toContainText(email);

  // A confirmation email was queued; no alert emails until it is confirmed.
  const verify = (await messages(api, "email_verify")).find((m) => m.to === email);
  expect(verify?.body).toContain("Confirm my email");
  await api.post("/api/demo/raise-zone", { data: { zoneId: "ganaja", level: "medium" } });
  expect((await messages(api, "alert")).some((m) => m.to === email)).toBe(false);

  // Confirm (demo mode shows the link because the mock provider has no inbox).
  await page.getByTestId("demo-verify").click();
  await expect(page.getByTestId("email-banner")).toContainText("Email confirmed");

  // Escalation → the confirmed address gets the alert email, with an unsubscribe link.
  await api.post("/api/demo/raise-zone", { data: { zoneId: "ganaja", level: "high" } });
  const alert = (await messages(api, "alert")).find((m) => m.to === email && m.channel === "email");
  expect(alert?.body).toContain("Stop alert emails");
  const unsub = alert!.body.match(/Stop alert emails: (\S+)/)![1];
  await page.goto(unsub.replace(/^https?:\/\/[^/]+/, ""));
  await expect(page.getByTestId("email-banner")).toContainText("no longer receive alert emails");

  // Unsubscribed → a later escalation sends no email (SMS still goes out).
  const before = (await messages(api, "alert")).filter((m) => m.to === email).length;
  await api.post("/api/demo/raise-zone", { data: { zoneId: "ganaja", level: "severe" } });
  expect((await messages(api, "alert")).filter((m) => m.to === email).length).toBe(before);
  await ctx.close();
});
