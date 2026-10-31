/** SEC acceptance time is the chronology clock; accession prefixes identify filers, not time. */
export function acceptedTime(value?: string | null): number | undefined {
  if (!value || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(value)) return undefined;
  const time = Date.parse(value);
  return Number.isFinite(time) ? time : undefined;
}
export function normalizedAcceptance(value?: string | null): string | null {
  const time = acceptedTime(value);
  return time == null ? null : new Date(time).toISOString();
}
