// Rescue dispatch orchestration (ride-hailing style). The selection logic itself is the
// pure planOffers() in core/dispatch.ts; this file handles state, locking and messaging.
import type { Db, Sql, Tx } from "../db/client";
import { pt } from "../db/client";
import { planOffers, type DispatchCandidate, type GreedyRequest } from "../core/dispatch";
import { formatDistance } from "../core/geo";
import type { Lang, LngLat, VolunteerType } from "../core/types";
import { env } from "../env";
import { tx as tr } from "../i18n/templates";
import { isEmail } from "../messaging/email";
import { enqueue, sendNow } from "../messaging/outbox";
import { safeEmail } from "./notify";
import { publishChange } from "../realtime/server";
import { audit } from "./audit";
import { nearestShelters } from "./reference";

const LIVE = ["offered", "accepted"];

export class DispatchError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}

export async function setRequestStatus(db: Db, requestId: string, from: string | null, to: string, actor: string, details?: Record<string, unknown>) {
  await db`update help_requests set status = ${to}, updated_at = now() where id = ${requestId}`;
  await audit(db, actor, "help_request", requestId, "status", from, to, details);
}

interface OfferCreated {
  jobId: string;
  requestId: string;
  ref: string;
  volunteerId: string;
  volunteerPhone: string;
  distanceM: number;
  people: number;
  urgency: number;
}

/** Offer every unassigned request to the best free volunteer. Idempotent and lock-protected. */
export async function runDispatch(sql: Sql, actor = "system"): Promise<OfferCreated[]> {
  const offers = await sql.begin(async (tx) => {
    await tx`select pg_advisory_xact_lock(424242)`;
    const reqs = await tx<{ id: string; ref_code: string; lng: number; lat: number; inside_flood: boolean; people_count: number; urgency_score: number; vulnerable: { type: string }[]; channel: string }[]>`
      select h.id, h.ref_code, ST_X(h.location) lng, ST_Y(h.location) lat, h.inside_flood, h.people_count, h.urgency_score, h.vulnerable, h.channel
      from help_requests h
      where h.status = 'new'
        and not exists (select 1 from rescue_jobs j where j.help_request_id = h.id and j.status = any(${LIVE}))
      order by h.urgency_score desc, h.created_at`;
    if (!reqs.length) return [] as OfferCreated[];

    const vols = await tx<{ id: string; type: VolunteerType; capacity: number; lng: number; lat: number; is_available: boolean; has_live: boolean; phone: string; is_simulated: boolean }[]>`
      select v.id, v.type, v.capacity, ST_X(v.current_location) lng, ST_Y(v.current_location) lat, v.is_available, v.phone, v.is_simulated,
             exists(select 1 from rescue_jobs j where j.volunteer_id = v.id and j.status = any(${LIVE})) has_live
      from volunteers v where v.current_location is not null`;
    const excl = await tx<{ help_request_id: string; volunteer_id: string }[]>`
      select help_request_id, volunteer_id from rescue_jobs
      where help_request_id = any(${reqs.map((r) => r.id)}::uuid[])
        and (status in ('declined', 'failed') or (status in ('expired', 'cancelled') and offered_at > now() - interval '10 minutes'))`;

    const candidates: DispatchCandidate[] = vols.map((v) => ({ id: v.id, type: v.type, capacity: v.capacity, location: [v.lng, v.lat], isAvailable: v.is_available, hasLiveJob: v.has_live }));
    const greedy: GreedyRequest[] = reqs.map((r) => ({
      id: r.id,
      urgency: r.urgency_score,
      location: [r.lng, r.lat],
      insideFlood: r.inside_flood,
      peopleCount: r.people_count,
      needsMedical: (r.vulnerable ?? []).some((v) => v.type === "bedridden" || v.type === "pregnant"),
      excluded: new Set([
        ...excl.filter((e) => e.help_request_id === r.id).map((e) => e.volunteer_id),
        // Demo-injected requests go only to simulated volunteers, keeping the presenter's
        // real phone free for the live HELP from the phone simulator.
        ...(r.channel === "demo" ? vols.filter((v) => !v.is_simulated).map((v) => v.id) : []),
      ]),
    }));
    const plan = planOffers(greedy, candidates);
    const created: OfferCreated[] = [];
    for (const p of plan) {
      const r = reqs.find((x) => x.id === p.requestId)!;
      const [job] = await tx<{ id: string }[]>`
        insert into rescue_jobs (help_request_id, volunteer_id, status, distance_m, expires_at)
        values (${p.requestId}, ${p.pick.id}, 'offered', ${p.pick.distanceM}, now() + make_interval(secs => ${env.offerTtlSec}))
        returning id`;
      await audit(tx, actor, "rescue_job", job.id, "offered", null, p.pick.id, { request: p.requestId, distance_m: p.pick.distanceM, reasons: p.pick.reasons });
      created.push({ jobId: job.id, requestId: r.id, ref: r.ref_code, volunteerId: p.pick.id, volunteerPhone: vols.find((v) => v.id === p.pick.id)!.phone, distanceM: p.pick.distanceM, people: r.people_count, urgency: r.urgency_score });
    }
    return created;
  });

  if (offers.length) {
    await enqueue(
      sql,
      offers.map((o) => ({
        channel: "sms" as const,
        to: o.volunteerPhone,
        body: tr("en", "sms.job_offer", { ref: o.ref, people: o.people, distance: formatDistance(o.distanceM), urgency: o.urgency }),
        language: "en",
        purpose: "job_offer",
        refType: "rescue_job",
        refId: o.jobId,
      })),
    );
    await publishChange("jobs");
  }
  return offers;
}

