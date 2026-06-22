# Greenwald Fair Value Headline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Surface the full Greenwald fair value (`max(AV,EPV)+GV`) as a first-class headline on the Earnings Power & Asset Floor card, so readers see "floor → fair value" instead of only the most conservative zero-growth EPV.

**Architecture:** Pure presentation. Add one RSC sub-component to `EarningsPowerFloorCard.tsx` that reads already-derived fields (`strikeZone.epv.{valueFloor,base,ceilings,growthCollapsed}` + `floor.growth_value` for the collapse reason). No new engine math — the headline range IS `epv.ceilings` (the v2 value-band upper edges). Place it below the two EPV lamps and above the value band (`StrikeZoneSection`).

**Tech Stack:** Next.js (App Router, RSC — no `"use client"`), TypeScript, Tailwind with `--tt-*` brand tokens.

## Global Constraints

- **No engine math.** Read `strikeZone.epv.ceilings` / `.base` / `.valueFloor` directly. Do NOT add fields to `strikeZone.ts` or `types.ts` (YAGNI). Verbatim from spec §1/§3.
- **GV collapsed** (`epv.ceilings === undefined` / `epv.growthCollapsed`, e.g. MA/AAPL) → honest base-only reading: "≈ $base / sh (zero-growth value, no growth value credited — {reason})". Not a bug.
- **floor undefined / no strikeZone** (foreign filers) → headline does not render (gate on `strikeZone?.epv`). The page already gates the card.
- **No verdicts.** No BUY/SELL/HOLD, no price target, no rating. The headline is a *range*, not a call. Keep disclaimer wording in the card intact.
- **English-first copy** — match the card's existing English UI strings (memory: seo-english-first). Spec text is Chinese but UI must be English.
- **Reuse v2 helpers:** `perShare()`, `--tt-*` tokens, `font-mono tabular-nums`. No `"use client"`. RSC only.
- **Files touched:** ONLY `web/src/components/valuation/EarningsPowerFloorCard.tsx`. Do NOT touch engine pure functions, ingest, price layer, `page.tsx`, `strikeZone.ts`, `types.ts`.
- **Verification gate:** `npx tsc --noEmit` green. `npm run build` is expected to FAIL locally on Google Fonts (Fraunces) network block — that is environment, not code (memory: local-build-google-fonts-blocked). Local code gate = tsc.

---

### Task 1: Add the Greenwald fair value headline row

**Files:**
- Modify: `web/src/components/valuation/EarningsPowerFloorCard.tsx`

**Interfaces:**
- Consumes (already in scope, no new imports):
  - `ValuationFloor.growth_value: { assessable: boolean; gated_to_zero: boolean; not_assessable_reason?: string; ... }` (used only for the collapse reason)
  - `StrikeZoneAssessment["epv"]` (optional): `{ valueFloor: number; base: number; ceilings?: { pessimistic: number; neutral: number; optimistic: number }; growthCollapsed: boolean; ... }`
  - Existing helper `perShare(value: number | undefined): string` (already in the file)
- Produces: a new RSC component `FairValueHeadline({ floor, sz })` rendered once, gated on `strikeZone?.epv`.

- [ ] **Step 1: Add the `FairValueHeadline` component**

Insert immediately above the existing `StrikeZoneSection` function definition (around line 222, before `function StrikeZoneSection`). Add this component:

