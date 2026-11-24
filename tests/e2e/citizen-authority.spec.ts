// Guardy citizen portal → authority dashboard: a web emergency report with a voice note
// reaches the authority dashboard live, nearby centres are notified, and it can be resolved.
import { expect, test } from "@playwright/test";

const DEMO_KEY = process.env.DEMO_KEY ?? "floodguard-demo";

test.use({
  launchOptions: {
    ...(process.env.PW_CHROMIUM_PATH ? { executablePath: process.env.PW_CHROMIUM_PATH } : {}),
    args: ["--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream"],
  },
});

test("landing page offers citizen and authority access", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("role-citizen")).toHaveAttribute("href", "/citizen");
  await expect(page.getByTestId("role-authority")).toHaveAttribute("href", "/authority");
  // Authority dashboard is operator-only.
  await page.goto("/authority");
  await expect(page).toHaveURL(/\/login\?next=%2Fauthority|\/login\?next=\/authority/);
});

test("citizen web report with voice → authority dashboard → resolved", async ({ browser }) => {
  const op = await browser.newContext();
  const opPage = await op.newPage();
  await opPage.goto(`/api/demo/enter?key=${DEMO_KEY}&next=/demo`);
  expect((await opPage.request.post("/api/demo/reset", { data: {} })).ok()).toBeTruthy();

  // Citizen in Makoko, Lagos with location + microphone allowed.
  const citizen = await browser.newContext({ geolocation: { latitude: 6.4945, longitude: 3.3925 }, permissions: ["geolocation", "microphone"] });
  const page = await citizen.newPage();
  await page.goto("/citizen");
  await expect(page.getByTestId("risk-monitor")).toBeVisible();
  await expect(page.getByTestId("weather-monitor")).toBeVisible();
  await expect(page.getByTestId("er-location")).toContainText("Location Detected");

  await page.locator("#er-name").fill("Adaeze Okafor");
  await page.locator("#er-phone").fill("08031234567");
  await page.locator("#er-people").fill("4");
  await page.locator("#er-type").selectOption({ index: 1 });
  const need = await page.locator("#er-type").inputValue();
  await page.locator("#er-comments").fill("Water up to the windows, two children with us");
  await page.getByTestId("record").click();
  await page.waitForTimeout(2500);
  await page.getByTestId("record").click();
  await expect(page.getByTestId("recording-saved")).toBeVisible();
  await page.getByTestId("er-submit").click();
  const success = page.getByTestId("report-success");
  await expect(success).toContainText("submitted");
  const ref = (await success.textContent())!.match(/FG-\d+/)![0];

  // Authority sees it live with the voice note, and resolves it.
  await opPage.goto("/authority");
  const card = opPage.getByTestId(`report-${ref}`);
  await expect(card).toBeVisible();
  await expect(card).toContainText("Adaeze Okafor");
  await expect(card).toContainText(need);
  await expect(card.getByTestId("voice").locator("audio")).toHaveAttribute("src", /\/api\/voice\//);
  const src = await card.getByTestId("voice").locator("audio").getAttribute("src");
  const audio = await opPage.request.get(src!);
  expect(audio.ok()).toBeTruthy();
  expect(audio.headers()["content-type"]).toMatch(/^audio\//);
  // The citizen cannot fetch the voice note.
  expect((await page.request.get(src!)).status()).toBeGreaterThanOrEqual(401);

  // Nearby centres were notified by SMS.
  const msgs = (await (await opPage.request.get("/api/messages?limit=500")).json()).messages as { body: string; purpose: string }[];
  expect(msgs.some((m) => m.purpose === "centre_notify" && m.body.includes(ref))).toBeTruthy();

  await card.getByRole("button", { name: "Mark as Resolved" }).click();
  await expect(card).toContainText("Resolved");
  await expect(opPage.getByTestId("stat-resolved")).toHaveText(/[1-9]/);

  // Flood data upload alerts people nearby and shows on the citizen portal.
  await opPage.getByRole("button", { name: "Upload Data" }).click();
  await opPage.locator("#flood-json").fill(JSON.stringify({ location: "Makoko waterfront", latitude: 6.494, longitude: 3.392, severity: "high", rainfall: 64, description: "Lagoon overflow" }));
  await opPage.getByRole("button", { name: "Submit" }).click();
  await expect(opPage.getByText(/Recorded 1 flood event/)).toBeVisible();
  await page.reload();
  await expect(page.getByTestId("alert-panel")).toContainText("Makoko waterfront");

  await citizen.close();
  await op.close();
});
