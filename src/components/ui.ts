// Shared colours/labels for the dashboard (keep in sync with globals.css theme).
import type { RiskLevel, VolunteerType } from "@/lib/core/types";
import { urgencyBand } from "@/lib/core/urgency";

export const LEVEL_COLOR: Record<RiskLevel, string> = { low: "#22c55e", medium: "#f59e0b", high: "#ef4444", severe: "#a855f7" };
export const LEVEL_BG: Record<RiskLevel, string> = {
  low: "bg-green-500/15 text-green-700 border-green-300",
  medium: "bg-amber-500/15 text-amber-700 border-amber-300",
  high: "bg-red-500/15 text-red-700 border-red-300",
  severe: "bg-purple-500/20 text-purple-700 border-purple-500/60",
};

export const URGENCY_COLOR = { critical: "#dc2626", high: "#f97316", medium: "#facc15", low: "#a3e635" } as const;
export const urgencyColor = (score: number) => URGENCY_COLOR[urgencyBand(score)];

export const STATUS_LABEL: Record<string, string> = {
  new: "Waiting",
  assigned: "Accepted",
  en_route: "En route",
  rescued: "Rescued",
  cancelled: "Closed",
  duplicate: "Duplicate",
};
export const STATUS_CLASS: Record<string, string> = {
  new: "bg-red-500/20 text-red-700",
  assigned: "bg-sky-500/20 text-sky-700",
  en_route: "bg-yellow-500/20 text-yellow-700",
  rescued: "bg-green-500/20 text-green-700",
  cancelled: "bg-slate-400/30 text-slate-700",
  duplicate: "bg-slate-400/30 text-slate-700",
};

export const VOL_ICON: Record<VolunteerType, string> = { boat: "🚤", vehicle: "🚙", on_foot: "🚶", medical: "⛑️" };

export const SOURCE_LABEL: Record<string, { label: string; hint: string; cls: string }> = {
  gps: { label: "GPS", hint: "Phone GPS — precise", cls: "text-green-700" },
  registered: { label: "Home", hint: "Registered home address (with consent)", cls: "text-green-700" },
  ussd_landmark: { label: "Landmark", hint: "Nearest landmark chosen by resident (~200 m)", cls: "text-amber-700" },
  zone_centroid: { label: "Area only", hint: "Only the area is known (~1 km) — call to confirm", cls: "text-orange-700" },
  unknown: { label: "Unknown", hint: "No location yet — resident asked to reply with a landmark", cls: "text-red-700" },
};
