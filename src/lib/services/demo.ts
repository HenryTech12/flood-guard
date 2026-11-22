// Demo / simulation controls behind /demo.
import type { Sql } from "../db/client";
import { getRegion } from "../../../config/regions";
import { pointInRing } from "../core/geo";
import type { LngLat, RiskLevel } from "../core/types";
import { publishChange } from "../realtime/server";
import { sendZoneAlerts, type AlertSummary } from "./alerts";
import { audit } from "./audit";
import { runDispatch } from "./dispatch";
import { createOrMergeHelpRequest } from "./helpRequests";
import { createCrowdReport } from "./reports";
import { recomputeAllZones, setZoneOverride } from "./risk";
import { runTick } from "./tick";

const MESSAGES = [
  "HELP 4 people roof",
  "help us water dey rise for house",
  "HELP 2 baby sick",
  "we dey trap for house abeg",
  "HELP 6 water reach chest",
  "help old mama no fit waka",
  "HELP 3 water rising fast",
  "SOS 5 people trapped",
  "help 2 pregnant woman",
  "HELP we are on the roof",
];

function mulberry(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export async function getDemoState(sql: Sql) {
  const [s] = await sql`select * from demo_state where id = 1`;
  return s;
}

export async function startReplay(sql: Sql, speedSimHoursPerSecond?: number) {
  const r = getRegion().replay;
  const speed = (speedSimHoursPerSecond ?? r.speedSimHoursPerSecond) * 3600;
  await sql`update demo_state set replay_running = true, replay_sim_start = ${r.start}, replay_sim_end = ${r.end}, replay_wall_start = now(),
            replay_speed = ${speed}, sim_time = ${r.start} where id = 1`;
  await audit(sql, "demo", "demo", "replay", "start", null, null, { start: r.start, end: r.end, speed });
  await runTick(sql, { force: true });
  await publishChange("demo");
}

export async function stopReplay(sql: Sql) {
  await sql`update demo_state set replay_running = false where id = 1`;
  await publishChange("demo");
}

export async function raiseZone(sql: Sql, zoneId: string, level: RiskLevel = "high") {
  await setZoneOverride(sql, zoneId, level, "demo");
  const [st] = await sql<{ sim_time: Date | null; auto_alerts: boolean }[]>`select sim_time, auto_alerts from demo_state where id = 1`;
  const changes = await recomputeAllZones(sql, { simTime: st.sim_time, autoAlerts: st.auto_alerts, actor: "demo" });
  await publishChange("zones");
  return { changes, autoAlerts: st.auto_alerts };
}

export async function clearOverrides(sql: Sql) {
  await sql`update zones set override_level = null`;
  const [st] = await sql<{ sim_time: Date | null }[]>`select sim_time from demo_state where id = 1`;
  await recomputeAllZones(sql, { simTime: st.sim_time, actor: "demo" });
}

export async function sendAlertsFor(sql: Sql, zoneId: string | "all", force: boolean): Promise<AlertSummary[]> {
  const zones = zoneId === "all" ? await sql<{ id: string }[]>`select id from zones where current_risk_level in ('medium', 'high', 'severe')` : [{ id: zoneId }];
  const out: AlertSummary[] = [];
  for (const z of zones) out.push(await sendZoneAlerts(sql, z.id, { force, actor: "demo" }));
  return out;
}

/** Inject N help requests (mostly from registered residents in the riskiest zones) + some water reports. */
export async function injectHelpRequests(sql: Sql, count = 10) {
  const region = getRegion();
  const rand = mulberry(Date.now() & 0xffff);
  const residents = await sql<{ phone: string; zone_id: string }[]>`
    select r.phone, r.zone_id from residents r join zones z on z.id = r.zone_id
    where r.phone <> ${region.demoResidentPhone}
      and not exists (select 1 from help_requests h where h.phone = r.phone and h.status in ('new', 'assigned', 'en_route'))
    order by case z.current_risk_level when 'severe' then 0 when 'high' then 1 when 'medium' then 2 else 3 end, z.base_risk_score desc, random()
    limit ${count * 2}`;
  const created: string[] = [];
  // Unregistered callers cluster around one landmark so the hotspot detector has something to find.
  const flooded = region.zones.filter((z) => z.historicallyFlooded);
  const hotZone = flooded[Math.floor(rand() * flooded.length)] ?? region.zones[0];
  const hotLm = hotZone.landmarks[Math.floor(rand() * hotZone.landmarks.length)];
  for (let i = 0; i < count; i++) {
    const msg = MESSAGES[Math.floor(rand() * MESSAGES.length)];
    // First half of the batch: unregistered callers clustered at one landmark (→ hotspot).
    const clustered = i < Math.ceil(count / 2);
    if (!clustered && residents.length) {
      const r = residents.splice(Math.floor(rand() * Math.min(residents.length, count)), 1)[0];
      const res = await createOrMergeHelpRequest(sql, { phone: r.phone, channel: "demo", message: msg, peopleCount: null, skipDispatch: true, actor: "demo" });
      created.push(res.ref);
    } else {
      // Unregistered caller who named a landmark.
      const zone = hotZone;
      const lm = hotLm;
      const jitter: LngLat = [lm.location[0] + (rand() - 0.5) * 0.003, lm.location[1] + (rand() - 0.5) * 0.003];
      const phone = `+234800900${String(Math.floor(rand() * 10000)).padStart(4, "0")}`;
      const res = await createOrMergeHelpRequest(sql, {
        phone,
        channel: "demo",
        message: `${msg} near ${lm.name}`,
        peopleCount: null,
        location: { lngLat: pointInRing(jitter, zone.polygon) ? jitter : lm.location, source: "ussd_landmark", landmarkId: lm.id, zoneId: zone.id },
        skipDispatch: true,
        actor: "demo",
      });
      created.push(res.ref);
    }
  }
  // A few water reports so the risk engine sees ground truth.
  const reportZones = await sql<{ id: string; lng: number; lat: number }[]>`
    select z.id, ST_X(l.geom) lng, ST_Y(l.geom) lat from zones z join landmarks l on l.zone_id = z.id
    where z.historically_flooded order by random() limit ${Math.max(2, Math.round(count / 3))}`;
  for (const z of reportZones) {
    await createCrowdReport(sql, { phone: null, location: [z.lng, z.lat], locationSource: "ussd_landmark", zoneId: z.id, type: "water_level", depthCm: [50, 100, 130][Math.floor(rand() * 3)], description: "Demo water report", channel: "demo" });
  }
  await audit(sql, "demo", "demo", "inject", "inject", null, null, { count, refs: created });
  await runDispatch(sql, "demo");
  await publishChange("requests");
  return created;
}

export async function setDemoFlags(sql: Sql, flags: { autopilot?: boolean; moveVolunteers?: boolean; autoAlerts?: boolean }) {
  if (flags.autopilot !== undefined) await sql`update demo_state set autopilot = ${flags.autopilot} where id = 1`;
  if (flags.moveVolunteers !== undefined) await sql`update demo_state set move_volunteers = ${flags.moveVolunteers} where id = 1`;
  if (flags.autoAlerts !== undefined) await sql`update demo_state set auto_alerts = ${flags.autoAlerts} where id = 1`;
  await publishChange("demo");
}

/** Back to the freshly-seeded world without re-running the seeder (no file access needed). */
export async function resetDemo(sql: Sql) {
  await sql.begin(async (tx) => {
    await tx.unsafe(`
      truncate table volunteer_positions, rescue_jobs, help_requests, crowd_reports, checkins, alerts, alert_deliveries,
        outbound_messages, inbound_messages, zone_risk_snapshots, audit_log, otp_codes restart identity cascade;
      alter sequence help_ref_seq restart with 1001;
      delete from residents where not is_seed;
      update residents set alerts_opt_out = false where is_seed;
      update volunteers set current_location = home_location, is_available = true, sim_move = false, last_seen_at = now();
      update shelters set current_occupancy = initial_occupancy;
      update zones set current_risk_level = 'low', current_risk_score = 0, risk_reasons = '[]', rain_24h_mm = 0, rain_72h_mm = 0,
        override_level = null, updated_at = now();
      update demo_state set replay_running = false, replay_sim_start = null, replay_sim_end = null, replay_wall_start = null,
        sim_time = null, autopilot = false, move_volunteers = false, auto_alerts = true, last_tick_at = 'epoch',
        last_move_at = null, demo_started_at = now();
    `);
    await tx`insert into audit_log (actor, entity, entity_id, action) values ('demo', 'demo', 'reset', 'reset')`;
  });
  await recomputeAllZones(sql, { simTime: null, actor: "demo" });
  await publishChange("reset");
}
