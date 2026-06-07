# Homepage Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the Compounder homepage into a compact, fast "signal stream" — remove the hero, add NEW/ADD/EXIT/TRIM change-type tags to Notable Moves, de-emphasize macro to a link, and convert the page from an external-API-blocking dynamic page to a quarterly-revalidated static page.

**Architecture:** A small data-layer addition (`dominantKind`/`dominant_kind`) computed at the pure-function level threads the position-change type from manager filings up to the homepage. The page itself drops `buildAllSections()` (the external NY Fed/Treasury fetch), drops `force-dynamic` for ISR, parallelizes its two remaining cheap reads, and renders tags via a server-safe `MoveTag`. Header search becomes the sole search entry point.

**Tech Stack:** Next.js 16 (App Router, RSC), React 19, TypeScript, Tailwind v4, Supabase (optional; bundled JSON fallback), Vitest.

**Testing policy for this plan (UPDATED — user directive):** This project has **no tests**. Do **NOT** write or run any Vitest tests. **Skip every "Write/Run the test" step** below (Task 1 Steps 1–2 & 4, Task 2 Steps 1–2 & 4, Task 3 Steps 1–2 & 4). For each task, implement the code change directly and verify with `npx tsc --noEmit` (+ the manual dev check in Task 4). Existing `*.test.ts` files are not maintained — if `tsc` flags a type error inside an existing test file caused by a shape change, fix the literal minimally so `tsc` passes; otherwise leave test files alone.

**Pre-flight (read before coding):** This repo runs a modified Next.js. Per `web/AGENTS.md`, before writing page/ISR code, skim the relevant guide under `web/node_modules/next/dist/docs/` for `revalidate` / route segment config to confirm the ISR API shape.

---

## File Structure

| File | Responsibility | Action |
|------|----------------|--------|
| `web/src/lib/consensus/compute.ts` | Pure consensus aggregation; add `dominant_kind` to move rows | Modify |
| `web/src/lib/consensus/compute.test.ts` | Unit tests for the above | Modify |
| `web/src/lib/aggregations.ts` | In-memory fallback aggregation; add `dominantKind` to `MoveRow` + `computeNotableMoves` | Modify |
| `web/src/lib/__tests__/aggregations.test.ts` | Unit tests for the above | Modify |
| `web/src/lib/managers/consensusRead.ts` | Supabase read/mapping; select + map `dominant_kind`, safe default | Modify |
| `web/src/lib/managers/consensusRead.test.ts` | Unit tests for the mapping | Modify |
| `web/supabase/schema.sql` | `consensus_moves` gains `dominant_kind` column | Modify |
| `web/src/components/shell/MoveTag.tsx` | Server-safe tag chip (NEW/ADD/EXIT/TRIM) | Create |
| `web/src/app/[lang]/page.tsx` | Homepage rewrite (no hero, no macro fetch, ISR, Promise.all, tags, stacked, macro link) | Modify (major) |
| `web/src/components/shell/SearchBox.tsx` | Widen default variant (header search) | Modify |

---

## Task 1: Add `dominant_kind` to consensus pure compute

**Files:**
- Modify: `web/src/lib/consensus/compute.ts`
- Test: `web/src/lib/consensus/compute.test.ts`

- [ ] **Step 1: Update the existing test to expect `dominant_kind`**

In `web/src/lib/consensus/compute.test.ts`, replace the `moves` test (the `it("moves 按方向聚合...")` block, lines ~30-36) with this. The `scan` fixture already has C1 with `new` (m1) + `increased` (m2) → tie → stronger wins → `new`; BBB has only `exited` → `exited`:

