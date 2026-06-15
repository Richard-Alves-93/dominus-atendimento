// WhatsApp/phone helpers — Brazil-first.
// Display: +DDI DD NNNNN-NNNN. Storage: digits only with DDI.
//
// Store ONLY digits in component state to avoid feedback loops where
// a previously-prepended DDI gets re-prepended on every keystroke.

export function onlyDigits(v: string): string {
  return (v ?? "").replace(/\D/g, "");
}

/** Returns digits-only including DDI. Prepends 55 only for 10/11-digit BR-local input. */
export function normalizePhone(v: string): string {
  const d = onlyDigits(v);
  if (!d) return "";
  if (d.length === 10 || d.length === 11) return "55" + d;
  return d;
}

/**
 * Format input for display. Never duplicates the DDI.
 * - <=9 digits: shown as-is (no DDI prepended; user is still typing).
 * - 10 or 11 digits: assume BR local, prepend "55".
 * - >=12 digits: treat last 11 as local, the rest as DDI.
 */
export function formatPhoneDisplay(v: string): string {
  const d = onlyDigits(v);
  if (!d) return "";

  let ddi = "";
  let rest = d;

  if (d.length >= 12) {
    ddi = d.slice(0, d.length - 11);
    rest = d.slice(-11);
  } else if (d.length === 10 || d.length === 11) {
    ddi = "55";
    rest = d;
  } else {
    ddi = "";
    rest = d;
  }

  const ddd = rest.slice(0, 2);
  const mid = rest.slice(2, 7);
  const end = rest.slice(7, 11);

  let out = ddi ? `+${ddi}` : "";
  if (ddd) out += (out ? " " : "") + ddd;
  if (mid) out += " " + mid;
  if (end) out += "-" + end;
  return out;
}

/** Valid normalized phone: DDI + DDD + 8/9-digit subscriber → 12 or 13 digits. */
export function isValidPhone(v: string): boolean {
  const d = normalizePhone(v);
  return d.length === 12 || d.length === 13;
}
