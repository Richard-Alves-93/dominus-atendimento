// WhatsApp/phone helpers — Brazil-first.
// Display format: +99 99 99999-9999
// Storage format: digits only, with country code (default 55 for BR).

export function onlyDigits(v: string): string {
  return (v ?? "").replace(/\D/g, "");
}

/** Normalize digits: ensure a DDI. If 10/11 digits, prefix 55 (BR). */
export function normalizePhone(v: string): string {
  let d = onlyDigits(v);
  if (!d) return "";
  if (d.length === 10 || d.length === 11) d = "55" + d;
  return d;
}

/** Format any input into +DDI DD NNNNN-NNNN as the user types. */
export function formatPhoneDisplay(v: string): string {
  const d = onlyDigits(v);
  if (!d) return "";
  // Assume BR if local-only digits
  let rest = d;
  let ddi = "";
  if (d.length <= 11) {
    ddi = "55";
    rest = d;
  } else {
    ddi = d.slice(0, d.length - 11);
    rest = d.slice(-11);
    if (ddi.length === 0) ddi = "55";
  }
  const ddd = rest.slice(0, 2);
  const mid = rest.slice(2, 7);
  const end = rest.slice(7, 11);
  let out = `+${ddi}`;
  if (ddd) out += ` ${ddd}`;
  if (mid) out += ` ${mid}`;
  if (end) out += `-${end}`;
  return out;
}

/** Valid if normalized has DDI(>=1) + DDD(2) + number(8 or 9) → 12 or 13 digits. */
export function isValidPhone(v: string): boolean {
  const d = normalizePhone(v);
  return d.length === 12 || d.length === 13;
}
