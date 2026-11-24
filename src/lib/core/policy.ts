// Small policy functions: duplicate merging and alert de-duplication.
import { type RiskLevel, levelIndex } from "./types";

export const DEDUPE_WINDOW_MIN = 30;

export interface ExistingRequest {
  id: string;
  phone: string;
  createdAt: Date;
  status: string;
}

/** Same phone, still open, created within the window → merge instead of a new pin. */
export function findMergeTarget(existing: ExistingRequest[], phone: string, now: Date, windowMin = DEDUPE_WINDOW_MIN): ExistingRequest | null {
  const cutoff = now.getTime() - windowMin * 60000;
  const candidates = existing
    .filter((r) => r.phone === phone && ["new", "assigned", "en_route"].includes(r.status) && r.createdAt.getTime() >= cutoff)
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  return candidates[0] ?? null;
}

export const ALERT_COOLDOWN_MIN = 360;

/**
 * Should a resident get an alert for `newLevel`?
 *  - never below MEDIUM
 *  - always on escalation above the last level they were sent
 *  - same level again only after the cooldown (so flickering risk never spams)
 *  - `force` (operator re-send) bypasses the cooldown but not the MEDIUM floor
 */
export function shouldSendAlert(
  newLevel: RiskLevel,
  last: { level: RiskLevel; sentAt: Date } | null,
  now: Date,
  { cooldownMin = ALERT_COOLDOWN_MIN, force = false }: { cooldownMin?: number; force?: boolean } = {},
): { send: boolean; reason: string } {
  if (levelIndex(newLevel) < levelIndex("medium")) return { send: false, reason: "below medium" };
  if (force) return { send: true, reason: "operator re-send" };
  if (!last) return { send: true, reason: "first alert" };
  if (levelIndex(newLevel) > levelIndex(last.level)) return { send: true, reason: "escalation" };
  const ageMin = (now.getTime() - last.sentAt.getTime()) / 60000;
  if (ageMin >= cooldownMin && levelIndex(newLevel) >= levelIndex(last.level)) return { send: true, reason: "cooldown elapsed" };
  return { send: false, reason: `already alerted ${last.level.toUpperCase()} ${Math.round(ageMin)} min ago` };
}
