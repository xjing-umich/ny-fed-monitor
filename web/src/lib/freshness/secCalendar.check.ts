import assert from "node:assert/strict";
import { nextSecBusinessDay } from "./secCalendar";

// SEC EDGAR 2026 calendar + OPM observed holidays, checked 2026-10-31.
// Literal expected dates: no holiday arithmetic reused from the implementation.
for (const [closed, next] of [
  ["2026-01-01", "2026-01-02"], ["2026-01-19", "2026-01-20"],
  ["2026-02-16", "2026-02-17"], ["2026-05-25", "2026-05-26"],
  ["2026-06-19", "2026-06-22"], ["2026-07-03", "2026-07-06"],
  ["2026-09-07", "2026-09-08"], ["2026-10-12", "2026-10-13"],
  ["2026-11-11", "2026-11-12"], ["2026-11-26", "2026-11-27"],
  ["2026-12-25", "2026-12-28"],
  ["2027-02-14", "2027-02-16"], // Sunday then Washington's Birthday.
  ["2027-12-31", "2028-01-03"], // Next year's Saturday New Year observed in prior year.
  ["2022-06-19", "2022-06-21"], // Sunday holiday observed on Monday.
  ["2021-06-18", "2021-06-21"], // First federal Juneteenth observance.
  ["2020-06-19", "2020-06-19"], // Not a federal holiday before 2021.
  ["2026-04-03", "2026-04-03"], // Good Friday: exchange holiday, EDGAR business day.
  ["2026-11-16", "2026-11-16"], // Normal Q3 deadline stays unchanged.
]) {
  const date = new Date(`${closed}T00:00:00Z`);
  assert.equal(nextSecBusinessDay(date).toISOString(), `${next}T00:00:00.000Z`, closed);
  assert.equal(date.toISOString(), `${closed}T00:00:00.000Z`, "do not mutate input");
}
assert.equal(nextSecBusinessDay(new Date("2027-02-15T23:30:00Z")).toISOString(), "2027-02-16T23:30:00.000Z", "UTC arithmetic preserves the time across the holiday");
assert.throws(() => nextSecBusinessDay(new Date(NaN)), RangeError, "invalid date must not loop");
assert.throws(() => nextSecBusinessDay(new Date(8.64e15)), RangeError, "rollover beyond the finite Date range must not loop");
console.log("secCalendar.check OK (federal/observed holidays, cross-year, market-calendar separation)");
