// Inbound SMS parser. Pure and forgiving: residents type on basic phones, in a hurry,
// in English, Pidgin or a local language. Anything that looks like a call for help is
// treated as one — a false positive costs an operator a few seconds, a false negative
// can cost a life.
import type { Lang, ReportType } from "./types";

export type ParsedSms =
  | { kind: "help"; peopleCount: number | null; note: string }
  | { kind: "safe"; note: string }
  | { kind: "report"; reportType: ReportType; depthCm: number | null; depthLabel: string | null; landmarkText: string }
  | { kind: "shelter" }
  | { kind: "stop" }
  | { kind: "delete" }
  | { kind: "start" }
  | { kind: "lang"; lang: Lang }
  | { kind: "unknown"; note: string };

const NUMBER_WORDS: Record<string, number> = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  eleven: 11, twelve: 12, fifteen: 15, twenty: 20,
  // Pidgin / colloquial
  tu: 2, tree: 3, fo: 4,
};

// Words that, at the start of a message, mean "help".
const HELP_START = /^(help|hlp|hepl|halp|sos|rescue|save|emergency|taimako|agaji|egba ?mi|iranlowo|enyemaka|nyere ?m ?aka|abeg)\b/;
// Phrases that mean "help" anywhere in the message.
const HELP_ANYWHERE =
  /\b(help ?us|help ?me|we dey trap|we don trap|dey trap|don trap|we are trapped|i am trapped|im trapped|trapped|come help|abeg help|please help|pls help|save us|water don enter|water don reach|we dey drown|drowning)\b/;