```ts
  it("moves 按方向聚合: new/increased→bought, exited/decreased→sold", () => {
    const { moves } = computeConsensus(scan, cusipToTicker);
    const bought = moves.find((m) => m.ticker === "AAA" && m.direction === "bought");
    expect(bought).toEqual({ ticker: "AAA", direction: "bought", issuer: "Alpha Inc", manager_count: 2, net_value: 300, dominant_kind: "new" });
    const sold = moves.find((m) => m.ticker === "BBB" && m.direction === "sold");
    expect(sold?.manager_count).toBe(1);
    expect(sold?.dominant_kind).toBe("exited");
  });

  it("dominant_kind 平票时取更强信号 (new>increased, exited>decreased)", () => {
    const scanTie: ScanInput[] = [
      { slug: "m1", holdings: [], changes: [{ cusip: "C1", issuer: "Alpha Inc", kind: "increased", value: 10 }] },
      { slug: "m2", holdings: [], changes: [{ cusip: "C1", issuer: "Alpha Inc", kind: "new", value: 10 }] },
    ];
    const { moves } = computeConsensus(scanTie, cusipToTicker);
    expect(moves.find((m) => m.ticker === "AAA")?.dominant_kind).toBe("new");
  });
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd web && npx vitest run src/lib/consensus/compute.test.ts`
Expected: FAIL — `dominant_kind` is `undefined` (not yet emitted).

- [ ] **Step 3: Implement `dominant_kind` in `compute.ts`**

In `web/src/lib/consensus/compute.ts`:

(a) Add `dominant_kind` to the `ConsensusMoveRow` type (line ~10):

```ts
export type ConsensusMoveRow = { ticker: string; direction: "bought" | "sold"; issuer: string; manager_count: number; net_value: number; dominant_kind: "new" | "increased" | "exited" | "decreased" };
```

(b) Add this helper above `computeConsensus`:

```ts
type MoveKind = "new" | "increased" | "exited" | "decreased";
function dominantKind(kinds: Map<MoveKind, number>, direction: "bought" | "sold"): MoveKind {
  const [strong, weak]: MoveKind[] = direction === "bought" ? ["new", "increased"] : ["exited", "decreased"];
  // Most frequent wins; tie → stronger signal.
  return (kinds.get(weak) ?? 0) > (kinds.get(strong) ?? 0) ? weak : strong;
}
```

(c) In the moves aggregation loop, track per-kind counts. Change the `mv` map value type and the loop body (lines ~36-49) to:

```ts
  const mv = new Map<string, { issuer: string; managers: Set<string>; net: number; direction: "bought" | "sold"; kinds: Map<MoveKind, number> }>();
  for (const m of scan) {
    for (const c of m.changes) {
      const direction: "bought" | "sold" | null =
        c.kind === "new" || c.kind === "increased" ? "bought" : c.kind === "exited" || c.kind === "decreased" ? "sold" : null;
      if (!direction) continue;
      const { ticker, name } = keyOf(c.cusip, cusipToTicker);
      const k = `${ticker}|${direction}`;
      const e = mv.get(k) ?? { issuer: name ?? c.issuer, managers: new Set<string>(), net: 0, direction, kinds: new Map<MoveKind, number>() };
      e.managers.add(m.slug);
      e.net += c.value ?? 0;
      e.kinds.set(c.kind, (e.kinds.get(c.kind) ?? 0) + 1);
      mv.set(k, e);
    }
  }
```

(d) Emit `dominant_kind` in the output map (lines ~50-52):

```ts
  const moves: ConsensusMoveRow[] = [...mv.entries()]
    .map(([k, e]) => ({ ticker: k.split("|")[0], direction: e.direction, issuer: e.issuer, manager_count: e.managers.size, net_value: e.net, dominant_kind: dominantKind(e.kinds, e.direction) }))
    .sort((a, b) => b.manager_count - a.manager_count || b.net_value - a.net_value);
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd web && npx vitest run src/lib/consensus/compute.test.ts`
Expected: PASS (all blocks, including the two `dominant_kind` assertions).

- [ ] **Step 5: Commit**

```bash
cd web && git add src/lib/consensus/compute.ts src/lib/consensus/compute.test.ts
git commit -m "feat(consensus): compute dominant_kind for move rows"
```

---

## Task 2: Add `dominantKind` to in-memory aggregation fallback

**Files:**
- Modify: `web/src/lib/aggregations.ts`
- Test: `web/src/lib/__tests__/aggregations.test.ts`

- [ ] **Step 1: Add a failing test for `dominantKind`**

In `web/src/lib/__tests__/aggregations.test.ts`, replace the `computeNotableMoves` describe block (lines ~27-33) with:

