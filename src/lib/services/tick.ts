// The heartbeat. Serverless has no long-running workers, so everything time-based
// (rainfall replay, risk, offer expiry, waiting-time urgency, simulated volunteers,
// message retries) happens in an idempotent, throttled tick that can be called by:
//   • the /command and /demo pages while open (every few seconds)
//   • Supabase pg_cron / any external scheduler (every minute) → POST /api/tick
//   • lazily by webhooks
import type { Sql } from "../db/client";
import { haversineM, moveToward } from "../core/geo";
import type { LngLat, VolunteerType } from "../core/types";
import { env } from "../env";
import { processOutbox } from "../messaging/outbox";
import { publishChange } from "../realtime/server";
import { acceptOffer, completeJob, expireOffers, markArrived, runDispatch, updateVolunteerLocation } from "./dispatch";
import { recomputeUrgency } from "./helpRequests";
import { nearestShelters } from "./reference";
import { recomputeAllZones } from "./risk";

export interface DemoStateRow {
  replay_running: boolean;
  replay_sim_start: Date | null;
  replay_sim_end: Date | null;
  replay_wall_start: Date | null;
  replay_speed: number;
  sim_time: Date | null;
  autopilot: boolean;
  move_volunteers: boolean;
  auto_alerts: boolean;
  last_tick_at: Date;
  last_move_at: Date | null;
  demo_started_at: Date;
}

const SPEED_FACTOR: Record<VolunteerType, number> = { boat: 1, vehicle: 1.3, medical: 1.2, on_foot: 0.45 };

export async function runTick(sql: Sql, { force = false }: { force?: boolean } = {}) {
  const [st] = await sql<DemoStateRow[]>`
    update demo_state set last_tick_at = now()
    where id = 1 and (${force}::boolean or last_tick_at < now() - interval '800 milliseconds')
    returning *`;
  if (!st) return { skipped: true as const };

  const now = Date.now();
  // 1. Rainfall replay clock.
  let simTime = st.sim_time;
  if (st.replay_running && st.replay_sim_start && st.replay_wall_start) {
    const elapsedSec = (now - st.replay_wall_start.getTime()) / 1000;
    let t = st.replay_sim_start.getTime() + elapsedSec * st.replay_speed * 1000;
    let running = true;
    if (st.replay_sim_end && t >= st.replay_sim_end.getTime()) {
      t = st.replay_sim_end.getTime();
      running = false;
    }
    simTime = new Date(t);
    await sql`update demo_state set sim_time = ${simTime}, replay_running = ${running} where id = 1`;
    await publishChange("demo");
  }

  // 2. Risk.
  const riskChanges = await recomputeAllZones(sql, { simTime, autoAlerts: st.auto_alerts });
  // 3. Offers.
  const expired = await expireOffers(sql);
  // 4. Simulated volunteers.
  const moved = await simulateVolunteers(sql, st);
  // 5. Urgency grows with waiting time.
  const urgencyChanged = await recomputeUrgency(sql);
  // 6. Anyone still waiting? (a volunteer may have become free)
  const offers = await runDispatch(sql);
  // 7. Drain the outbox (retries/backoff).
  const outbox = await processOutbox(sql, { limit: 100 });

  if (urgencyChanged || moved || outbox.sent) await publishChange("tick");
  return { skipped: false as const, simTime, riskChanges: riskChanges.length, expired, moved, urgencyChanged, offers: offers.length, outbox };
}

async function simulateVolunteers(sql: Sql, st: DemoStateRow): Promise<number> {
  const now = new Date();
  const dt = Math.min(5, Math.max(0, st.last_move_at ? (now.getTime() - st.last_move_at.getTime()) / 1000 : 1));
  await sql`update demo_state set last_move_at = ${now} where id = 1`;
  let changed = 0;

  // Autopilot: simulated volunteers accept offers after a few seconds.
  if (st.autopilot) {
    const offers = await sql<{ id: string; volunteer_id: string }[]>`
      select j.id, j.volunteer_id from rescue_jobs j join volunteers v on v.id = j.volunteer_id
      where j.status = 'offered' and v.is_simulated and j.offered_at < now() - make_interval(secs => ${env.autopilotAcceptSec})`;
    for (const o of offers) {
      try {
        await acceptOffer(sql, o.volunteer_id, o.id, "autopilot");
        changed++;
      } catch {
        /* raced with expiry — fine */
      }
    }
  }

  // Movement towards the job.
  const jobs = await sql<{ job_id: string; volunteer_id: string; type: VolunteerType; simulated: boolean; sim_move: boolean; vlng: number; vlat: number; rlng: number; rlat: number; arrived_at: Date | null; people: number }[]>`
    select j.id job_id, v.id volunteer_id, v.type, v.is_simulated simulated, v.sim_move, ST_X(v.current_location) vlng, ST_Y(v.current_location) vlat,
           ST_X(h.location) rlng, ST_Y(h.location) rlat, j.arrived_at, h.people_count people
    from rescue_jobs j join volunteers v on v.id = j.volunteer_id join help_requests h on h.id = j.help_request_id
    where j.status = 'accepted'`;
  for (const j of jobs) {
    const drives = (j.simulated && (st.autopilot || st.move_volunteers)) || j.sim_move;
    if (!drives) continue;
    const from: LngLat = [j.vlng, j.vlat];
    const to: LngLat = [j.rlng, j.rlat];
    const d = haversineM(from, to);
    if (d > 5 && dt > 0) {
      const next = moveToward(from, to, env.moveSpeedMps * SPEED_FACTOR[j.type] * dt);
      await updateVolunteerLocation(sql, j.volunteer_id, next, j.simulated ? "autopilot" : `volunteer:${j.volunteer_id}`);
      changed++;
    }
    const remaining = haversineM(d > 5 ? moveToward(from, to, env.moveSpeedMps * SPEED_FACTOR[j.type] * dt) : to, to);
    if (j.simulated && st.autopilot) {
      if (remaining < 25 && !j.arrived_at) {
        await markArrived(sql, j.volunteer_id, j.job_id, "autopilot");
        changed++;
      } else if (j.arrived_at && now.getTime() - j.arrived_at.getTime() > 4000) {
        const [sh] = await nearestShelters(sql, to, { needSpace: j.people, limit: 1 });
        await completeJob(sql, j.volunteer_id, j.job_id, "rescued", { shelterId: sh?.id ?? null, actor: "autopilot" });
        changed++;
      }
    }
  }
  return changed;
}
