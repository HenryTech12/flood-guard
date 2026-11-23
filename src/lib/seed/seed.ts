// Seeds a region with static reference data + realistic FAKE people. Deterministic
// (fixed PRNG seed) so every reset produces the same demo world.
import fs from "node:fs";
import path from "node:path";
import bcrypt from "bcryptjs";
import type { Sql } from "../db/client";
import type { RegionConfig } from "../../../config/regions/types";
import { pointInRing, ringCentroid } from "../core/geo";
import type { Lang, LngLat, VulnerableType } from "../core/types";

const FIRST = [
  "Amina", "Aisha", "Fatima", "Hauwa", "Zainab", "Halima", "Maryam", "Ngozi", "Chioma", "Adaeze", "Ifeoma", "Nkechi",
  "Funke", "Bisi", "Yetunde", "Kemi", "Grace", "Blessing", "Esther", "Ruth", "Musa", "Ibrahim", "Sani", "Yakubu",
  "Abdullahi", "Usman", "Emeka", "Chinedu", "Obinna", "Ikenna", "Tunde", "Segun", "Kunle", "Femi", "John", "Peter",
  "Daniel", "Samuel", "Joseph", "Ojo", "Ayo", "Ali", "Salisu", "Idris", "Bala", "Ene", "Ojone", "Ladi", "Onyeche", "Ajayi",
];
// Deliberately invented surnames so nobody mistakes seed data for real people.
const SURNAMES = [
  "Adefake", "Okonfake", "Bellotest", "Ibrahdemo", "Nwasample", "Ojofake", "Mohammedemo", "Etusample", "Abufake", "Danjumock",
  "Okafake", "Yusufdemo", "Ogunmock", "Salamifake", "Attahtest", "Igwedemo", "Onojafake", "Ameh-Sample", "Idakwomock", "Ekelefake",
];
const LANG_WEIGHTS: [Lang, number][] = [["en", 0.3], ["pcm", 0.3], ["ha", 0.15], ["yo", 0.15], ["ig", 0.1]];
const VULN_WEIGHTS: [VulnerableType, number][] = [["elderly", 0.3], ["child_under5", 0.3], ["pregnant", 0.12], ["disabled", 0.12], ["bedridden", 0.1], ["other", 0.06]];

function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function weighted<T>(rand: () => number, items: [T, number][]): T {
  const total = items.reduce((s, [, w]) => s + w, 0);
  let r = rand() * total;
  for (const [it, w] of items) if ((r -= w) <= 0) return it;
  return items[items.length - 1][0];
}

function randomPointIn(rand: () => number, ring: LngLat[]): LngLat {
  const xs = ring.map((p) => p[0]);
  const ys = ring.map((p) => p[1]);
  for (let k = 0; k < 500; k++) {
    const p: LngLat = [Math.min(...xs) + rand() * (Math.max(...xs) - Math.min(...xs)), Math.min(...ys) + rand() * (Math.max(...ys) - Math.min(...ys))];
    if (pointInRing(p, ring)) return [Math.round(p[0] * 1e6) / 1e6, Math.round(p[1] * 1e6) / 1e6];
  }
  return ringCentroid(ring);
}

const wkt = (ring: LngLat[]) => `POLYGON((${[...ring, ring[0]].map((p) => `${p[0]} ${p[1]}`).join(",")}))`;

export interface SeedOptions {
  dataDir?: string;
  residents?: number;
  operatorPassword?: string;
  log?: (msg: string) => void;
}