```ts
describe("computeNotableMoves", () => {
  it("counts buyers (new/increased) and sellers (exited/decreased) per cusip", () => {
    const r = computeNotableMoves(scan, 10);
    expect(r.mostBought[0]).toMatchObject({ cusip: "X", issuer: "XCorp", count: 2 });
    expect(r.mostSold[0]).toMatchObject({ cusip: "Y", issuer: "YCorp", count: 1 });
  });
  it("tags each row with dominantKind (tie → stronger signal)", () => {
    const r = computeNotableMoves(scan, 10);
    // X: new (a) + increased (b) → tie → "new"; Y: exited only → "exited"
    expect(r.mostBought[0].dominantKind).toBe("new");
    expect(r.mostSold[0].dominantKind).toBe("exited");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd web && npx vitest run src/lib/__tests__/aggregations.test.ts`
Expected: FAIL — `dominantKind` is `undefined`.

- [ ] **Step 3: Implement `dominantKind` in `aggregations.ts`**

In `web/src/lib/aggregations.ts`:

(a) Add the field to `MoveRow` (line ~13):

```ts
export type MoveKind = "new" | "increased" | "exited" | "decreased";
export type MoveRow = { cusip: string; issuer: string; count: number; value: number; dominantKind: MoveKind };
```

(b) Replace `computeNotableMoves` (lines ~46-66) with a version that tallies kinds:

```ts
function dominantOf(kinds: Map<MoveKind, number>, side: "buy" | "sell"): MoveKind {
  const [strong, weak]: MoveKind[] = side === "buy" ? ["new", "increased"] : ["exited", "decreased"];
  return (kinds.get(weak) ?? 0) > (kinds.get(strong) ?? 0) ? weak : strong;
}

export function computeNotableMoves(scan: ScanRow[], limit: number): NotableMoves {
  type Agg = { issuer: string; count: number; value: number; kinds: Map<MoveKind, number> };
  const buys = new Map<string, Agg>();
  const sells = new Map<string, Agg>();
  const bump = (m: Map<string, Agg>, c: HoldingChange) => {
    const e = m.get(c.cusip) ?? { issuer: c.issuer, count: 0, value: 0, kinds: new Map<MoveKind, number>() };
    e.count += 1; e.value += c.value ?? 0;
    e.kinds.set(c.kind as MoveKind, (e.kinds.get(c.kind as MoveKind) ?? 0) + 1);
    m.set(c.cusip, e);
  };
  for (const row of scan) {
    for (const c of row.changes) {
      if (c.kind === "new" || c.kind === "increased") bump(buys, c);
      else if (c.kind === "exited" || c.kind === "decreased") bump(sells, c);
    }
  }
  const top = (m: Map<string, Agg>, side: "buy" | "sell"): MoveRow[] =>
    [...m.entries()]
      .map(([cusip, e]) => ({ cusip, issuer: e.issuer, count: e.count, value: e.value, dominantKind: dominantOf(e.kinds, side) }))
      .sort((a, b) => b.count - a.count || b.value - a.value)
      .slice(0, limit);
  return { mostBought: top(buys, "buy"), mostSold: top(sells, "sell") };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd web && npx vitest run src/lib/__tests__/aggregations.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
cd web && git add src/lib/aggregations.ts src/lib/__tests__/aggregations.test.ts
git commit -m "feat(aggregations): tag notable moves with dominantKind"
```

---

## Task 3: Thread `dominant_kind` through the Supabase read path + schema

**Files:**
- Modify: `web/src/lib/managers/consensusRead.ts`
- Test: `web/src/lib/managers/consensusRead.test.ts`
- Modify: `web/supabase/schema.sql`

Note: the DB column is additive with a safe default. If a deployment's `consensus_moves` table predates this column, the `select` would error; to stay safe and accurate, `mapMoveRows` maps a missing/null `dominant_kind` to the conservative WEAKER signal (`increased` for bought, `decreased` for sold) so the page never falsely shows NEW/EXIT.

- [ ] **Step 1: Add a failing test for the mapping**

In `web/src/lib/managers/consensusRead.test.ts`, find the test(s) covering `mapMoveRows` and add (or extend) with these assertions. Add this block inside the existing `describe` for `mapMoveRows` (if none exists, add a new `describe("mapMoveRows", ...)`):

