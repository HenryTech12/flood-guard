// Urgency score (0–100) for a help request. Every point is attributed to a reason so
// operators can see *why* a request is ranked where it is.
//
//   zone risk       low 5 · medium 15 · high 30 · severe 40 · unknown 15
//   vulnerable      per type (bedridden 15, disabled 12, elderly/pregnant/child<5 10, other 6);
//                   extra members of a type add 50% each; capped at 30
//   people          +2 per person beyond the first, capped at 15
//   waiting         +3 per full 10 minutes waiting, capped at 15
//   keywords        roof 10, drowning 15, baby/pikin 8, water rising 8, sick 6, trapped 6 …; capped at 20
//   failed attempt  +10 per earlier rescue attempt that could not reach them (cap 20)
//   final score is clamped to 0–100
import type { Reason, RiskLevel, VulnerableType } from "./types";

export const ZONE_POINTS: Record<RiskLevel | "unknown", number> = { low: 5, medium: 15, high: 30, severe: 40, unknown: 15 };

export const VULNERABLE_WEIGHTS: Record<VulnerableType, number> = {
  bedridden: 15,
  disabled: 12,
  elderly: 10,
  pregnant: 10,
  child_under5: 10,
  other: 6,
};

export const VULNERABLE_LABELS: Record<VulnerableType, string> = {
  bedridden: "bedridden/sick",
  disabled: "disabled",
  elderly: "elderly",
  pregnant: "pregnant",
  child_under5: "child under 5",
  other: "other vulnerable",
};

export const KEYWORDS: { re: RegExp; points: number; label: string }[] = [
  { re: /\b(drown|drowning|dey drown|sinking)\b/i, points: 15, label: "drowning" },
  { re: /\b(roof|rooftop|on top of house|top of house)\b/i, points: 10, label: "on roof" },
  { re: /\b(baby|babies|infant|pikin|newborn)\b/i, points: 8, label: "baby" },
  { re: /\b(water (is )?rising|water dey rise|water dey increase|water don reach|rising)\b/i, points: 8, label: "water rising" },
  { re: /\b(sick|ill|injured|bleeding|wound|fever|unconscious|labour|labor)\b/i, points: 6, label: "sick/injured" },
  { re: /\b(trap|trapped|stuck|cannot move|can't move|no way out)\b/i, points: 6, label: "trapped" },
  { re: /\b(pregnant|belle)\b/i, points: 5, label: "pregnant (message)" },
  { re: /\b(old (man|woman|people)|elderly|grandma|grandpa|mama|papa)\b/i, points: 4, label: "elderly (message)" },
];

export interface UrgencyInput {
  zoneLevel: RiskLevel | null;
  vulnerable: { type: VulnerableType; count: number }[];
  peopleCount: number | null;
  message: string | null;
  createdAt: Date;
  now: Date;
  failedAttempts?: number;
}

export interface UrgencyResult {
  score: number;
  reasons: Reason[];
}

export function computeUrgency(input: UrgencyInput): UrgencyResult {
  const reasons: Reason[] = [];
  const zoneKey = input.zoneLevel ?? "unknown";
  reasons.push({ label: input.zoneLevel ? `Zone risk ${input.zoneLevel.toUpperCase()}` : "Zone risk unknown", points: ZONE_POINTS[zoneKey] });

  // Vulnerable members.
  const byType = new Map<VulnerableType, number>();
  for (const v of input.vulnerable) byType.set(v.type, (byType.get(v.type) ?? 0) + Math.max(1, v.count || 1));
  let vPoints = 0;
  const vParts: string[] = [];
  for (const [type, count] of byType) {
    const w = VULNERABLE_WEIGHTS[type] ?? 6;
    vPoints += w + (count - 1) * w * 0.5;
    vParts.push(count > 1 ? `${count} ${VULNERABLE_LABELS[type]}` : VULNERABLE_LABELS[type]);
  }
  vPoints = Math.min(30, Math.round(vPoints));
  if (vPoints > 0) reasons.push({ label: `Vulnerable: ${vParts.join(", ")}`, points: vPoints });

  // People count.
  const people = input.peopleCount ?? 1;
  const pPoints = Math.min(15, Math.max(0, (people - 1) * 2));
  if (pPoints > 0) reasons.push({ label: `${people} people`, points: pPoints });

  // Waiting time.
  const waitingMin = Math.max(0, (input.now.getTime() - input.createdAt.getTime()) / 60000);
  const wPoints = Math.min(15, Math.floor(waitingMin / 10) * 3);
  if (wPoints > 0) reasons.push({ label: `Waiting ${Math.floor(waitingMin)} min`, points: wPoints });

  // Keywords.
  const msg = input.message ?? "";
  let kPoints = 0;
  const kLabels: string[] = [];
  for (const k of KEYWORDS) {
    if (k.re.test(msg)) {
      kPoints += k.points;
      kLabels.push(k.label);
    }
  }
  kPoints = Math.min(20, kPoints);
  if (kPoints > 0) reasons.push({ label: `Message: ${kLabels.join(", ")}`, points: kPoints });

  // Earlier failed attempts.
  const failed = input.failedAttempts ?? 0;
  if (failed > 0) reasons.push({ label: `${failed} failed rescue attempt${failed > 1 ? "s" : ""}`, points: Math.min(20, failed * 10) });

  const score = Math.max(0, Math.min(100, reasons.reduce((s, r) => s + r.points, 0)));
  return { score, reasons };
}

export function urgencyBand(score: number): "critical" | "high" | "medium" | "low" {
  if (score >= 70) return "critical";
  if (score >= 50) return "high";
  if (score >= 30) return "medium";
  return "low";
}
