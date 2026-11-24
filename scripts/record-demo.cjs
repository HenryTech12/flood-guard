// Records the FloodGuard demo video: command map + phone simulator + volunteer app on one stage.
//   BASE_URL=http://localhost:3000 node scripts/record-demo.cjs [outDir]
// Needs a running app in demo mode (production build recommended: npm run build && npm start).
// Writes a .webm into outDir; convert with:
//   ffmpeg -i outDir/*.webm -c:v libx264 -crf 22 -pix_fmt yuv420p -movflags +faststart demo.mp4
// WARNING: resets the demo data.
const { chromium } = require('playwright');
const B = process.env.BASE_URL || 'http://localhost:3000';
const KEY = process.env.DEMO_KEY || 'floodguard-demo';
const OUT = process.argv[2] || 'demo-video';

const STAGE = `<!doctype html><html><head><meta charset="utf-8"><title>FloodGuard demo</title><style>
  html,body{margin:0;background:#020617;color:#e2e8f0;font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;overflow:hidden}
  #cap{height:90px;display:flex;align-items:center;gap:18px;padding:0 28px;border-bottom:1px solid #1e293b;background:#0b1220}
  #step{background:#f59e0b;color:#0b1220;font-weight:900;font-size:26px;border-radius:12px;padding:6px 14px;min-width:24px;text-align:center}
  #txt{font-size:30px;font-weight:800;letter-spacing:-.01em}
  #sub{font-size:19px;color:#94a3b8;margin-top:2px;font-weight:500}
  .row{display:flex;height:990px}
  .box{position:relative;overflow:hidden;border-right:1px solid #1e293b}
  .box iframe{border:0;transform:scale(.8);transform-origin:0 0;background:#020617}
  .lbl{position:absolute;left:8px;bottom:8px;z-index:2;background:#0f172acc;border:1px solid #334155;border-radius:8px;padding:3px 9px;font-size:13px;font-weight:700;color:#94a3b8}
  #title{position:fixed;inset:0;z-index:9;pointer-events:none;display:grid;place-items:center;background:radial-gradient(circle at 50% 40%,#0c2a4a,#020617 70%);transition:opacity .8s}
  #title.h{opacity:0;pointer-events:none}
</style></head><body>
<div id="title"><div style="text-align:center">
  <div style="font-size:96px;font-weight:900;letter-spacing:-.03em">🛡️ FloodGuard</div>
  <div style="font-size:36px;color:#7dd3fc;margin-top:8px;font-weight:700">From early warning to rescue</div>
  <div style="font-size:24px;color:#94a3b8;margin-top:18px">Live in Lagos first · expanding across Nigeria · demo with fictional people</div>
</div></div>
<div id="cap"><div id="step">▶</div><div><div id="txt">FloodGuard</div><div id="sub"></div></div></div>
<div class="row">
  <div class="box" style="width:1280px"><iframe id="cmd" src="/command" style="width:1600px;height:1238px"></iframe><div class="lbl">Command map · SEMA operator (projector)</div></div>
  <div class="box" style="width:304px"><iframe id="sim" src="/sim" style="width:380px;height:1238px"></iframe><div class="lbl">Resident · basic phone</div></div>
  <div class="box" style="width:336px;border-right:0"><iframe id="vol" src="/volunteer" style="width:420px;height:1238px"></iframe><div class="lbl">Volunteer boat · phone</div></div>
</div>
<script>setInterval(()=>fetch('/api/tick',{method:'POST',headers:{'x-floodguard-page':'1'}}).catch(()=>{}),1000)</script>
</body></html>`;

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 }, recordVideo: { dir: OUT, size: { width: 1920, height: 1080 } } });
  const page = await ctx.newPage();
  const api = page.request;
  const wait = (ms) => page.waitForTimeout(ms);
  const cap = (step, txt, sub = '') => page.evaluate(([s, t, u]) => { document.getElementById('step').textContent = s; document.getElementById('txt').textContent = t; document.getElementById('sub').textContent = u; }, [step, txt, sub]);

  // Prepare: demo access + clean world.
  await page.goto(`${B}/api/demo/enter?key=${KEY}&next=/privacy`);
  await api.post(`${B}/api/demo/reset`, { data: {} });
  await api.post(`${B}/api/demo/flags`, { data: { autoAlerts: true } });
  await page.route(`${B}/__stage`, (r) => r.fulfill({ contentType: 'text/html', body: STAGE }));
  await page.goto(`${B}/__stage`);
  const cmd = page.frameLocator('#cmd');
  const sim = page.frameLocator('#sim');
  const vol = page.frameLocator('#vol');

  // Volunteer logs in (behind the title card), once the iframes have hydrated.
  await page.waitForLoadState('networkidle').catch(() => {});
  await wait(3000);
  await vol.getByTestId('login-submit').click();
  await vol.getByTestId('code').fill('123456');
  await vol.getByTestId('login-submit').click();
  await vol.getByTestId('availability').waitFor();
  await cmd.getByTestId('command-map').waitFor({ state: 'attached' });
  await wait(3500);
  await page.evaluate(() => document.getElementById('title').classList.add('h'));
  await cap('▶', 'Three screens, one live system', 'SEMA command map · a resident’s basic phone · a volunteer boat owner’s phone');
  await wait(4000);

  // 1. Sense.
  await cap('1', 'Sense: satellite rainfall builds over Lagos', 'Rainfall replay (synthetic IMERG-format data) · risk engine scores every zone');
  await api.post(`${B}/api/demo/start-replay`, { data: { speed: 10 } });
  await cmd.getByRole('button', { name: 'Risk zones' }).click();
  await wait(9000);
  await cap('1', 'Risk rises to HIGH — and the dashboard says why', 'Rain mm/24h + historically flooded + low-lying terrain');
  await wait(5000);

  // 2. Warn.
  await cap('2', 'Warn: every resident alerted in their own language', 'SMS + voice call · Pidgin for Mama Ngozi · de-duplicated so nobody is spammed');
  await cmd.getByRole('button', { name: 'Alerts' }).click();
  await wait(6000);

  // 3. Ask for help.
  await cap('3', 'Ask for help from any phone: “HELP 3 people roof”', 'Works by SMS or USSD menu — no internet, no app, unregistered numbers welcome');
  await cmd.getByRole('button', { name: /Queue/ }).click();
  const input = sim.getByTestId('sim-input');
  await input.click();
  await input.pressSequentially('HELP 3 people roof', { delay: 110 });
  await wait(500);
  await sim.getByTestId('sim-send').click();
  await sim.getByTestId('sim-thread').getByText('FG-1001').first().waitFor();
  await wait(2500);

  // 4. Command map.
  await cap('4', 'Instantly on the command map, ranked by urgency', 'Zone HIGH +30 · elderly + child under 5 +20 · on roof +10 — every point explained');
  await cmd.getByTestId('req-FG-1001').click();
  await wait(6000);

  // 5. Dispatch.
  await cap('5', 'Nearest boat gets the job — like ride-hailing', 'Offer expires in 2 min and moves to the next volunteer if not accepted');
  await vol.getByTestId('offer').waitFor();
  await wait(3000);
  await vol.getByTestId('accept').click();
  await vol.getByTestId('job').waitFor();
  await wait(1500);
  await cap('5', 'Boat on the way — live position on the map', 'Location shared only while on a job');
  await vol.getByText('Demo: simulate my travel').click();
  await wait(10000);

  // 6. Rescue.
  await cap('6', 'Rescued → pin turns green, family gets “she is safe”', 'Shelter occupancy updates · resident and both family contacts get an SMS');
  await vol.getByTestId('arrived').click();
  await wait(1500);
  await vol.getByTestId('rescued').click();
  await wait(7000);

  // Scale.
  await cap('⚡', 'At scale: 10 more requests, autopilot volunteers', 'Hotspot detection · simulated responders accept, travel and rescue');
  await cmd.getByTestId('request-detail').getByRole('button', { name: '✕' }).click();
  await page.mouse.move(640, 560);
  for (let i = 0; i < 6; i++) { await page.mouse.wheel(0, -0); await page.mouse.wheel(0, 260); await wait(250); }
  await api.post(`${B}/api/demo/inject`, { data: { count: 10 } });
  await api.post(`${B}/api/demo/flags`, { data: { autopilot: true } });
  await wait(16000);

  await cap('✓', 'FloodGuard: sense · warn · respond', 'SMS / USSD / voice in 5 languages · god’s-eye map · ride-hailing rescue dispatch');
  await wait(5000);

  await ctx.close();
  const v = await page.video().path();
  console.log(v);
  await browser.close();
})();