```ts
  it("maps dominant_kind through, defaulting missing → weaker signal", () => {
    const rows = [
      { ticker: "AAA", direction: "bought", issuer: "Alpha", manager_count: 2, net_value: 300, dominant_kind: "new" },
      { ticker: "BBB", direction: "sold", issuer: "Beta", manager_count: 1, net_value: 0, dominant_kind: null },
    ];
    const { mostBought, mostSold } = mapMoveRows(rows as never);
    expect(mostBought[0].dominantKind).toBe("new");
    expect(mostSold[0].dominantKind).toBe("decreased"); // null → conservative weak sell
  });
```

Ensure the test file imports `mapMoveRows` (it likely already does). If not, add: `import { mapMoveRows } from "./consensusRead";`

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd web && npx vitest run src/lib/managers/consensusRead.test.ts`
Expected: FAIL — `dominantKind` undefined.

- [ ] **Step 3: Implement mapping + select**

In `web/src/lib/managers/consensusRead.ts`:

(a) Extend the DB row type (line ~7) and import `MoveKind`:

```ts
import type { HeldRow, MoveRow, NotableMoves, MoveKind } from "@/lib/aggregations";
```

```ts
type MoveDbRow = { ticker: string; direction: string; issuer: string; manager_count: number; net_value: number; dominant_kind: string | null };
```

(b) Replace `mapMoveRows` (lines ~14-20) to derive `dominantKind`:

```ts
export function mapMoveRows(rows: MoveDbRow[]): NotableMoves {
  const VALID: MoveKind[] = ["new", "increased", "exited", "decreased"];
  const toRow = (r: MoveDbRow): MoveRow => {
    const dk = (r.dominant_kind && VALID.includes(r.dominant_kind as MoveKind))
      ? (r.dominant_kind as MoveKind)
      : (r.direction === "bought" ? "increased" : "decreased"); // conservative weak default
    return { cusip: r.ticker, issuer: r.issuer, count: r.manager_count, value: Number(r.net_value), dominantKind: dk };
  };
  return {
    mostBought: rows.filter((r) => r.direction === "bought").map(toRow),
    mostSold: rows.filter((r) => r.direction === "sold").map(toRow),
  };
}
```

(c) Add `dominant_kind` to the `select` in `readConsensusMoves` (line ~36):

```ts
    .from("consensus_moves").select("ticker,direction,issuer,manager_count,net_value,dominant_kind")
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd web && npx vitest run src/lib/managers/consensusRead.test.ts`
Expected: PASS.

- [ ] **Step 5: Update the schema**

In `web/supabase/schema.sql`, in the `create table if not exists consensus_moves (...)` block (line ~309), add the column after `net_value`:

```sql
  net_value bigint not null default 0,
  dominant_kind text,
```

Then add a standalone idempotent migration line immediately AFTER the create-index statements for that table (after line ~319) so existing tables get the column:

```sql
alter table consensus_moves add column if not exists dominant_kind text;
```

- [ ] **Step 6: Commit**

```bash
cd web && git add src/lib/managers/consensusRead.ts src/lib/managers/consensusRead.test.ts supabase/schema.sql
git commit -m "feat(consensus): thread dominant_kind through DB read + schema"
```

- [ ] **Step 7: Re-materialize consensus (only if Supabase is configured)**

If this environment has Supabase env (`SUPABASE_URL` + `SUPABASE_SERVICE_KEY`), apply the schema migration in the Supabase SQL editor (the `alter table ... add column` line) and re-run the materializer so `dominant_kind` is populated:

Run: `cd web && npm run consensus`
Expected: `共识完成: holdings N 行, moves M 行` with no upsert errors.

If Supabase is NOT configured (homepage uses bundled JSON), skip this step — the in-memory path (Task 2) supplies `dominantKind` directly.

---

## Task 4: Homepage rewrite — MoveTag, remove hero/macro fetch, ISR, stacked layout

**Files:**
- Create: `web/src/components/shell/MoveTag.tsx`
- Modify: `web/src/app/[lang]/page.tsx`

- [ ] **Step 1: Create the `MoveTag` server-safe chip**

Create `web/src/components/shell/MoveTag.tsx`:

```tsx
import type { MoveKind } from "@/lib/aggregations";

