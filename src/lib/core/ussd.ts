// USSD state machine. Africa's Talking sends the *whole path* typed so far in `text`
// ("1*3*2*1"), so the machine is a pure function of (text, context): it walks the
// inputs step by step and either asks the next question (CON …) or finishes (END …)
// with an action for the server to execute. No session storage needed, and retries
// of the same request produce the same answer.
import { haversineM, formatDistance } from "./geo";
import { normalizePhone, isValidPhone } from "./phone";
import { tx } from "../i18n/templates";
import type { Lang, LngLat, VulnerableType } from "./types";

export interface UssdLandmark {
  id: string;
  name: string;
  location: LngLat;
}
export interface UssdZone {
  id: string;
  name: string;
  shortName: string;
  centroid: LngLat;
  landmarks: UssdLandmark[];
}
export interface UssdShelter {
  name: string;
  location: LngLat;
  capacity: number;
  occupancy: number;
  phone: string;
}
export interface UssdContext {
  lang: Lang;
  regionName: string;
  ussdCode: string;
  shortcode: string;
  resident: { name: string | null; zoneId: string | null; home: LngLat | null } | null;
  zones: UssdZone[];
  shelters: UssdShelter[];
}

export type UssdLocation =
  | { kind: "home" }
  | { kind: "landmark"; zoneId: string; landmarkId: string }
  | { kind: "zone"; zoneId: string };

export type UssdAction =
  | { type: "help"; peopleCount: number; vulnerableType: VulnerableType | null; location: UssdLocation }
  | { type: "safe" }
  | { type: "report"; reportType: "water_level" | "road_blocked" | "drain_blocked"; depthCm: number | null; location: UssdLocation | null }
  | { type: "register"; name: string; zoneId: string; landmarkId: string | null; lang: Lang; vulnerableType: VulnerableType | null; familyPhone: string | null };

export interface UssdResult {
  response: string;
  action?: UssdAction;
  /** Name of the step that produced the response (for tests / debugging). */
  step: string;
}

const VULN_BY_DIGIT: Record<string, VulnerableType> = { "1": "elderly", "2": "disabled", "3": "pregnant", "4": "child_under5", "5": "bedridden" };
const LANG_BY_DIGIT: Record<string, Lang> = { "1": "en", "2": "pcm", "3": "ha", "4": "yo", "5": "ig" };
const DEPTH_BY_DIGIT: Record<string, number> = { "1": 15, "2": 50, "3": 100, "4": 130 };

type Pick<T> = { prompt: UssdResult } | { value: T; next: number };