const SAFE_START = /^(safe|i ?am ?safe|i'?m ?safe|im safe|we ?are ?safe|okay ?now|ok ?now)\b/;
const SAFE_ANYWHERE = /\b(i dey safe|we dey safe|i dey okay|we dey okay|we don comot|we are safe|i am safe|i'?m safe|all safe)\b/;

const DEPTHS: { re: RegExp; cm: number; label: string }[] = [
  { re: /\b(ankle|ankles|leg)\b/, cm: 15, label: "ankle" },
  { re: /\b(knee|knees|knee ?level)\b/, cm: 50, label: "knee" },
  { re: /\b(thigh|thighs)\b/, cm: 75, label: "thigh" },
  { re: /\b(waist|belle|belly|stomach)\b/, cm: 100, label: "waist" },
  { re: /\b(chest|breast)\b/, cm: 130, label: "chest" },
  { re: /\b(neck|shoulder|head)\b/, cm: 160, label: "neck" },
  { re: /\b(roof|rooftop)\b/, cm: 250, label: "roof" },
];

const LANG_ALIASES: Record<string, Lang> = {
  en: "en", eng: "en", english: "en",
  pcm: "pcm", pidgin: "pcm", pigin: "pcm",
  ha: "ha", hausa: "ha",
  yo: "yo", yoruba: "yo",
  ig: "ig", igbo: "ig", ibo: "ig",
};

export function normalizeSms(text: string): string {
  return (text ?? "")
    .toLowerCase()
    .replace(/[’`]/g, "'")
    .replace(/[^\p{L}\p{N}' ]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function extractPeopleCount(norm: string): number | null {
  const digit = norm.match(/\b(\d{1,3})\b/);
  if (digit) {
    const n = parseInt(digit[1], 10);
    if (n >= 1 && n <= 500) return n;
  }
  for (const w of norm.split(" ")) {
    if (w in NUMBER_WORDS) return NUMBER_WORDS[w];
  }
  if (/\b(alone|only me|just me|myself)\b/.test(norm)) return 1;
  return null;
}

/** Strip the leading keyword(s) and return the rest in original casing. */
function remainder(original: string, keywordRe: RegExp): string {
  const trimmed = original.trim();
  const m = trimmed.match(new RegExp("^\\s*" + keywordRe.source.replace(/^\^/, ""), "i"));
  return (m ? trimmed.slice(m[0].length) : trimmed).replace(/^[\s,.:;-]+/, "").trim();
}

function parseDepth(norm: string): { cm: number | null; label: string | null; consumed: RegExp | null } {
  for (const d of DEPTHS) if (d.re.test(norm)) return { cm: d.cm, label: d.label, consumed: d.re };
  const m = norm.match(/\b(\d{1,3}(?:\.\d+)?)\s*(cm|m|ft|feet|inch|inches)?\b/);
  if (m) {
    const v = parseFloat(m[1]);
    const unit = m[2] ?? "cm";
    const cm = unit === "m" ? v * 100 : unit === "ft" || unit === "feet" ? v * 30.48 : unit.startsWith("inch") ? v * 2.54 : v;
    return { cm: Math.round(cm), label: `${m[1]}${m[2] ?? "cm"}`, consumed: /\b\d{1,3}(?:\.\d+)?\s*(cm|m|ft|feet|inch|inches)?\b/ };
  }
  return { cm: null, label: null, consumed: null };
}

export function parseSms(text: string): ParsedSms {
  const original = (text ?? "").trim();
  const norm = normalizeSms(original);
  if (!norm) return { kind: "unknown", note: "" };

  // Commands with exact meaning first.
  if (/^(stop|unsubscribe|stop alerts|cancel alerts)$/.test(norm)) return { kind: "stop" };
  if (/^(delete|delete me|delete my data|erase|erase my data|remove me)$/.test(norm)) return { kind: "delete" };
  if (/^(start|join|subscribe|start alerts)$/.test(norm)) return { kind: "start" };
  const lang = norm.match(/^(lang|language|lng)\s+(\w+)$/);
  if (lang && LANG_ALIASES[lang[2]]) return { kind: "lang", lang: LANG_ALIASES[lang[2]] };
  if (/^(shelter|shelters|camp|where to go|where i go|where we go)\b/.test(norm)) return { kind: "shelter" };

  // Help wins over everything else when it is the first word.
  if (HELP_START.test(norm)) {
    return { kind: "help", peopleCount: extractPeopleCount(norm), note: remainder(original, /^(help|hlp|hepl|halp|sos|rescue|save|emergency|taimako|agaji|egba ?mi|iranlowo|enyemaka|nyere ?m ?aka|abeg)\b/) };
  }

  // Structured crowd reports.
  const water = norm.match(/^(water|flood|wata)\b\s*(.*)$/);
  if (water && !HELP_ANYWHERE.test(norm)) {
    const rest = water[2];
    const depth = parseDepth(rest);
    let landmarkText = rest;
    if (depth.consumed) landmarkText = landmarkText.replace(depth.consumed, "");
    landmarkText = landmarkText.replace(/\b(level|deep|high|for|at|near|by|dey|don reach|reach)\b/g, " ").replace(/\s+/g, " ").trim();
    return { kind: "report", reportType: "water_level", depthCm: depth.cm, depthLabel: depth.label, landmarkText };
  }
  const road = norm.match(/^(road|bridge|street)\b\s*(blocked|block|closed|close|cut|flooded|don block|don cut)?\s*(.*)$/);
  if (road) return { kind: "report", reportType: "road_blocked", depthCm: null, depthLabel: null, landmarkText: road[3].replace(/^(at|near|by)\s+/, "").trim() };
  const drain = norm.match(/^(drain|gutter|culvert)\b\s*(blocked|block|full|don block)?\s*(.*)$/);
  if (drain) return { kind: "report", reportType: "drain_blocked", depthCm: null, depthLabel: null, landmarkText: drain[3].replace(/^(at|near|by)\s+/, "").trim() };
  const report = norm.match(/^report\b\s*(.*)$/);
  if (report) return { kind: "report", reportType: "other", depthCm: null, depthLabel: null, landmarkText: report[1] };

  if (SAFE_START.test(norm) || SAFE_ANYWHERE.test(norm)) {
    if (!HELP_ANYWHERE.test(norm)) return { kind: "safe", note: original };
  }

  if (HELP_ANYWHERE.test(norm)) return { kind: "help", peopleCount: extractPeopleCount(norm), note: original };

  return { kind: "unknown", note: original };
}

/**
 * Find the best matching landmark/zone name in free text. Returns the id of the
 * candidate whose name tokens best overlap the text (requires a meaningful match).
 */
export function matchPlace<T extends { id: string; name: string }>(text: string, candidates: T[]): T | null {
  const norm = normalizeSms(text);
  if (!norm) return null;
  const words = new Set(norm.split(" ").filter((w) => w.length > 2));
  const STOP = new Set(["road", "junction", "market", "school", "primary", "area", "the", "and", "near", "phase", "centre", "center"]);
  let best: { c: T; score: number } | null = null;
  for (const c of candidates) {
    const name = normalizeSms(c.name);
    if (norm.includes(name)) {
      const score = 100 + name.length;
      if (!best || score > best.score) best = { c, score };
      continue;
    }
    const tokens = name.split(" ").filter((w) => w.length > 2);
    const distinctive = tokens.filter((t) => !STOP.has(t));
    const hits = distinctive.filter((t) => words.has(t)).length;
    const generic = tokens.filter((t) => STOP.has(t) && words.has(t)).length;
    if (hits === 0) continue;
    const score = hits * 10 + generic;
    if (!best || score > best.score) best = { c, score };
  }
  return best?.c ?? null;
}