const MAP: Record<MoveKind, { label: string; solid: boolean; tone: "buy" | "sell" }> = {
  new: { label: "NEW", solid: true, tone: "buy" },
  increased: { label: "ADD", solid: false, tone: "buy" },
  exited: { label: "EXIT", solid: true, tone: "sell" },
  decreased: { label: "TRIM", solid: false, tone: "sell" },
};

/** Compact buy/sell change-type chip. Green = buy, red = sell; solid = strong (NEW/EXIT). */
export default function MoveTag({ kind }: { kind: MoveKind }) {
  const cfg = MAP[kind];
  const cls = cfg.tone === "buy"
    ? (cfg.solid ? "bg-emerald-600 text-white" : "border border-emerald-600/60 text-emerald-700 dark:text-emerald-400")
    : (cfg.solid ? "bg-rose-600 text-white" : "border border-rose-600/60 text-rose-700 dark:text-rose-400");
  return (
    <span className={`inline-block rounded-sm px-1.5 py-0.5 font-mono text-[9px] font-semibold uppercase tracking-[0.08em] leading-none ${cls}`}>
      {cfg.label}
    </span>
  );
}
```

Note on palette: the spec said "no new palette", but red/green is universal buy/sell semantics and Tailwind's `emerald`/`rose` are already available in v4 — this is the one intentional exception, scoped to tags only. If the brand later adds `--tt-pos`/`--tt-neg` tokens, swap these classes.

- [ ] **Step 2: Rewrite `page.tsx`**

Replace the entire contents of `web/src/app/[lang]/page.tsx` with:

```tsx
import { notFound } from "next/navigation";
import Link from "next/link";
import type { Metadata } from "next";
import { getManagerIndex } from "@/lib/managers/source";
import { mostHeld, notableMoves, type MoveRow } from "@/lib/aggregations";
import { formatUSD } from "@/lib/format";
import { investorPath, stockPath } from "@/lib/urls";
import type { Lang } from "@/lib/nav";
import MoveTag from "@/components/shell/MoveTag";

// 13F data updates quarterly; revalidate hourly so the page is statically cached
// and served from the CDN instead of blocking on per-request work.
export const revalidate = 3600;

// ── Metadata ─────────────────────────────────────────────────────────────────

export async function generateMetadata({
  params,
}: {
  params: Promise<{ lang: string }>;
}): Promise<Metadata> {
  const { lang } = await params;
  const l = lang === "en" ? "en" : "zh";
  const title =
    l === "zh"
      ? "Compounder · 复利 — 超级投资者持仓 × 个股估值 × 宏观"
      : "Compounder — Smart-money holdings × valuation × macro";
  const description =
    l === "zh"
      ? "追踪巴菲特等顶级投资者的 SEC 13F 季度持仓、跨机构共识与宏观流动性信号。数据来源 SEC EDGAR / NY Fed。"
      : "Track top investors' SEC 13F holdings, cross-fund consensus, and macro funding signals. Sources: SEC EDGAR / NY Fed.";
  return {
    title,
    description,
    alternates: { canonical: `/${l}`, languages: { en: "/en", "zh-CN": "/zh", "x-default": "/en" } },
  };
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function titleCase(s: string): string {
  return s.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase()).trim();
}

// ── Page ────────────────────────────────────────────────────────────────────────

