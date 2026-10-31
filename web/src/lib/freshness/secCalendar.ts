/**
 * Recurring federal closures used by modern EDGAR, not an exchange-trading calendar.
 * Sources checked 2026-10-31:
 * https://www.sec.gov/submit-filings/filer-support-resources/edgar-calendar
 * https://www.opm.gov/policy-data-oversight/pay-leave/federal-holidays/
 * Exceptional SEC closures are not inferred from market holidays.
 */
const DAY = 86_400_000;
const calendars = new Map<number, ReadonlySet<number>>();
const day = (year: number, month: number, date: number) => new Date(Date.UTC(year, month, date));

function nthWeekday(year: number, month: number, weekday: number, nth: number): number {
  return Date.UTC(year, month, 1 + (weekday - day(year, month, 1).getUTCDay() + 7) % 7 + 7 * (nth - 1));
}

function observed(year: number, month: number, date: number): number {
  const d = day(year, month, date);
  const weekday = d.getUTCDay();
  return d.getTime() + (weekday === 6 ? -DAY : weekday === 0 ? DAY : 0);
}

function holidays(year: number): ReadonlySet<number> {
  const cached = calendars.get(year);
  if (cached) return cached;
  const dates = new Set([
    observed(year, 0, 1),
    // A Saturday Jan 1 closes the preceding Dec 31.
    observed(year + 1, 0, 1),
    nthWeekday(year, 1, 1, 3), // Washington's Birthday.
    day(year, 5, 0).getTime() - ((day(year, 5, 0).getUTCDay() + 6) % 7) * DAY, // Last Monday in May.
    observed(year, 6, 4),
    nthWeekday(year, 8, 1, 1), // Labor Day.
    nthWeekday(year, 9, 1, 2), // Columbus Day.
    observed(year, 10, 11),
    nthWeekday(year, 10, 4, 4), // Thanksgiving.
    observed(year, 11, 25),
  ]);
  if (year >= 1986) dates.add(nthWeekday(year, 0, 1, 3)); // MLK federal observance.
  if (year >= 2021) dates.add(observed(year, 5, 19));
  calendars.set(year, dates);
  return dates;
}

/** Roll a nominal SEC date to the next filing business day, preserving UTC time. */
export function nextSecBusinessDay(date: Date): Date {
  let result = new Date(date.getTime());
  for (;;) {
    if (!Number.isFinite(result.getTime())) throw new RangeError("Invalid SEC filing date");
    const weekday = result.getUTCDay();
    const midnight = Date.UTC(result.getUTCFullYear(), result.getUTCMonth(), result.getUTCDate());
    if (weekday !== 0 && weekday !== 6 && !holidays(result.getUTCFullYear()).has(midnight)) return result;
    result = new Date(result.getTime() + DAY);
  }
}