/** Expire offers past their deadline, then re-dispatch. */
export async function expireOffers(sql: Sql): Promise<number> {
  const expired = await sql<{ id: string; help_request_id: string; volunteer_id: string }[]>`
    update rescue_jobs set status = 'expired' where status = 'offered' and expires_at < now()
    returning id, help_request_id, volunteer_id`;
  for (const e of expired) await audit(sql, "system", "rescue_job", e.id, "expired", "offered", "expired", { volunteer: e.volunteer_id });
  if (expired.length) await runDispatch(sql);
  return expired.length;
}

async function lockJob(tx: Tx, jobId: string, volunteerId: string | null) {
  const [job] = await tx<{ id: string; help_request_id: string; volunteer_id: string; status: string; expires_at: Date | null; arrived_at: Date | null }[]>`
    select id, help_request_id, volunteer_id, status, expires_at, arrived_at from rescue_jobs where id = ${jobId} for update`;
  if (!job) throw new DispatchError("Job not found", 404);
  if (volunteerId && job.volunteer_id !== volunteerId) throw new DispatchError("This job belongs to another volunteer", 403);
  return job;
}

async function requestContact(db: Db, requestId: string) {
  const [r] = await db<{ id: string; ref_code: string; phone: string; status: string; people_count: number; lng: number; lat: number; resident_id: string | null; name: string | null; lang: Lang | null }[]>`
    select h.id, h.ref_code, h.phone, h.status, h.people_count, ST_X(h.location) lng, ST_Y(h.location) lat, h.resident_id, r.name, r.preferred_language lang
    from help_requests h left join residents r on r.id = h.resident_id where h.id = ${requestId}`;
  return r;
}

export async function acceptOffer(sql: Sql, volunteerId: string, jobId: string, actor = `volunteer:${volunteerId}`) {
  const result = await sql.begin(async (tx) => {
    const job = await lockJob(tx, jobId, volunteerId);
    if (job.status !== "offered") throw new DispatchError(`Offer is no longer open (${job.status})`, 409);
    if (job.expires_at && job.expires_at.getTime() < Date.now()) {
      await tx`update rescue_jobs set status = 'expired' where id = ${jobId}`;
      throw new DispatchError("Offer expired", 409);
    }
    await tx`update rescue_jobs set status = 'accepted', accepted_at = now() where id = ${jobId}`;
    await audit(tx, actor, "rescue_job", jobId, "accepted", "offered", "accepted");
    const [req] = await tx<{ status: string }[]>`select status from help_requests where id = ${job.help_request_id} for update`;
    await tx`update help_requests set assigned_volunteer_id = ${volunteerId} where id = ${job.help_request_id}`;
    await setRequestStatus(tx, job.help_request_id, req.status, "assigned", actor, { job: jobId, volunteer: volunteerId });
    return job.help_request_id;
  });
  const r = await requestContact(sql, result);
  const [v] = await sql<{ type: string }[]>`select type from volunteers where id = ${volunteerId}`;
  if (r) await sendNow(sql, [{ channel: "sms", to: r.phone, body: tr(r.lang, "sms.rescuer_assigned", { ref: r.ref_code, vtype: v?.type.replace("_", " ") ?? "rescuer" }), language: r.lang, purpose: "rescuer_assigned", refType: "help_request", refId: r.id }]);
  await publishChange("jobs");
}

export async function declineOffer(sql: Sql, volunteerId: string, jobId: string, actor = `volunteer:${volunteerId}`) {
  await sql.begin(async (tx) => {
    const job = await lockJob(tx, jobId, volunteerId);
    if (job.status !== "offered") throw new DispatchError(`Offer is no longer open (${job.status})`, 409);
    await tx`update rescue_jobs set status = 'declined' where id = ${jobId}`;
    await audit(tx, actor, "rescue_job", jobId, "declined", "offered", "declined");
  });
  await runDispatch(sql);
  await publishChange("jobs");
}

