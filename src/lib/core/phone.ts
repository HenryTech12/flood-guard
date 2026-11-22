/** Normalise Nigerian phone numbers to E.164 (+234...). Leaves other formats as +digits. */
export function normalizePhone(input: string): string {
  const raw = (input ?? "").trim();
  let d = raw.replace(/[^\d+]/g, "");
  if (d.startsWith("+")) return "+" + d.slice(1).replace(/\D/g, "");
  d = d.replace(/\D/g, "");
  if (d.startsWith("00")) return "+" + d.slice(2);
  if (d.startsWith("234")) return "+" + d;
  if (d.startsWith("0") && d.length === 11) return "+234" + d.slice(1);
  if (d.length === 10 && /^[789]/.test(d)) return "+234" + d;
  return d ? "+" + d : "";
}

/** "+2348031234567" -> "+234 803 *** 4567" */
export function maskPhone(phone: string): string {
  const p = normalizePhone(phone);
  if (p.length < 8) return "***";
  if (p.startsWith("+234") && p.length === 14) return `+234 ${p.slice(4, 7)} *** ${p.slice(-4)}`;
  return `${p.slice(0, 4)} *** ${p.slice(-4)}`;
}

export function isValidPhone(phone: string): boolean {
  return /^\+\d{9,15}$/.test(normalizePhone(phone));
}
