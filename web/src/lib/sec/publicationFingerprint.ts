import { createHash } from "node:crypto";

/** Hash normalized financial values, excluding bulky provenance and database timestamps. */
export function financialPublicationFingerprint(
  cik: string,
  periods: object[],
  filings: object[],
  interim?: object[],
): string {
  const stableRows = (rows: object[]) =>
    rows
      .map((row) =>
        Object.fromEntries(
          Object.entries(row)
            .filter(
              ([key]) =>
                !["raw_facts", "updated_at", "created_at"].includes(key),
            )
            .sort(([a], [b]) => a.localeCompare(b)),
        ),
      )
      .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
  return createHash("sha256")
    .update(
      JSON.stringify({
        cik,
        periods: stableRows(periods),
        filings: stableRows(filings),
        ...(interim?.length ? { interim: stableRows(interim) } : {}),
      }),
    )
    .digest("hex");
}
