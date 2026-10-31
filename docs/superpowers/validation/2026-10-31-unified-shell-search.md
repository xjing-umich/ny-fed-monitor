# Shared shell and search validation — 2026-10-31

Scope: apply the released A5 brand to the shared shell and reuse one global search across hero/header/mobile menu. Keep research density, financial meanings and all data/model/publishing boundaries. The stock list validates the change. Target branch: db-foundation. No merge/release authorization for this pass.

## Verification

- Shared match, nav and language fixtures passed. Exact short codes rank before the eight-result limit; Chinese aliases, empty results and keyboard wrap are covered.
- Stock-list strike-zone badge and consensus-list positive/negative/zero render fixtures passed. Positive signals remain semantic green while brand controls are blue.
- Existing home reader/snapshot/search and stock first-screen/link regressions passed; list-query suite passed.
- TypeScript and changed-file ESLint passed; all prebuild gates passed. Production build generated851pages. Final build repeated after the review fix and synchronization of upstream2eec99b.
- Browser:84 combinations across zh/en ×375/768/1440 ×light/dark ×home/stocks/investors/stockdetail/investordetail/screener/learn; zero page runtime errors.
-17 interaction assertions cover shared exact/alias lookup, unknown-query behavior, arrow/Escape, local filter/sort/page, locale query/hash preservation, menu focus/route closure and a single homepage search.
- Additional targeted checks:320/1024 English header fits; composing Enter does not navigate; changing query resets selection; route changes clear header search; desktop breakpoint closes mobile menu; mobile search Enter navigates and closes menu; short viewport keeps results scrollable.
- Native dialog Tab traversal reaches only modal controls and browser chrome; page controls remain inert. Close restores the invoking button. Browser-chrome focus reports body as activeElement and is not a page-focus escape.

Browser runners: [matrix](2026-10-31-unified-shell-search/matrix.js), [interactions](2026-10-31-unified-shell-search/interactions.js). They run via the existing Playwright MCP page; localhost3114 is the local target. Internal traffic marker is set. No business writes are performed.

## Review

One fresh independent whole-branch review at25d1580 found no Critical, one Important and one Minor. Important: positive consensus holder deltas still inherited brand blue; reproduced in rendered fixture, then switched to tt-positive and passed the whole targeted fixture suite10/10 plus list-query checks. No second reviewer dispatched.

Reviewer independently inspected source/diff/fixtures; browser attachment was unavailable because the executor owned the profile. Runtime evidence is executor supplied.

Deferred minor: native dialog backdrop wheel containment is progressive. Some browsers can move the inert background while the menu is open. Focus containment/close/return work; no stale overlay or body lock remains. Followed Modern Web Guidance's prescribed dialog/backdrop overscroll rules rather than adding root overflow mutation.

## Scope rulings and residual cost

1. External financial/market freshness is not re-audited by UI fixtures. Existing source/date disclosures remain; a pre-existing stale-data issue could remain undetected.
2. Valuation model accuracy, subscription and database publication correctness are unchanged and excluded; pre-existing defects in those workflows could remain.
3. Unused legacy ValueBandCard redesign is excluded; future reuse may need a styling pass.
4. Other existing modals are excluded because only the common shell menu changed; unrelated modal defects could remain.
5. Exhaustive Safari/iOS/assistive-technology certification is not claimed; platform-specific behavior could differ from verified Chromium behavior.

## Release status

PR and preview status will be recorded after creation. Preserve local worktree/preview for iteration. Do not merge automatically.
