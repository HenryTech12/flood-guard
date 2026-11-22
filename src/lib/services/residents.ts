// Residents: "I'm safe" check-ins, the vulnerable-people register and data deletion.
import type { Sql } from "../db/client";
import { pt } from "../db/client";
import type { Lang, LngLat, VulnerableType } from "../core/types";
import { tx as tr } from "../i18n/templates";
import { isEmail } from "../messaging/email";
import { sendNow, type OutboundMessage } from "../messaging/outbox";
import { safeEmail } from "./notify";
import { publishChange } from "../realtime/server";
import { audit } from "./audit";
import { closeRequest } from "./dispatch";
import { getResidentByPhone, zoneForPoint } from "./reference";

export async function recordCheckin(sql: Sql, phone: string, channel: string): Promise<{ closedRef: string | null; lang: Lang; familyNotified: number }> {
  const resident = await getResidentByPhone(sql, phone);
  await sql`insert into checkins (resident_id, phone, status, channel) values (${resident?.id ?? null}, ${phone}, 'safe', ${channel})`;
  await audit(sql, `resident:${phone}`, "checkin", resident?.id ?? phone, "safe");

  // A resident who says SAFE no longer needs their open request.
  const open = await sql<{ id: string; ref_code: string }[]>`
    select id, ref_code from help_requests where phone = ${phone} and status in ('new', 'assigned', 'en_route') order by created_at desc`;
  for (const o of open) await closeRequest(sql, o.id, "cancelled", "Resident checked in SAFE", `resident:${phone}`);

  const lang = resident?.lang ?? "en";
  const msgs: OutboundMessage[] = [];
  if (resident) {
    const time = new Date().toLocaleTimeString("en-NG", { hour: "2-digit", minute: "2-digit", timeZone: "Africa/Lagos" });
    const name = resident.name ?? "Your family member";
    for (const f of resident.family) {
      msgs.push({ channel: "sms", to: f.phone, body: tr(lang, "sms.family_safe_checkin", { name, time }), language: lang, purpose: "family_safe", refType: "resident", refId: resident.id });
      if (isEmail(f.email)) {
        const e = safeEmail(lang, "checkin", { name, time });
        msgs.push({ channel: "email", to: f.email, subject: e.subject, body: e.text, html: e.html, language: lang, purpose: "family_safe", refType: "resident", refId: resident.id });
      }
    }
  }
  if (msgs.length) await sendNow(sql, msgs);
  await publishChange("checkins");
  return { closedRef: open[0]?.ref_code ?? null, lang, familyNotified: resident?.family.length ?? 0 };
}

export interface RegisterInput {
  phone: string;
  name: string;
  email?: string | null;
  lang: Lang;
  zoneId?: string | null;
  home?: LngLat | null;
  consent: boolean;
  registeredBy?: string | null;
  vulnerable?: { type: VulnerableType; count: number; notes?: string | null }[];
  family?: { phone: string; name?: string | null; email?: string | null }[];
  /** replace = web form (full household); append = USSD (adds one member/contact) */
  mode?: "replace" | "append";
}

export async function registerResident(sql: Sql, input: RegisterInput): Promise<{ id: string; zoneId: string | null; created: boolean }> {
  if (!input.consent) throw new Error("Consent is required to register");
  const zoneId = input.zoneId ?? (input.home ? await zoneForPoint(sql, input.home) : null);
  const res = await sql.begin(async (tx) => {
    const [existing] = await tx<{ id: string }[]>`select id from residents where phone = ${input.phone}`;
    const [row] = await tx<{ id: string }[]>`
      insert into residents (phone, name, email, preferred_language, home, zone_id, consent_location, consent_at, registered_by)
      values (${input.phone}, ${input.name}, ${input.email || null}, ${input.lang}, ${pt(tx, input.home ?? null)}, ${zoneId}, ${!!input.home}, now(), ${input.registeredBy ?? "self"})
      on conflict (phone) do update set name = excluded.name, preferred_language = excluded.preferred_language,
        email = coalesce(excluded.email, residents.email),
        home = coalesce(excluded.home, residents.home), zone_id = coalesce(excluded.zone_id, residents.zone_id),
        consent_location = residents.consent_location or excluded.consent_location, consent_at = now(),
        registered_by = excluded.registered_by, alerts_opt_out = false
      returning id`;
    if (input.mode !== "append") {
      await tx`delete from vulnerable_members where resident_id = ${row.id}`;
      await tx`delete from family_contacts where resident_id = ${row.id}`;
    }
    for (const v of input.vulnerable ?? []) await tx`insert into vulnerable_members (resident_id, type, count, notes) values (${row.id}, ${v.type}, ${Math.max(1, v.count)}, ${v.notes ?? null})`;
    for (const f of input.family ?? []) {
      const [dup] = await tx`select 1 from family_contacts where resident_id = ${row.id} and phone = ${f.phone}`;
      if (!dup) await tx`insert into family_contacts (resident_id, phone, name, email) values (${row.id}, ${f.phone}, ${f.name ?? null}, ${f.email || null})`;
    }
    await audit(tx, input.registeredBy ? `registrar:${input.registeredBy}` : `resident:${input.phone}`, "resident", row.id, existing ? "updated" : "registered", null, null, {
      vulnerable: (input.vulnerable ?? []).length,
      family: (input.family ?? []).length,
      consent: true,
    });
    return { id: row.id, created: !existing };
  });
  await publishChange("residents");
  return { ...res, zoneId };
}

/** NDPA right to erasure. Help requests keep the phone (operational record) but lose the link. */
export async function deleteResidentData(sql: Sql, phone: string): Promise<boolean> {
  const [r] = await sql<{ id: string }[]>`delete from residents where phone = ${phone} returning id`;
  if (r) await audit(sql, `resident:${phone}`, "resident", r.id, "deleted_on_request");
  await publishChange("residents");
  return !!r;
}

export async function setAlertsOptOut(sql: Sql, phone: string, optOut: boolean) {
  const [r] = await sql<{ id: string }[]>`update residents set alerts_opt_out = ${optOut} where phone = ${phone} returning id`;
  if (r) await audit(sql, `resident:${phone}`, "resident", r.id, optOut ? "alerts_opt_out" : "alerts_opt_in");
  return !!r;
}

export async function setLanguage(sql: Sql, phone: string, lang: Lang) {
  const [r] = await sql<{ id: string }[]>`update residents set preferred_language = ${lang} where phone = ${phone} returning id`;
  return !!r;
}