export function runUssd(text: string, ctx: UssdContext): UssdResult {
  const inputs = (text ?? "").trim() === "" ? [] : text.split("*").map((s) => s.trim());
  const L = ctx.lang;
  const common = { region: ctx.regionName, ussd: ctx.ussdCode, shortcode: ctx.shortcode };
  const say = (key: string, vars: Record<string, string | number> = {}) => tx(L, `ussd.${key}`, { ...common, ...vars });
  const con = (step: string, key: string, vars?: Record<string, string | number>): UssdResult => ({ step, response: say(key, vars) });
  const end = (step: string, key: string, vars?: Record<string, string | number>, action?: UssdAction): UssdResult => ({ step, response: say(key, vars), action });
  const invalid = (step: string) => end(`${step}:invalid`, "invalid");

  const zoneById = (id: string | null | undefined) => ctx.zones.find((z) => z.id === id) ?? null;
  const residentZone = zoneById(ctx.resident?.zoneId);

  /** Area (zone) picker followed by landmark picker. */
  function pickAreaLandmark(i: number, step: string, presetZone: UssdZone | null): Pick<UssdLocation> {
    let zone = presetZone;
    if (!zone) {
      const a = inputs[i];
      if (a === undefined) return { prompt: con(`${step}:area`, "ask_area", { list: ctx.zones.map((z, k) => `${k + 1}. ${z.shortName}`).join("\n") }) };
      const idx = parseInt(a, 10) - 1;
      if (!(idx >= 0 && idx < ctx.zones.length)) return { prompt: invalid(`${step}:area`) };
      zone = ctx.zones[idx];
      i++;
    }
    const lm = inputs[i];
    const list = zone.landmarks.slice(0, 6);
    if (lm === undefined) return { prompt: con(`${step}:landmark`, "ask_landmark", { list: list.map((l, k) => `${k + 1}. ${l.name}`).join("\n") }) };
    if (lm === "0") return { value: { kind: "zone", zoneId: zone.id }, next: i + 1 };
    const li = parseInt(lm, 10) - 1;
    if (!(li >= 0 && li < list.length)) return { prompt: invalid(`${step}:landmark`) };
    return { value: { kind: "landmark", zoneId: zone.id, landmarkId: list[li].id }, next: i + 1 };
  }

  function placeName(loc: UssdLocation): string {
    if (loc.kind === "home") return "your home";
    const z = zoneById(loc.zoneId);
    if (loc.kind === "zone") return z?.shortName ?? "your area";
    return z?.landmarks.find((l) => l.id === loc.landmarkId)?.name ?? z?.shortName ?? "your area";
  }

  function nearestShelter(from: LngLat) {
    const withSpace = ctx.shelters.filter((s) => s.capacity - s.occupancy > 0);
    return withSpace.map((s) => ({ s, d: haversineM(from, s.location) })).sort((a, b) => a.d - b.d)[0] ?? null;
  }

  if (inputs.length === 0) return con("main", "main");
  const [choice] = inputs;

  switch (choice) {
    // 1. I need help
    case "1": {
      const p = inputs[1];
      if (p === undefined) return con("help:people", "ask_people");
      const people = parseInt(p, 10);
      if (!/^\d{1,3}$/.test(p) || people < 1 || people > 500) return invalid("help:people");

      const v = inputs[2];
      if (v === undefined) return con("help:vulnerable", "ask_vulnerable");
      if (v !== "1" && v !== "2") return invalid("help:vulnerable");
      let i = 3;
      let vulnerableType: VulnerableType | null = null;
      if (v === "1") {
        const vt = inputs[3];
        if (vt === undefined) return con("help:vulnerable_type", "ask_vulnerable_type");
        if (!VULN_BY_DIGIT[vt]) return invalid("help:vulnerable_type");
        vulnerableType = VULN_BY_DIGIT[vt];
        i = 4;
      }

      let location: UssdLocation;
      if (ctx.resident?.home) {
        const w = inputs[i];
        if (w === undefined) return con("help:where", "ask_where");
        if (w === "1") {
          location = { kind: "home" };
          i++;
        } else if (w === "2") {
          const r = pickAreaLandmark(i + 1, "help", residentZone);
          if ("prompt" in r) return r.prompt;
          location = r.value;
          i = r.next;
        } else return invalid("help:where");
      } else {
        const r = pickAreaLandmark(i, "help", residentZone);
        if ("prompt" in r) return r.prompt;
        location = r.value;
        i = r.next;
      }

      const c = inputs[i];
      if (c === undefined) return con("help:confirm", "confirm_help", { people, place: placeName(location) });
      if (c === "2") return end("help:cancelled", "cancelled");
      if (c !== "1") return invalid("help:confirm");
      return end("help:done", "help_done", { ref: "{ref}" }, { type: "help", peopleCount: people, vulnerableType, location });
    }

    // 2. I am safe
    case "2":
      return end("safe:done", "safe_done", {}, { type: "safe" });

    // 3. Report flooding
    case "3": {
      const rt = inputs[1];
      if (rt === undefined) return con("report:type", "ask_report_type");
      const reportType = rt === "1" ? "water_level" : rt === "2" ? "road_blocked" : rt === "3" ? "drain_blocked" : null;
      if (!reportType) return invalid("report:type");
      let i = 2;
      let depthCm: number | null = null;
      if (reportType === "water_level") {
        const d = inputs[2];
        if (d === undefined) return con("report:depth", "ask_depth");
        if (!DEPTH_BY_DIGIT[d]) return invalid("report:depth");
        depthCm = DEPTH_BY_DIGIT[d];
        i = 3;
      }
      const r = pickAreaLandmark(i, "report", residentZone);
      if ("prompt" in r) return r.prompt;
      return end("report:done", "report_done", {}, { type: "report", reportType, depthCm, location: r.value });
    }

    // 4. Nearest shelter
    case "4": {
      let from: LngLat | null = ctx.resident?.home ?? residentZone?.centroid ?? null;
      if (!from) {
        const a = inputs[1];
        if (a === undefined) return con("shelter:area", "ask_area", { list: ctx.zones.map((z, k) => `${k + 1}. ${z.shortName}`).join("\n") });
        const idx = parseInt(a, 10) - 1;
        if (!(idx >= 0 && idx < ctx.zones.length)) return invalid("shelter:area");
        from = ctx.zones[idx].centroid;
      }
      const n = nearestShelter(from);
      if (!n) return end("shelter:none", "shelter_none");
      return end("shelter:done", "shelter", { name: n.s.name, distance: formatDistance(n.d), space: n.s.capacity - n.s.occupancy, phone: n.s.phone });
    }

    // 5. Register household
    case "5": {
      const name = inputs[1];
      if (name === undefined) return con("register:name", "reg_name");
      if (name.length < 2 || /^\d+$/.test(name)) return invalid("register:name");
      const r = pickAreaLandmark(2, "register", null);
      if ("prompt" in r) return r.prompt;
      const loc = r.value as Exclude<UssdLocation, { kind: "home" }>;
      let i = r.next;
      const lg = inputs[i];
      if (lg === undefined) return con("register:lang", "reg_lang");
      if (!LANG_BY_DIGIT[lg]) return invalid("register:lang");
      const lang = LANG_BY_DIGIT[lg];
      i++;
      const vt = inputs[i];
      if (vt === undefined) return con("register:vulnerable", "reg_vulnerable");
      if (vt !== "0" && !VULN_BY_DIGIT[vt]) return invalid("register:vulnerable");
      const vulnerableType = vt === "0" ? null : VULN_BY_DIGIT[vt];
      i++;
      const fp = inputs[i];
      if (fp === undefined) return con("register:family", "reg_family");
      let familyPhone: string | null = null;
      if (fp !== "0") {
        if (!isValidPhone(fp)) return invalid("register:family");
        familyPhone = normalizePhone(fp);
      }
      i++;
      const consent = inputs[i];
      if (consent === undefined) return con("register:consent", "reg_consent");
      if (consent === "2") return end("register:cancelled", "cancelled");
      if (consent !== "1") return invalid("register:consent");
      const zone = zoneById(loc.zoneId)!;
      return {
        step: "register:done",
        response: tx(lang, "ussd.reg_done", { ...common, zone: zone.shortName }),
        action: { type: "register", name, zoneId: loc.zoneId, landmarkId: loc.kind === "landmark" ? loc.landmarkId : null, lang, vulnerableType, familyPhone },
      };
    }

    default:
      return invalid("main");
  }
}