/** Volunteer position update. Location is only recorded in history while on an active job. */
export async function updateVolunteerLocation(sql: Sql, volunteerId: string, p: LngLat, actor = `volunteer:${volunteerId}`) {
  await sql`update volunteers set current_location = ${pt(sql, p)}, last_seen_at = now() where id = ${volunteerId}`;
  const [job] = await sql<{ id: string; help_request_id: string; status: string }[]>`
    select j.id, j.help_request_id, h.status from rescue_jobs j join help_requests h on h.id = j.help_request_id
    where j.volunteer_id = ${volunteerId} and j.status = 'accepted' limit 1`;
  if (job) {
    await sql`insert into volunteer_positions (volunteer_id, job_id, geom) values (${volunteerId}, ${job.id}, ${pt(sql, p)})`;
    if (job.status === "assigned") await setRequestStatus(sql, job.help_request_id, "assigned", "en_route", actor);
  }
}

export async function markArrived(sql: Sql, volunteerId: string | null, jobId: string, actor = `volunteer:${volunteerId}`) {
  await sql.begin(async (tx) => {
    const job = await lockJob(tx, jobId, volunteerId);
    if (job.status !== "accepted") throw new DispatchError("Job is not active", 409);
    if (!job.arrived_at) {
      await tx`update rescue_jobs set arrived_at = now() where id = ${jobId}`;
      await audit(tx, actor, "rescue_job", jobId, "arrived");
      const [req] = await tx<{ status: string }[]>`select status from help_requests where id = ${job.help_request_id}`;
      if (req.status === "assigned") await setRequestStatus(tx, job.help_request_id, "assigned", "en_route", actor);
    }
  });
  await publishChange("jobs");
}

export async function completeJob(
  sql: Sql,
  volunteerId: string | null,
  jobId: string,
  outcome: "rescued" | "could_not_reach",
  { shelterId = null as string | null, actor = `volunteer:${volunteerId}` } = {},
) {
  const requestId = await sql.begin(async (tx) => {
    const job = await lockJob(tx, jobId, volunteerId);
    if (job.status !== "accepted") throw new DispatchError("Job is not active", 409);
    const [req] = await tx<{ status: string; people_count: number }[]>`select status, people_count from help_requests where id = ${job.help_request_id} for update`;
    if (outcome === "rescued") {
      await tx`update rescue_jobs set status = 'completed', outcome = 'rescued', completed_at = now(), arrived_at = coalesce(arrived_at, now()), shelter_id = ${shelterId} where id = ${jobId}`;
      await tx`update help_requests set rescued_at = now(), shelter_id = ${shelterId} where id = ${job.help_request_id}`;
      await setRequestStatus(tx, job.help_request_id, req.status, "rescued", actor, { job: jobId, shelter: shelterId });
      if (shelterId) await tx`update shelters set current_occupancy = current_occupancy + ${req.people_count} where id = ${shelterId}`;
    } else {
      await tx`update rescue_jobs set status = 'failed', outcome = 'could_not_reach', completed_at = now() where id = ${jobId}`;
      await tx`update help_requests set assigned_volunteer_id = null, failed_attempts = failed_attempts + 1 where id = ${job.help_request_id}`;
      await setRequestStatus(tx, job.help_request_id, req.status, "new", actor, { job: jobId, reason: "could_not_reach" });
    }
    await audit(tx, actor, "rescue_job", jobId, outcome);
    return job.help_request_id;
  });

  const r = await requestContact(sql, requestId);
  if (outcome === "rescued" && r) await notifyRescued(sql, r);
  if (outcome === "could_not_reach") {
    const { recomputeUrgency } = await import("./helpRequests");
    await recomputeUrgency(sql, [requestId]);
    await runDispatch(sql);
  }
  await publishChange("jobs", "requests");
  return requestId;
}

async function notifyRescued(sql: Sql, r: NonNullable<Awaited<ReturnType<typeof requestContact>>>) {
  const [sh] = await nearestShelters(sql, [r.lng, r.lat], { needSpace: r.people_count, limit: 1 });
  const shelterText = sh ? `${sh.name} (${formatDistance(sh.distanceM ?? 0)}, tel ${sh.phone})` : "ask your rescuer";
  const msgs: Parameters<typeof sendNow>[1] = [
    { channel: "sms", to: r.phone, body: tr(r.lang, "sms.rescued_resident", { ref: r.ref_code, shelter: shelterText }), language: r.lang, purpose: "rescued_resident", refType: "help_request", refId: r.id },
  ];
  if (r.resident_id) {
    const fam = await sql<{ phone: string; email: string | null }[]>`select phone, email from family_contacts where resident_id = ${r.resident_id}`;
    const name = r.name ?? "Your family member";
    for (const f of fam) {
      msgs.push({ channel: "sms", to: f.phone, body: tr(r.lang, "sms.family_safe_rescued", { name, ref: r.ref_code }), language: r.lang, purpose: "family_safe", refType: "help_request", refId: r.id });
      if (isEmail(f.email)) {
        const e = safeEmail(r.lang ?? "en", "rescued", { name, ref: r.ref_code });
        msgs.push({ channel: "email", to: f.email, subject: e.subject, body: e.text, html: e.html, language: r.lang, purpose: "family_safe", refType: "help_request", refId: r.id });
      }
    }
  }
  await sendNow(sql, msgs);
}