export async function seedDatabase(sql: Sql, region: RegionConfig, opts: SeedOptions = {}) {
  const log = opts.log ?? console.log;
  const dataDir = opts.dataDir ?? path.join(process.cwd(), "public", "data");
  const rand = mulberry32(20221010);
  const readJson = (name: string) => {
    // Files are bundled explicitly via outputFileTracingIncludes (next.config.ts).
    const p = path.join(/*turbopackIgnore: true*/ dataDir, name);
    return fs.existsSync(/*turbopackIgnore: true*/ p) ? JSON.parse(fs.readFileSync(/*turbopackIgnore: true*/ p, "utf8")) : null;
  };

  const baseRiskFile = readJson(region.data.baseRisk);
  const flood = readJson(region.data.floodExtent);
  const rain = readJson(region.data.rainfall);

  await sql.begin(async (tx) => {
    await tx.unsafe(`
      truncate table audit_log, outbound_messages, inbound_messages, alert_deliveries, alerts, checkins, crowd_reports,
        volunteer_positions, rescue_jobs, help_requests, shelters, volunteers, family_contacts, vulnerable_members,
        residents, zone_risk_snapshots, rainfall_readings, flood_extents, landmarks, zones, otp_codes, app_users
      restart identity cascade;
      alter sequence help_ref_seq restart with 1001;
      update demo_state set replay_running=false, sim_time=null, replay_sim_start=null, replay_sim_end=null,
        replay_wall_start=null, autopilot=false, move_volunteers=false, auto_alerts=true, last_tick_at='epoch', last_move_at=null, demo_started_at=now();
    `);

    // Zones + landmarks
    for (const z of region.zones) {
      const fromFile = baseRiskFile?.zones?.[z.id]?.base_risk_score;
      const base = typeof fromFile === "number" ? fromFile : z.baseRisk;
      const c = ringCentroid(z.polygon);
      await tx`
        insert into zones (id, region_id, name, short_name, lga, geom, centroid, base_risk_score, historically_flooded)
        values (${z.id}, ${region.id}, ${z.name}, ${z.shortName}, ${z.lga}, ST_GeomFromText(${wkt(z.polygon)}, 4326),
                ST_SetSRID(ST_MakePoint(${c[0]}, ${c[1]}), 4326), ${base}, ${z.historicallyFlooded})`;
      for (const l of z.landmarks) {
        await tx`insert into landmarks (id, zone_id, name, geom) values (${l.id}, ${z.id}, ${l.name}, ST_SetSRID(ST_MakePoint(${l.location[0]}, ${l.location[1]}), 4326))`;
      }
    }

    // Flood extent
    if (flood?.features?.length) {
      for (const [i, f] of flood.features.entries()) {
        await tx`
          insert into flood_extents (id, label, source, synthetic, observed_at, geom)
          values (${f.properties?.id ?? `extent-${i}`}, ${f.properties?.label ?? "Flood extent"}, ${flood.source ?? "unknown"}, ${!!flood.synthetic},
                  ${flood.observed_at ?? "2022-10-10T00:00:00Z"}, ST_Multi(ST_SetSRID(ST_GeomFromGeoJSON(${JSON.stringify(f.geometry)}), 4326)))`;
      }
      await tx`
        update zones z set flood_overlap = coalesce((
          select least(1, coalesce(sum(ST_Area(ST_Intersection(z.geom, f.geom))), 0) / nullif(ST_Area(z.geom), 0))
          from flood_extents f where ST_Intersects(z.geom, f.geom)), 0)`;
    } else log("! no flood extent file found — satellite layer will be empty");

    // Rainfall
    if (rain?.zones) {
      const start = Date.parse(rain.start);
      const step = (rain.interval_hours ?? 3) * 3600e3;
      const rows: { zone_id: string; ts: string; mm: number }[] = [];
      for (const [zoneId, values] of Object.entries<number[]>(rain.zones)) {
        if (!region.zones.some((z) => z.id === zoneId)) continue;
        values.forEach((mm, i) => rows.push({ zone_id: zoneId, ts: new Date(start + (i + 1) * step).toISOString(), mm }));
      }
      const source = rain.synthetic ? "synthetic-imerg" : "nasa-imerg";
      await tx`
        insert into rainfall_readings (zone_id, ts, mm, source)
        select x.zone_id, x.ts, x.mm, ${source} from jsonb_to_recordset(${JSON.stringify(rows)}::text::jsonb) as x(zone_id text, ts timestamptz, mm real)`;
      log(`  rainfall: ${rows.length} readings`);
    }

    // Shelters
    for (const s of region.shelters) {
      await tx`insert into shelters (id, name, geom, capacity, current_occupancy, initial_occupancy, contact_phone)
               values (${s.id}, ${s.name}, ST_SetSRID(ST_MakePoint(${s.location[0]}, ${s.location[1]}), 4326), ${s.capacity}, ${s.occupancy}, ${s.occupancy}, ${s.contactPhone})`;
    }

    // Volunteers
    for (const v of region.volunteers) {
      await tx`insert into volunteers (name, phone, type, capacity, current_location, home_location, is_available, is_simulated, last_seen_at)
               values (${v.name}, ${v.phone}, ${v.type}, ${v.capacity}, ST_SetSRID(ST_MakePoint(${v.base[0]}, ${v.base[1]}), 4326),
                       ST_SetSRID(ST_MakePoint(${v.base[0]}, ${v.base[1]}), 4326), true, ${v.simulated}, now())`;
    }

    // Residents
    type R = { phone: string; name: string; email?: string; lang: Lang; zone_id: string; lng: number; lat: number; vulnerable: { type: VulnerableType; count: number }[]; family: { phone: string; name: string; email?: string }[] };
    const residents: R[] = [];
    const total = opts.residents ?? 200;
    let familyN = 0;
    const famPhone = () => `+234800200${String(++familyN).padStart(4, "0")}`;
    // Demo emails use example.com (reserved — never delivered even with EMAIL_PROVIDER=brevo).

    // Named demo residents (pre-selected in /sim).
    const zoneCfg = (id: string) => region.zones.find((z) => z.id === id) ?? region.zones[0];
    const lmLoc = (zoneId: string, idx: number, d: LngLat = [0, 0]): LngLat => {
      const l = zoneCfg(zoneId).landmarks[idx]?.location ?? ringCentroid(zoneCfg(zoneId).polygon);
      return [l[0] + d[0], l[1] + d[1]];
    };
    const pick = (i: number) => (region.demoZones[i] && region.zones.some((z) => z.id === region.demoZones[i]) ? region.demoZones[i] : region.zones[i % region.zones.length].id);
    const [z0, z1, z2] = [pick(0), pick(1), pick(2)];
    const named: R[] = [
      {
        phone: region.demoResidentPhone, name: "Mama Ngozi Adefake", lang: "pcm", zone_id: z0,
        ...((([lng, lat]) => ({ lng, lat }))(region.demoResidentHome ?? lmLoc(z0, 1, [-0.0015, -0.0005]))),
        vulnerable: [{ type: "elderly", count: 1 }, { type: "child_under5", count: 1 }],
        family: [{ phone: famPhone(), name: "Chinedu Adefake (son)", email: "chinedu.adefake@example.com" }, { phone: famPhone(), name: "Ada Adefake (daughter)" }],
      },
      {
        phone: "+2348000000002", name: "John Okonfake", email: "john.okonfake@example.com", lang: "en", zone_id: z1,
        ...((([lng, lat]) => ({ lng, lat }))(lmLoc(z1, 2, [-0.002, 0.001]))),
        vulnerable: [{ type: "pregnant", count: 1 }],
        family: [{ phone: famPhone(), name: "Mary Okonfake (sister)" }],
      },
      {
        phone: "+2348000000003", name: "Hauwa Bellotest", lang: "ha", zone_id: z2,
        ...((([lng, lat]) => ({ lng, lat }))(lmLoc(z2, 3, [-0.002, 0]))),
        vulnerable: [{ type: "bedridden", count: 1 }],
        family: [{ phone: famPhone(), name: "Musa Bellotest (husband)" }],
      },
    ];
    residents.push(...named);

    const totalPop = region.zones.reduce((s, z) => s + z.population, 0);
    let n = named.length;
    for (const z of region.zones) {
      const count = Math.round(((total - named.length) * z.population) / totalPop);
      for (let k = 0; k < count && n < total; k++) {
        n++;
        const [lng, lat] = randomPointIn(rand, z.polygon);
        const vulnerable: R["vulnerable"] = [];
        if (rand() < 0.3) {
          const kinds = rand() < 0.3 ? 2 : 1;
          for (let q = 0; q < kinds; q++) {
            const type = weighted(rand, VULN_WEIGHTS);
            if (!vulnerable.some((v) => v.type === type)) vulnerable.push({ type, count: type === "child_under5" && rand() < 0.4 ? 2 : 1 });
          }
        }
        const fam: R["family"] = [];
        const famCount = rand() < 0.6 ? (rand() < 0.4 ? 2 : 1) : 0;
        const surname = SURNAMES[Math.floor(rand() * SURNAMES.length)];
        for (let q = 0; q < famCount; q++) fam.push({ phone: famPhone(), name: `${FIRST[Math.floor(rand() * FIRST.length)]} ${surname}` });
        residents.push({
          phone: `+234800000${String(n).padStart(4, "0")}`,
          name: `${FIRST[Math.floor(rand() * FIRST.length)]} ${surname}`,
          lang: weighted(rand, LANG_WEIGHTS),
          zone_id: z.id,
          lng,
          lat,
          vulnerable,
          family: fam,
        });
      }
    }

    const inserted = await tx<{ id: string; phone: string }[]>`
      insert into residents (phone, name, email, email_verified_at, preferred_language, home, zone_id, consent_location, consent_at, registered_by, is_seed)
      select x.phone, x.name, x.email, case when x.email is not null then now() end, x.lang, ST_SetSRID(ST_MakePoint(x.lng, x.lat), 4326), x.zone_id, true, now(), 'seed', true
      from jsonb_to_recordset(${JSON.stringify(residents)}::text::jsonb) as x(phone text, name text, email text, lang text, zone_id text, lng float8, lat float8)
      returning id, phone`;
    const idByPhone = new Map(inserted.map((r) => [r.phone, r.id]));
    const vuln = residents.flatMap((r) => r.vulnerable.map((v) => ({ resident_id: idByPhone.get(r.phone), type: v.type, count: v.count })));
    const fam = residents.flatMap((r) => r.family.map((f) => ({ resident_id: idByPhone.get(r.phone), phone: f.phone, name: f.name, email: f.email ?? null })));
    if (vuln.length)
      await tx`insert into vulnerable_members (resident_id, type, count) select x.resident_id, x.type, x.count from jsonb_to_recordset(${JSON.stringify(vuln)}::text::jsonb) as x(resident_id uuid, type text, count int)`;
    if (fam.length)
      await tx`insert into family_contacts (resident_id, phone, name, email) select x.resident_id, x.phone, x.name, x.email from jsonb_to_recordset(${JSON.stringify(fam)}::text::jsonb) as x(resident_id uuid, phone text, name text, email text)`;

    // Operator accounts
    const pw = opts.operatorPassword ?? process.env.SEED_OPERATOR_PASSWORD ?? "floodguard-demo";
    const hash = bcrypt.hashSync(pw, 10);
    await tx`insert into app_users (email, name, role, password_hash) values
      ('operator@floodguard.demo', ${`Demo Operator (${region.agency})`}, 'operator', ${hash}),
      ('admin@floodguard.demo', 'Demo Admin', 'admin', ${hash})`;

    await tx`insert into audit_log (actor, entity, entity_id, action, details) values ('system', 'demo', 'seed', 'seeded', ${tx.json({ region: region.id, residents: residents.length })})`;
    log(`  ${region.zones.length} zones, ${residents.length} residents (${vuln.length} vulnerable members, ${fam.length} family contacts), ${region.volunteers.length} volunteers, ${region.shelters.length} shelters`);
  });
}