export default async function HomePage({
  params,
}: {
  params: Promise<{ lang: string }>;
}) {
  const { lang: rawLang } = await params;
  if (rawLang !== "zh" && rawLang !== "en") notFound();
  const lang = rawLang as Lang;
  const isZh = lang === "zh";

  // Two cheap reads in parallel (Supabase or bundled JSON). No external APIs.
  const [idx, moves, held] = await Promise.all([
    getManagerIndex(),
    notableMoves(6),
    mostHeld(8),
  ]);

  const topManagers = [...(idx.managers ?? [])].sort((a, b) => b.totalValue - a.totalValue);
  const period = topManagers[0]?.period ?? "";
  const topInvestors = topManagers.slice(0, 8);

  const ld = {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: "Compounder",
    alternateName: "复利",
    url: "https://thecompounder.fyi",
    logo: "https://thecompounder.fyi/icon.png",
    image: "https://thecompounder.fyi/icon.png",
    description: isZh
      ? "聚合超级投资者 13F 持仓、个股估值与宏观流动性。"
      : "Smart-money 13F holdings, single-stock valuation, and the macro funding backdrop.",
  };

  return (
    <div className="mx-auto max-w-5xl px-2 py-8 sm:py-10">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(ld) }} />

      {/* ── Dateline (replaces hero) ─────────────────────────────────── */}
      <div className="border-b border-[var(--tt-border)] pb-3">
        <p className="font-mono text-[11px] uppercase tracking-[0.1em] text-[var(--tt-muted)]">
          {isZh
            ? `截至 ${period} · ${topManagers.length} 位投资者 · 数据来源 SEC 13F · 45 天延迟`
            : `As of ${period} · ${topManagers.length} investors · SEC 13F · 45-day lag`}
        </p>
      </div>

      {/* ── Notable moves — lead, with change-type tags ──────────────── */}
      {(moves.mostBought.length > 0 || moves.mostSold.length > 0) && (
        <section className="mt-8">
          <h2 className="font-display text-2xl font-medium tracking-tight text-[var(--tt-text)] sm:text-3xl">
            {isZh ? "本季显著动向" : "Notable moves this quarter"}
          </h2>
          <div className="mt-5 grid grid-cols-1 gap-x-10 gap-y-8 border-t border-[var(--tt-border)] pt-5 md:grid-cols-2">
            {moves.mostBought.length > 0 && (
              <MoveColumn lang={lang} title={isZh ? "本季最多人增持" : "Most bought"} rows={moves.mostBought} />
            )}
            {moves.mostSold.length > 0 && (
              <MoveColumn lang={lang} title={isZh ? "本季最多人减持" : "Most sold"} rows={moves.mostSold} />
            )}
          </div>
        </section>
      )}

      {/* ── Consensus holdings (stacked, mobile-first) ───────────────── */}
      {held.length > 0 && (
        <section className="mt-12">
          <BlockHeading title={isZh ? "共识持仓" : "Consensus holdings"} href={`/${lang}/stocks`} isZh={isZh} />
          <table className="mt-4 w-full border-collapse text-sm">
            <tbody>
              {held.map((row) => (
                <tr key={row.cusip} className="border-b border-[var(--tt-border)] transition-colors hover:bg-[var(--tt-surface)]">
                  <td className="py-2.5 pr-4">
                    <Link href={stockPath(lang, row.cusip)} className="font-display font-medium text-[var(--tt-text)] no-underline transition-colors hover:text-[var(--tt-accent)]">
                      {titleCase(row.issuer)}
                    </Link>
                  </td>
                  <td className="py-2.5 pr-4 text-right font-mono text-xs tabular-nums text-[var(--tt-muted)]">
                    {isZh ? `${row.holderCount} 位` : `${row.holderCount}`}
                  </td>
                  <td className="py-2.5 text-right font-mono text-xs tabular-nums text-[var(--tt-muted)]">
                    {formatUSD(row.totalValue)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {/* ── Investors (compact; detail pages stay rich) ──────────────── */}
      {topInvestors.length > 0 && (
        <section className="mt-12">
          <BlockHeading title={isZh ? "投资者" : "Investors"} href={`/${lang}/investors`} isZh={isZh} />
          <table className="mt-4 w-full border-collapse text-sm">
            <tbody>
              {topInvestors.map((m) => (
                <tr key={m.cik} className="border-b border-[var(--tt-border)] transition-colors hover:bg-[var(--tt-surface)]">
                  <td className="py-2.5 pr-4">
                    <Link href={investorPath(lang, m.slug)} className="font-display font-medium text-[var(--tt-text)] no-underline transition-colors hover:text-[var(--tt-accent)]">
                      {m.person}
                    </Link>
                    <span className="ml-2 truncate text-[11px] text-[var(--tt-faint)]">{titleCase(m.topHolding)}</span>
                  </td>
                  <td className="py-2.5 pr-4 text-right font-mono text-xs tabular-nums text-[var(--tt-muted)]">{m.holdingCount}</td>
                  <td className="py-2.5 text-right font-mono text-xs tabular-nums text-[var(--tt-text)]">{formatUSD(m.totalValue)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {/* ── Macro / Liquidity — de-emphasized to a single link ───────── */}
      <section className="mt-12 border-t border-[var(--tt-border)] pt-5">
        <Link href={`/${lang}/macro`} className="group flex items-baseline justify-between no-underline">
          <span className="font-display text-base font-medium text-[var(--tt-text)] transition-colors group-hover:text-[var(--tt-accent)]">
            {isZh ? "宏观 / 流动性" : "Macro / Liquidity"}
          </span>
          <span className="font-mono text-[11px] uppercase tracking-[0.08em] text-[var(--tt-accent)] group-hover:underline">
            {isZh ? "资金面与流动性信号 →" : "Funding & liquidity signals →"}
          </span>
        </Link>
      </section>

      <p className="mt-12 border-t border-[var(--tt-border)] pt-6 text-xs text-[var(--tt-faint)]">
        {isZh
          ? "数据来源：SEC EDGAR 13F 季度报告、纽约联储。持仓数据存在 45 天延迟，仅供参考。"
          : "Sources: SEC EDGAR 13F quarterly filings, NY Fed. Holdings data has a 45-day lag and is for reference only."}
      </p>
    </div>
  );
}

// ── Sub-components (server-safe; CSS hover only) ──────────────────────────────

function BlockHeading({ title, href, isZh }: { title: string; href: string; isZh: boolean }) {
  return (
    <div className="flex items-baseline justify-between border-b border-[var(--tt-border)] pb-2">
      <h2 className="font-display text-xl font-medium tracking-tight text-[var(--tt-text)]">{title}</h2>
      <Link href={href} className="font-mono text-[11px] uppercase tracking-[0.08em] text-[var(--tt-accent)] no-underline hover:underline">
        {isZh ? "查看全部 →" : "View all →"}
      </Link>
    </div>
  );
}

function MoveColumn({ lang, title, rows }: { lang: Lang; title: string; rows: MoveRow[] }) {
  const isZh = lang === "zh";
  return (
    <div>
      <h3 className="text-[11px] font-medium uppercase tracking-[0.12em] text-[var(--tt-muted)]">{title}</h3>
      <table className="mt-3 w-full border-collapse text-sm">
        <tbody>
          {rows.map((row) => (
            <tr key={row.cusip} className="border-b border-[var(--tt-border)] transition-colors hover:bg-[var(--tt-surface)]">
              <td className="py-2.5 pr-3">
                <span className="flex items-center gap-2">
                  <MoveTag kind={row.dominantKind} />
                  <Link href={stockPath(lang, row.cusip)} className="font-display font-medium text-[var(--tt-text)] no-underline transition-colors hover:text-[var(--tt-accent)]">
                    {titleCase(row.issuer)}
                  </Link>
                </span>
              </td>
              <td className="py-2.5 pr-4 text-right font-mono text-xs tabular-nums text-[var(--tt-muted)]">
                {isZh ? `${row.count} 位` : `${row.count} inv`}
              </td>
              <td className="py-2.5 text-right font-mono text-xs tabular-nums text-[var(--tt-muted)]">
                {formatUSD(row.value)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
```

Key deltas vs. the old file: removed `buildAllSections`, `sectionLabel`, `macroPath`, `MACRO_GROUPS`, `SearchBox`, the hero `<section>`, the macro-snapshot table, all `heroItems`/`macroItems`/`macroSignals` computation; `force-dynamic` → `revalidate = 3600`; sequential awaits → `Promise.all`; Notable Moves rows now render `<MoveTag>`; Consensus + Investors are separate stacked sections (no `lg:grid-cols-2`).

- [ ] **Step 3: Type-check**

Run: `cd web && npx tsc --noEmit`
Expected: no errors. (Confirms removed imports aren't referenced and `MoveRow.dominantKind` flows correctly.)

- [ ] **Step 4: Manual verification in dev**

Run: `cd web && npm run dev`
Then open `http://localhost:3000/en` and confirm:
- No Buffett-quote hero, no large search box; page opens directly on the dateline + Notable Moves.
- Notable Moves rows show NEW/ADD/EXIT/TRIM chips (green buys, red sells; solid for NEW/EXIT).
- Consensus Holdings and Investors are stacked vertically; resize to mobile width — single column, readable.
- "Macro / Liquidity" link row present; clicking goes to `/en/macro`.
- Check `/zh` renders the Chinese strings.
- Open DevTools Network, reload: confirm NO requests to NY Fed / Treasury domains from the homepage render.

- [ ] **Step 5: Commit**

```bash
cd web && git add src/app/[lang]/page.tsx src/components/shell/MoveTag.tsx
git commit -m "feat(home): compact signal stream — tags, no hero, macro link, ISR"
```

---

## Task 5: Strengthen the header search

**Files:**
- Modify: `web/src/components/shell/SearchBox.tsx`

Now that the hero search is gone, the header search is the only search entry point and should read as primary. Minimal, low-risk change: widen the default-variant input.

- [ ] **Step 1: Widen the default input**

In `web/src/components/shell/SearchBox.tsx`, in the `<input>` `className` array (line ~102), change the default-variant width from `w-36` to `w-56`:

```ts
            isHero ? "w-full flex-1 text-base" : "w-56 text-xs",
```

And widen the results dropdown to match — in the dropdown container `className` (line ~111), change `w-64` to `w-72`:

```ts
            isHero ? "w-full" : "w-72",
```

- [ ] **Step 2: Type-check**

Run: `cd web && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Manual verification**

In the running dev server, confirm the header search input is visibly wider and the typeahead dropdown still aligns under it on desktop. (No mobile change — header is `hidden md:flex`; mobile uses the drawer.)

- [ ] **Step 4: Commit**

```bash
cd web && git add src/components/shell/SearchBox.tsx
git commit -m "feat(search): widen header search as primary entry point"
```

---

## Task 6: Full verification sweep

**Files:** none (verification only)

- [ ] **Step 1: (skipped — no tests in this project)**

- [ ] **Step 2: Type-check the whole project**

Run: `cd web && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Lint**

Run: `cd web && npm run lint`
Expected: no new errors in the touched files.

- [ ] **Step 4: Production build smoke test**

Run: `cd web && npm run build`
Expected: build succeeds; the `/[lang]` route is reported as ISR/static (revalidate 3600), not `ƒ (Dynamic)`. If the build output still marks it dynamic, recheck that `export const dynamic = "force-dynamic"` was fully removed and nothing in the render forces dynamic.

- [ ] **Step 5: Final manual pass (light + dark, both langs)**

In dev, verify `/en` and `/zh` in both light and dark themes:
- MoveTag colors are legible in dark mode (emerald/rose dark variants).
- No layout overflow on mobile widths.

---

## Self-Review Notes (addressed)

- **Spec coverage:** hero removal ✓ (Task 4), header search ✓ (Task 5), NEW/ADD/EXIT/TRIM tags ✓ (Tasks 1–4), macro de-emphasis + no `buildAllSections` ✓ (Task 4), ISR + Promise.all ✓ (Task 4), stacked layout ✓ (Task 4), `dominantKind` data layer + Supabase path + schema ✓ (Tasks 1–3).
- **Type consistency:** `MoveKind` defined in `aggregations.ts`, imported by `consensusRead.ts` and `MoveTag.tsx`; `dominant_kind` (snake, DB/compute) vs `dominantKind` (camel, app `MoveRow`) boundary is crossed exactly once, in `mapMoveRows`. `MoveRow` now carries `dominantKind` everywhere it's produced (`computeNotableMoves` + `mapMoveRows`).
- **Header-search safety:** header items come from `layout.tsx` (`getManagerIndex` + static `MACRO_GROUPS`), independent of the homepage's removed `buildAllSections` — confirmed during planning.
- **Fallback safety:** missing `dominant_kind` from an un-migrated DB maps to the conservative weaker signal, never a false NEW/EXIT.
