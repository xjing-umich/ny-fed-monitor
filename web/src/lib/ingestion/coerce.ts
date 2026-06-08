/**
 * coerce.ts — pure value coercion helpers for ingestion.
 *
 * Deliberately free of `server-only` so pure transforms (and their tsx
 * self-checks) can reuse them. `common.ts` re-exports these for back-compat.
 */

export function toFloat(value: unknown): number | null {
  if (value === null || value === undefined || value === "" || value === "*" || value === "null") {
    return null;
  }
  const parsed = Number(String(value).replace(",", "").replace("%", ""));
  return Number.isFinite(parsed) ? parsed : null;
}

export function toDate(value: unknown): string | null {
  if (!value || value === "null") return null;
  const text = String(value).trim();
  if (!text) return null;
  return text.slice(0, 10);
}
