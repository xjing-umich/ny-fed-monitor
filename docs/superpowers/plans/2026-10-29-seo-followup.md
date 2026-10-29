# SEO follow-up implementation plan

> Execute inline in the existing `fix/seo-followup` worktree. The user requested continuation on 2026-10-29.

**Goal:** Complete the outstanding SEO accuracy, metadata and directory payload fixes from the restored SEO audit.

**Architecture:** Reuse current request-cached manager, consensus and security metadata. Keep canonical URLs, complete SSR directories, list interactions and existing freshness rules. No database changes or additional data queries.

**Tech stack:** Next.js 16.2.6, React 19, TypeScript.

**Scope:** Existing audit follow-ups only; homepage redesign and Learn regrouping remain outside this change.

## Constraints and review focus

- Apply `web/docs/copy-voice.md` independently to English and Chinese.
- Identify funds from stored security metadata, with explicit ETF names as fallback; do not classify REITs as funds.
- Source links must identify actual reporting managers; never invent accession numbers absent from snapshots.
- Counts and quarters in metadata must come from the same data and predicates as the rendered page; empty states must not fabricate a quarter.
- All directory links and their visible labels must remain server rendered, sorted and escaped.
- Compare payloads using the same local server and data before/after; production and development sizes are not comparable.

## Tasks

- [x] Schema accuracy: extend `web/src/lib/seo.check.ts` with fund/stock/unknown classification and source URL deduplication tests; observe failure, then implement in `seo.ts` and connect stock/investor pages.
- [x] Metadata: improve `/investors`, `/stocks`, `/learn` titles/descriptions using existing counts/quarter and concrete content; remove repeated About brand. Share each page's description with its CollectionPage JSON-LD.
- [x] Directory payload: measure baseline, replace per-row client links and repeated styling in `LinkDirectory.tsx` with native anchors and inherited styles; preserve full labels and links. Trim unused bargain price dates from table props.
- [x] Verify: SEO checks, existing format/freshness/list checks, TypeScript, targeted lint, token/type/ISR gates, local HTTP and browser checks in both languages, directory count/order and byte comparison. Review complete diff before handoff.

## Execution record

- Base: `5c351dd` (`origin/db-foundation` fetched 2026-10-29).
- Current production issues were observed on 2026-10-29; production values are evidence, never hardcoded as metadata.
- User authorized automatic PR creation after passing code review on 2026-10-29; push and PR creation proceed under that authorization. No merge or production workflow is authorized by that preference.
- Verified 2026-10-29 against the local dev server and its current Supabase read sources: `/stocks` 1,577,229 → 883,595 bytes; `/zh/stocks` 1,593,457 → 899,834 bytes. Both retain exactly the same 1,204 directory hrefs, labels and order. These are development HTML measurements, not production transfer sizes.
- Local HTTP checks cover en/zh list, Learn and About metadata plus AAPL, SPY and Berkshire details. Descriptions fit the existing 160-width convention; CollectionPage descriptions match meta descriptions. SPY is InvestmentFund, AAPL remains Corporation; stock Dataset sources identify actual holders' filing lists. Berkshire Dataset identifies its actual accession directory.
- Browser checks: hydrated stock search returns AAPL (1 of 1,204); native directory links remain 1,204; mobile anchors are inline-flex with 44px minimum height and preserved label styling; desktop directory has three columns.
- Passed: SEO, LinkDirectory, format, freshness, OpenFIGI and list-query checks; TypeScript; token/type/ISR gates; targeted lint on all changed files except the existing investor-list failure; `next build --experimental-build-mode compile` (compilation only, not full prerender generation).
- Existing issues, not changed: investor list `Date.now()` triggers react-hooks/purity (also reproduced by linting HEAD through stdin); Chinese BRK.A/BRK.B long names overflow at 375px inside the untouched StocksTable security-cell wrapper. Directory layout is not the source of that overflow.
- Independent whole-diff review completed: no actionable correctness or regression findings.

- Before PR creation, rebased onto `33785ac` (merged i18n PR #249). Retained its localized dates and quarter labels; resolved the React import conflict in the stocks hub.
