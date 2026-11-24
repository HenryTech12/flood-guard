// Message templates. Languages whose file is marked NEEDS_NATIVE_REVIEW (or whose key
// is empty) fall back to English, and the result says so — we never present a
// machine translation as final.
import en from "../../../content/alerts/en.json";
import pcm from "../../../content/alerts/pcm.json";
import ha from "../../../content/alerts/ha.json";
import yo from "../../../content/alerts/yo.json";
import ig from "../../../content/alerts/ig.json";
import type { Lang } from "../core/types";

type Json = { [k: string]: unknown };
const FILES: Record<Lang, Json> = { en, pcm, ha, yo, ig } as unknown as Record<Lang, Json>;

export type TemplateVars = Record<string, string | number | null | undefined>;

export interface Rendered {
  text: string;
  /** Language actually used. */
  lang: Lang;
  requested: Lang;
  fallback: boolean;
}

export function languageStatus(lang: Lang): string {
  const meta = (FILES[lang]?._meta ?? {}) as { status?: string };
  return meta.status ?? "UNKNOWN";
}

export function isUsable(lang: Lang): boolean {
  return languageStatus(lang) !== "NEEDS_NATIVE_REVIEW";
}

function lookup(obj: Json, key: string): string | null {
  let cur: unknown = obj;
  for (const part of key.split(".")) {
    if (cur && typeof cur === "object" && part in (cur as Json)) cur = (cur as Json)[part];
    else return null;
  }
  return typeof cur === "string" && cur.trim() ? cur : null;
}

export function fill(template: string, vars: TemplateVars = {}): string {
  return template.replace(/\{(\w+)\}/g, (m, k) => (vars[k] === undefined || vars[k] === null ? m : String(vars[k])));
}

export function t(lang: Lang | null | undefined, key: string, vars: TemplateVars = {}): Rendered {
  const requested: Lang = lang && FILES[lang] ? lang : "en";
  if (isUsable(requested)) {
    const s = lookup(FILES[requested], key);
    if (s) return { text: fill(s, vars), lang: requested, requested, fallback: false };
  }
  const s = lookup(FILES.en, key);
  if (!s) throw new Error(`Missing template key "${key}"`);
  return { text: fill(s, vars), lang: "en", requested, fallback: requested !== "en" };
}

export function tx(lang: Lang | null | undefined, key: string, vars: TemplateVars = {}): string {
  return t(lang, key, vars).text;
}
