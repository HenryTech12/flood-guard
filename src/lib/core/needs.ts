// Emergency types offered on the citizen emergency form (from the Guardy portal, extended).
export const NEED_TYPES = [
  "Rising water level / Imminent flood",
  "Area already flooded",
  "Trapped individuals",
  "Injuries / Medical emergency",
  "Need clean water",
  "Need food supplies",
  "Need medicine",
  "Need shelter",
  "Power outage",
  "Road blocked",
  "Building damage / Collapse risk",
  "Communication problem",
] as const;
export type NeedType = (typeof NEED_TYPES)[number];