```tsx
// Spec A: full Greenwald fair value (max(AV,EPV) + growth value) as a first-class
// headline. The range IS the v2 value-band upper edges (epv.ceilings) — no new math.
// GV collapsed → honest zero-growth-only reading. RSC, no hydration.
function FairValueHeadline({ floor, sz }: { floor: ValuationFloor; sz: StrikeZoneAssessment }) {
  const epv = sz.epv;
  if (!epv) return null;

  if (!epv.ceilings) {
    const gv = floor.growth_value;
    const reason = !gv.assessable
      ? (gv.not_assessable_reason ?? "not assessable")
      : gv.gated_to_zero
        ? "no moat / ROIIC ≤ WACC"
        : "growth value not credited";
    return (
      <div className="rounded-lg border border-[var(--tt-border)] bg-[color-mix(in_srgb,var(--tt-accent)_5%,transparent)] p-4">
        <h4 className="text-xs uppercase tracking-[0.08em] text-[var(--tt-faint)]">Greenwald fair value</h4>
        <p className="mt-1 font-mono text-2xl tabular-nums text-[var(--tt-text)]">≈ {perShare(epv.base)}<span className="ml-1 text-sm text-[var(--tt-faint)]">/ sh</span></p>
        <p className="mt-1 text-sm text-[var(--tt-muted)]">
          Zero-growth value — no growth value credited ({reason}). The honest reading for a business whose moat is being harvested, not compounded.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-[var(--tt-border)] bg-[color-mix(in_srgb,var(--tt-accent)_5%,transparent)] p-4">
      <h4 className="text-xs uppercase tracking-[0.08em] text-[var(--tt-faint)]">Greenwald fair value</h4>
      <p className="mt-1 font-mono text-2xl tabular-nums text-[var(--tt-text)]">
        {perShare(epv.ceilings.pessimistic)} – {perShare(epv.ceilings.optimistic)}
        <span className="ml-1 text-sm text-[var(--tt-faint)]">/ sh</span>
      </p>
      <p className="mt-1 text-sm text-[var(--tt-muted)]">
        Floor {perShare(epv.valueFloor)} → zero-growth value {perShare(epv.base)} → fair value incl. moat-driven growth (neutral{" "}
        <strong className="font-mono tabular-nums text-[var(--tt-text)]">{perShare(epv.ceilings.neutral)}</strong>).
      </p>
      <p className="mt-1 text-xs text-[var(--tt-faint)]">
        A conservative→optimistic range, not a price target or recommendation.
      </p>
    </div>
  );
}
```

- [ ] **Step 2: Render the headline below the lamps, above the value band**

In `EarningsPowerFloorCard`, find the line that renders the strike-zone section:

```tsx
        {strikeZone ? <StrikeZoneSection floor={floor} sz={strikeZone} /> : null}
```

Insert the headline immediately before it:

```tsx
        {strikeZone?.epv ? <FairValueHeadline floor={floor} sz={strikeZone} /> : null}
        {strikeZone ? <StrikeZoneSection floor={floor} sz={strikeZone} /> : null}
```

- [ ] **Step 3: Type-check**

Run: `cd web && npx tsc --noEmit`
Expected: exits 0, no errors. (`ValuationFloor` and `StrikeZoneAssessment` are already imported at the top of the file; `perShare` already exists. No new imports needed.)

- [ ] **Step 4: Real-data render QA (no browser build needed)**

Confirm the two branches against real tickers without invoking the font-blocked Next build. Use the existing valuation loader via a throwaway tsx snippet (per memory local-build-google-fonts-blocked), or inspect a page if a dev server is already up. Expect:
  - MSFT / GOOG (GV > 0): headline shows `Greenwald fair value $X – $Y / sh` with neutral bolded and `Floor … → zero-growth value … → fair value incl. moat-driven growth`.
  - MA / AAPL (GV collapsed): headline shows `≈ $base / sh` and `Zero-growth value — no growth value credited (…)`.

If a quick programmatic check is impractical (loader needs DB/network), record that tsc is the gate and the branch logic mirrors the already-shipped `StrikeBand`/`growthSummary` gating on `epv.ceilings`, then proceed.

- [ ] **Step 5: Commit**

```bash
cd /Users/junlinzhu/Desktop/yangyang-code/ny-fed-monitor/.claude/worktrees/greenwald-fairvalue-impl
git add web/src/components/valuation/EarningsPowerFloorCard.tsx docs/superpowers/
git commit -m "feat(valuation): headline full Greenwald fair value (max(AV,EPV)+GV)

Surface fair value range (= v2 value-band ceilings) as a first-class headline
below the EPV lamps; GV collapsed → honest zero-growth-only reading. Pure
presentation, no engine changes. Spec A.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```