/** Operator action: move a request to a specific volunteer (as a direct offer) or back to the pool. */
export async function reassignRequest(sql: Sql, requestId: string, volunteerId: string | null, actor: string) {
  const cancelledPhones = await sql.begin(async (tx) => {
    const [req] = await tx<{ status: string; ref_code: string }[]>`select status, ref_code from help_requests where id = ${requestId} for update`;
    if (!req) throw new DispatchError("Request not found", 404);
    if (["rescued", "cancelled", "duplicate"].includes(req.status)) throw new DispatchError(`Request is ${req.status}`, 409);
    if (volunteerId) {
      const [v] = await tx<{ busy: boolean }[]>`
        select exists(select 1 from rescue_jobs where volunteer_id = ${volunteerId} and status = 'accepted') busy from volunteers where id = ${volunteerId}`;
      if (!v) throw new DispatchError("Volunteer not found", 404);
      if (v.busy) throw new DispatchError("Volunteer is already on a job", 409);
      // Withdraw any pending offer this volunteer has for another request.
      await tx`update rescue_jobs set status = 'cancelled', outcome = 'reassigned' where volunteer_id = ${volunteerId} and status = 'offered' and help_request_id <> ${requestId}`;
    }
    const cancelled = await tx<{ id: string; phone: string }[]>`
      update rescue_jobs j set status = 'cancelled', outcome = 'reassigned', completed_at = now()
      from volunteers v where v.id = j.volunteer_id and j.help_request_id = ${requestId} and j.status = any(${LIVE})
      returning j.id, v.phone`;
    for (const c of cancelled) await audit(tx, actor, "rescue_job", c.id, "cancelled", null, null, { reason: "reassigned" });
    if (req.status !== "new") {
      await tx`update help_requests set assigned_volunteer_id = null where id = ${requestId}`;
      await setRequestStatus(tx, requestId, req.status, "new", actor, { reason: "reassigned" });
    }
    if (volunteerId) {
      const [job] = await tx<{ id: string }[]>`
        insert into rescue_jobs (help_request_id, volunteer_id, status, operator_assigned, distance_m, expires_at)
        select ${requestId}, ${volunteerId}, 'offered', true,
               ST_Distance(v.current_location::geography, h.location::geography)::int, now() + make_interval(secs => ${env.offerTtlSec})
        from volunteers v, help_requests h where v.id = ${volunteerId} and h.id = ${requestId}
        returning id`;
      await audit(tx, actor, "rescue_job", job.id, "offered", null, volunteerId, { request: requestId, operator_assigned: true });
    }
    return cancelled.map((c) => ({ phone: c.phone, ref: req.ref_code }));
  });
  if (cancelledPhones.length)
    await enqueue(sql, cancelledPhones.map((c) => ({ channel: "sms" as const, to: c.phone, body: tr("en", "sms.job_cancelled", { ref: c.ref }), purpose: "job_cancelled" })));
  if (!volunteerId) await runDispatch(sql, actor);
  await publishChange("jobs", "requests");
}

/** Close a request without a rescue (resident safe, duplicate, false alarm). */
export async function closeRequest(sql: Sql, requestId: string, status: "cancelled" | "duplicate", reason: string, actor: string) {
  const cancelled = await sql.begin(async (tx) => {
    const [req] = await tx<{ status: string; ref_code: string }[]>`select status, ref_code from help_requests where id = ${requestId} for update`;
    if (!req || ["rescued", "cancelled", "duplicate"].includes(req.status)) return [];
    const jobs = await tx<{ id: string; phone: string }[]>`
      update rescue_jobs j set status = 'cancelled', outcome = 'cancelled', completed_at = now()
      from volunteers v where v.id = j.volunteer_id and j.help_request_id = ${requestId} and j.status = any(${LIVE})
      returning j.id, v.phone`;
    await tx`update help_requests set close_reason = ${reason}, assigned_volunteer_id = null where id = ${requestId}`;
    await setRequestStatus(tx, requestId, req.status, status, actor, { reason });
    return jobs.map((j) => ({ phone: j.phone, ref: req.ref_code }));
  });
  if (cancelled.length) await enqueue(sql, cancelled.map((c) => ({ channel: "sms" as const, to: c.phone, body: tr("en", "sms.job_cancelled", { ref: c.ref }), purpose: "job_cancelled" })));
  await publishChange("requests");
}
