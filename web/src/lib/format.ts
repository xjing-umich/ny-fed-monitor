/**
 * Returns "up" if value starts with "+", "down" if value starts with "-" followed by a digit,
 * null otherwise (unsigned numbers, "Unavailable", etc.).
 */
export function trendDirection(value: string | undefined | null): "up" | "down" | null {
  if (value == null) return null;
  const s = String(value);
  if (s.startsWith("+")) return "up";
  // "-$3.4 billion", "-3.4", etc. — any leading minus that is followed by a non-letter
  if (/^-[^a-zA-Z]/.test(s)) return "down";
  return null;
}
