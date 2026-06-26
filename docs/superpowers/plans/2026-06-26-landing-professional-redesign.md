# Landing Professional Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild `web/src/app/[lang]/page.tsx` into a hybrid institution-grade front page — a marketing hero with a live-data proof module on top, the existing living-data tables below — telling the arc "who's buying → what they own → what it's worth."

**Architecture:** Decompose the page into focused server components (`HeroMasthead`, `TrackedInvestorsWall`, `ValuationShowcase`) plus an optional client motion wrapper (`SectionReveal`). `page.tsx` becomes a thin composition. All data comes from the three reads the page already does — no new fetches. The hero's proof module is the existing Notable Moves data (so even the hero is real data, not a splash screen).

**Tech Stack:** Next.js (App Router, RSC), TypeScript, Tailwind v4 with the project's `--tt-*` / shadcn design tokens, Fraunces display font (`font-display`), Geist Mono (`font-mono`).

## Global Constraints

- **No test suite** (`no-tests-solo-dev`). Verification per task = `npx tsc --noEmit` passes **and** visual check in the browser preview in **both light and dark mode** and at mobile width. No pytest/jest.
- **ISR only:** keep `export const revalidate = 3600`. Never `force-dynamic`.
- **No live external API fetch** on this page (no macro/FRED/NYFed at build or request time) — `build-no-live-external-fetch` incident.
- **No new per-request reads:** the page's data stays exactly `getManagerIndex()`, `notableMoves(6)`, `mostHeld(8)` via `Promise.all`. New sections reuse this data.
- **RSC-first:** all new sections are server components; only `SectionReveal` is `"use client"`.
- **Per-locale single language** — never mix zh/en in one string (`no-mixed-language-copy`).
- **No buy/sell/recommendation/forecast language** anywhere (`promotion-and-compliance`, valuation philosophy).
- **Mobile is a hard requirement:** hero collapses to one column; lower tables stay vertically stacked, never side-by-side.
- **Design tokens only:** warm paper / ink / money-green via `var(--tt-*)`; no new palette, no gradients/glow/glassmorphism.
- **Local `next build` fails** here (Google Fonts blocked, `local-build-google-fonts-blocked`) — use `tsc` as the type gate, never `next build` locally.
- **Branch:** `feat/landing-professional-redesign` (already created; the design spec is committed there).

---

## File Structure

- **Create** `web/src/components/home/HeroMasthead.tsx` — server. Eyebrow/dateline + value prop + sub-line + entry links + Notable Moves proof panel.
- **Create** `web/src/components/home/TrackedInvestorsWall.tsx` — server. Monogram avatars + names from the manager index.
- **Create** `web/src/components/home/ValuationShowcase.tsx` — server. Static "three ways" explainer + CSS value-band illustration.
- **Create** `web/src/components/home/SectionReveal.tsx` — client. SEO-safe IntersectionObserver reveal (optional polish; Task 6).
- **Modify** `web/src/app/[lang]/page.tsx` — compose the above; elevate the Investors/Consensus pillar sections; add trust strip + demoted macro + soft newsletter; remove the old standalone "Notable moves" section and the old tiny tagline/dateline (absorbed into the hero).

Reference spec: `docs/superpowers/specs/2026-06-26-landing-professional-redesign-design.md`.

---

### Task 1: HeroMasthead component

Builds the masthead: dateline credential, large value prop, sub-line, three entry links, and the Notable Moves proof panel (asymmetric two-column desktop, stacked mobile).

**Files:**
- Create: `web/src/components/home/HeroMasthead.tsx`
- Reference (do not modify): `web/src/components/shell/MoveTag.tsx`, `web/src/components/common/EntityName.tsx`, `web/src/components/entity/FreshnessDot.tsx`, `web/src/lib/aggregations.ts`, `web/src/lib/freshness/derive.ts`, `web/src/lib/urls.ts`

**Interfaces:**
- Consumes: `notableMoves(6): Promise<NotableMoves>` where `NotableMoves = { mostBought: MoveRow[]; mostSold: MoveRow[] }` and `MoveRow = { cusip: string; issuer: string; count: number; value: number; dominantKind: MoveKind }`. `filingFreshness(period: string | null, now: Date)`. `Lang = "zh" | "en"`.
- Produces: `export default function HeroMasthead(props: { lang: Lang; period: string; moves: NotableMoves }): React.ReactElement`

- [ ] **Step 1: Write the component**

```tsx
import Link from "next/link";
import type { Lang } from "@/lib/nav";
import type { NotableMoves, MoveRow } from "@/lib/aggregations";
import { formatUSD } from "@/lib/format";
import { EntityName } from "@/components/common/EntityName";
import MoveTag from "@/components/shell/MoveTag";
import { FreshnessDot } from "@/components/entity/FreshnessDot";
import { filingFreshness } from "@/lib/freshness/derive";
import { stockPath } from "@/lib/urls";

const COPY = {
  zh: {
    propLead: "与最有耐心的投资者同行。",
    propMuted: "看他们持有什么 —— 以及值多少钱。",
    sub: "聚合超级投资者的 SEC 13F 季度持仓，与第一性原理估值交叉验证。数据来源：SEC EDGAR。",
    investors: "投资者",
    stocks: "股票",
    valuation: "估值",
    panelTitle: "本季显著动向",
    live: "实时",
    bought: "最多人增持",
    sold: "最多人减持",
    asOf: (p: string) => `截至 ${p} · SEC 13F · 45 天延迟`,
  },
  en: {
    propLead: "Walk with the most patient investors.",
    propMuted: "See what they own — and what it’s worth.",
    sub: "Smart-money SEC 13F holdings, cross-referenced with first-principles valuation. Source: SEC EDGAR.",
    investors: "Investors",
    stocks: "Stocks",
    valuation: "Valuation",
    panelTitle: "Notable moves this quarter",
    live: "live",
    bought: "Most bought",
    sold: "Most sold",
    asOf: (p: string) => `As of ${p} · SEC 13F · 45-day lag`,
  },
} as const;

function PanelRows({ lang, rows }: { lang: Lang; rows: MoveRow[] }) {
  return (
    <table className="mt-2 w-full border-collapse text-sm">
      <tbody>
        {rows.map((row) => (
          <tr key={row.cusip} className="border-b border-[var(--tt-border)] last:border-0">
            <td className="py-2 pr-3">
              <span className="flex items-center gap-2">
                <MoveTag kind={row.dominantKind} />
                <Link
                  href={stockPath(lang, row.cusip)}
                  className="font-display font-medium text-[var(--tt-text)] no-underline transition-colors hover:text-[var(--tt-accent)]"
                >
                  <EntityName issuer={row.issuer} ticker={row.cusip} />
                </Link>
              </span>
            </td>
            <td className="py-2 text-right font-mono text-xs tabular-nums text-[var(--tt-muted)] whitespace-nowrap">
              {lang === "zh" ? `${row.count} 位 · ${formatUSD(row.value)}` : `${row.count} · ${formatUSD(row.value)}`}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export default function HeroMasthead({
  lang,
  period,
  moves,
}: {
  lang: Lang;
  period: string;
  moves: NotableMoves;
}): React.ReactElement {
  const c = COPY[lang];
  const links: { label: string; href: string }[] = [
    { label: c.investors, href: `/${lang}/investors` },
    { label: c.stocks, href: `/${lang}/stocks` },
    { label: c.valuation, href: "#valuation" },
  ];
  return (
    <section className="grid grid-cols-1 gap-10 md:grid-cols-[1.05fr_0.95fr] md:items-start">
      <div>
        <p className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.12em] text-[var(--tt-accent)]">
          <FreshnessDot status={filingFreshness(period || null, new Date())} lang={lang} />
          {c.asOf(period)}
        </p>
        <h1 className="mt-4 font-display text-3xl font-medium leading-[1.12] tracking-tight text-[var(--tt-text)] sm:text-4xl md:text-5xl">
          {c.propLead}{" "}
          <span className="text-[var(--tt-faint)]">{c.propMuted}</span>
        </h1>
        <p className="mt-4 max-w-[36ch] text-sm leading-relaxed text-[var(--tt-muted)]">{c.sub}</p>
        <nav className="mt-6 flex flex-wrap items-center gap-x-6 gap-y-2">
          {links.map((l) => (
            <Link
              key={l.label}
              href={l.href}
              className="font-display text-[15px] text-[var(--tt-text)] no-underline [border-bottom:1px_solid_var(--tt-accent)] transition-colors hover:text-[var(--tt-accent)]"
            >
              {l.label}
            </Link>
          ))}
        </nav>
      </div>

      <aside className="rounded-md border border-[var(--tt-border)] bg-[var(--tt-panel)] p-4 sm:p-5">
        <div className="flex items-baseline justify-between border-b border-[var(--tt-border-strong)] pb-2">
          <span className="font-display text-sm font-medium text-[var(--tt-text)]">{c.panelTitle}</span>
          <span className="font-mono text-[9px] uppercase tracking-[0.1em] text-[var(--tt-faint)]">{c.live}</span>
        </div>
        {moves.mostBought.length > 0 && (
          <>
            <p className="pt-3 font-mono text-[9px] uppercase tracking-[0.12em] text-[var(--tt-faint)]">{c.bought}</p>
            <PanelRows lang={lang} rows={moves.mostBought.slice(0, 3)} />
          </>
        )}
        {moves.mostSold.length > 0 && (
          <>
            <p className="pt-4 font-mono text-[9px] uppercase tracking-[0.12em] text-[var(--tt-faint)]">{c.sold}</p>
            <PanelRows lang={lang} rows={moves.mostSold.slice(0, 2)} />
          </>
        )}
      </aside>
    </section>
  );
}
```

- [ ] **Step 2: Type-check**

Run: `cd web && npx tsc --noEmit`
Expected: PASS (no errors). If `formatUSD`/`EntityName`/`FreshnessDot` import paths differ, fix to match the imports already used in `web/src/app/[lang]/page.tsx`.

- [ ] **Step 3: Commit**

```bash
git add web/src/components/home/HeroMasthead.tsx
git commit -m "feat(landing): hero masthead — dateline + value prop + notable-moves proof panel

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 2: TrackedInvestorsWall component

The credibility wall: monogram avatars + names of tracked investors, each linking to its page, ending with a "more" link.

**Files:**
- Create: `web/src/components/home/TrackedInvestorsWall.tsx`
- Reference: `web/src/lib/managers/types.ts` (`ManagerSummary`), `web/src/lib/urls.ts` (`investorPath`)

**Interfaces:**
- Consumes: `ManagerSummary = { cik: string; slug: string; name: string; person: string; period: string; totalValue: number; holdingCount: number; topHolding: string }`. `investorPath(lang, slug)`.
- Produces: `export default function TrackedInvestorsWall(props: { lang: Lang; managers: ManagerSummary[]; total: number }): React.ReactElement`

- [ ] **Step 1: Write the component**

```tsx
import Link from "next/link";
import type { Lang } from "@/lib/nav";
import type { ManagerSummary } from "@/lib/managers/types";
import { investorPath } from "@/lib/urls";

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

const COPY = {
  zh: { label: "我们追踪的投资者", more: (n: number) => `共 ${n} 位 →` },
  en: { label: "Tracked investors", more: (n: number) => `${n} in all →` },
} as const;

export default function TrackedInvestorsWall({
  lang,
  managers,
  total,
}: {
  lang: Lang;
  managers: ManagerSummary[];
  total: number;
}): React.ReactElement {
  const c = COPY[lang];
  return (
    <section className="mt-16 border-t border-[var(--tt-border)] pt-6">
      <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-[var(--tt-faint)]">{c.label}</p>
      <div className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-3">
        {managers.map((m) => (
          <Link
            key={m.cik}
            href={investorPath(lang, m.slug)}
            className="group flex items-center gap-2 no-underline"
          >
            <span className="flex h-8 w-8 items-center justify-center rounded-full border border-[var(--tt-border)] bg-[var(--tt-panel-2)] font-display text-[11px] font-medium text-[var(--tt-accent)]">
              {initials(m.person)}
            </span>
            <span className="font-display text-[13px] text-[var(--tt-text)] transition-colors group-hover:text-[var(--tt-accent)]">
              {m.person}
            </span>
          </Link>
        ))}
        <Link
          href={`/${lang}/investors`}
          className="font-mono text-[11px] text-[var(--tt-faint)] no-underline hover:text-[var(--tt-accent)]"
        >
          {c.more(total)}
        </Link>
      </div>
    </section>
  );
}
```

- [ ] **Step 2: Type-check**

Run: `cd web && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add web/src/components/home/TrackedInvestorsWall.tsx
git commit -m "feat(landing): tracked-investors credibility wall (monogram avatars)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 3: ValuationShowcase component

Pillar ⑤ — the differentiator. Static editorial "three ways" explainer + a pure-CSS value-band illustration. No data fetch. Carries the `#valuation` anchor the hero links to.

**Files:**
- Create: `web/src/components/home/ValuationShowcase.tsx`

**Interfaces:**
- Consumes: `Lang`.
- Produces: `export default function ValuationShowcase(props: { lang: Lang }): React.ReactElement`

- [ ] **Step 1: Write the component**

```tsx
import Link from "next/link";
import type { Lang } from "@/lib/nav";

const COPY = {
  zh: {
    heading: "值多少钱",
    thesis:
      "每只股票，三法估值：Buffett 所有者收益 DCF · Greenwald 盈利能力价值 · 资产重置价值。保守为先，只为已证实的价值付费。",
    band: "价值带",
    floor: "保守下限",
    fair: "合理区间",
    optimistic: "乐观上限",
    cta: "看个股估值 →",
  },
  en: {
    heading: "What it’s worth",
    thesis:
      "Every stock, valued three ways: Buffett owner-earnings DCF · Greenwald earnings-power value · asset reproduction value. Conservative first — pay only for proven value.",
    band: "Value band",
    floor: "Conservative floor",
    fair: "Fair range",
    optimistic: "Optimistic ceiling",
    cta: "See per-stock valuation →",
  },
} as const;

export default function ValuationShowcase({ lang }: { lang: Lang }): React.ReactElement {
  const c = COPY[lang];
  return (
    <section id="valuation" className="mt-16 scroll-mt-24 border-t border-[var(--tt-border)] pt-6">
      <h2 className="font-display text-2xl font-medium tracking-tight text-[var(--tt-text)] sm:text-3xl">
        {c.heading}
      </h2>
      <p className="mt-3 max-w-[60ch] text-sm leading-relaxed text-[var(--tt-muted)]">{c.thesis}</p>

      <div className="mt-6 rounded-md border border-[var(--tt-border)] bg-[var(--tt-panel)] p-5">
        <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-[var(--tt-faint)]">{c.band}</p>
        <div className="mt-3 flex h-2 w-full overflow-hidden rounded-full">
          <span className="h-full w-1/3 bg-[var(--tt-accent)] opacity-90" />
          <span className="h-full w-1/3 bg-[var(--tt-accent)] opacity-50" />
          <span className="h-full w-1/3 bg-[var(--tt-accent)] opacity-25" />
        </div>
        <div className="mt-2 flex justify-between font-mono text-[10px] text-[var(--tt-faint)]">
          <span>{c.floor}</span>
          <span>{c.fair}</span>
          <span>{c.optimistic}</span>
        </div>
      </div>

      <Link
        href={`/${lang}/stocks`}
        className="mt-4 inline-block font-mono text-[11px] uppercase tracking-[0.08em] text-[var(--tt-accent)] no-underline hover:underline"
      >
        {c.cta}
      </Link>
    </section>
  );
}
```

- [ ] **Step 2: Type-check**

Run: `cd web && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add web/src/components/home/ValuationShowcase.tsx
git commit -m "feat(landing): valuation showcase — three-ways explainer + value-band

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 4: Recompose page.tsx — hero, wall, elevated pillars, showcase, trust strip

Replace the old tiny tagline/dateline and the standalone Notable Moves section with the hero; insert the wall after it; elevate the two pillar tables; add the valuation showcase; rebuild the closing area as a trust strip + demoted macro link + soft newsletter.

**Files:**
- Modify: `web/src/app/[lang]/page.tsx`
- Reference: `web/src/components/shell/NewsletterForm.tsx` (`export default function NewsletterForm({ lang }: { lang: Lang })`), `web/src/lib/urls.ts` (`macroPath`)

**Interfaces:**
- Consumes: `HeroMasthead`, `TrackedInvestorsWall`, `ValuationShowcase` from Tasks 1–3; existing `notableMoves`, `mostHeld`, `getManagerIndex`.
- Produces: the rebuilt home page (no new exported symbols).

- [ ] **Step 1: Update imports** at the top of `page.tsx`

Add:

```tsx
import HeroMasthead from "@/components/home/HeroMasthead";
import TrackedInvestorsWall from "@/components/home/TrackedInvestorsWall";
import ValuationShowcase from "@/components/home/ValuationShowcase";
import NewsletterForm from "@/components/shell/NewsletterForm";
import { macroPath } from "@/lib/urls";
```

Remove now-unused imports only if the type-check flags them (e.g. `MoveTag`, `MoveRow`, `FreshnessDot`, `filingFreshness` are now used inside `HeroMasthead`; keep any still referenced by `MoveColumn` if you retain it — but `MoveColumn` is being deleted in Step 3, so its imports go too).

- [ ] **Step 2: Replace the return body.** Swap the JSX from the opening `<div className="mx-auto max-w-5xl ...">` through the closing source-note `</p>` with:

```tsx
  return (
    <div className="mx-auto max-w-5xl px-2 pb-16 pt-6 sm:pb-20 sm:pt-10">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(ld) }} />

      <HeroMasthead lang={lang} period={period} moves={moves} />

      {topManagers.length > 0 && (
        <TrackedInvestorsWall lang={lang} managers={topInvestors} total={topManagers.length} />
      )}

      {/* Pillar ① — Who's buying (Investors) */}
      {topInvestors.length > 0 && (
        <section className="mt-20">
          <BlockHeading
            title={isZh ? "投资者" : "Investors"}
            thesis={isZh ? "按管理规模排序的顶级 13F 申报机构。" : "Top 13F filers, ranked by reported portfolio value."}
            href={`/${lang}/investors`}
            isZh={isZh}
          />
          <table className="mt-4 w-full border-collapse text-sm">
            <tbody>
              {topInvestors.map((m) => (
                <tr key={m.cik} className="border-b border-[var(--tt-border)] transition-colors hover:bg-[var(--tt-surface)]">
                  <td className="py-2.5 pr-4">
                    <Link href={investorPath(lang, m.slug)} className="font-display font-medium text-[var(--tt-text)] no-underline transition-colors hover:text-[var(--tt-accent)]">
                      {m.person}
                    </Link>
                    <span className="ml-2 truncate text-[11px] text-[var(--tt-faint)]">{cleanIssuer(m.topHolding)}</span>
                  </td>
                  <td className="py-2.5 pr-4 text-right font-mono text-xs tabular-nums text-[var(--tt-muted)]">{m.holdingCount}</td>
                  <td className="py-2.5 text-right font-mono text-xs tabular-nums text-[var(--tt-text)]">{formatUSD(m.totalValue)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {/* Pillar ② — What they own (Consensus holdings) */}
      {held.length > 0 && (
        <section className="mt-20">
          <BlockHeading
            title={isZh ? "共识持仓" : "Consensus holdings"}
            thesis={isZh ? "多位投资者共同持有的高共识标的。" : "High-conviction names held across multiple investors."}
            href={`/${lang}/investors/consensus`}
            isZh={isZh}
          />
          <table className="mt-4 w-full border-collapse text-sm">
            <tbody>
              {held.map((row) => (
                <tr key={row.cusip} className="border-b border-[var(--tt-border)] transition-colors hover:bg-[var(--tt-surface)]">
                  <td className="py-2.5 pr-4">
                    <Link href={stockPath(lang, row.cusip)} className="font-display font-medium text-[var(--tt-text)] no-underline transition-colors hover:text-[var(--tt-accent)]">
                      <EntityName issuer={row.issuer} ticker={row.cusip} />
                    </Link>
                  </td>
                  <td className="py-2.5 pr-4 text-right font-mono text-xs tabular-nums text-[var(--tt-muted)] whitespace-nowrap">
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

      {/* Pillar ③ — What it's worth (Valuation) */}
      <ValuationShowcase lang={lang} />

      {/* Trust strip + demoted macro + soft newsletter */}
      <section className="mt-16 border-t border-[var(--tt-border)] pt-6">
        <p className="font-mono text-[11px] tracking-[0.04em] text-[var(--tt-faint)]">
          {isZh
            ? "来源：SEC EDGAR 13F 季度报告 · 45 天延迟 · 不荐股、不预测。"
            : "Source: SEC EDGAR 13F quarterly filings · 45-day lag · No recommendations, no forecasts."}
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-x-6 gap-y-2">
          <Link href={macroPath(lang, "")} className="font-mono text-[11px] uppercase tracking-[0.08em] text-[var(--tt-accent)] no-underline hover:underline">
            {isZh ? "宏观流动性 →" : "Macro & liquidity →"}
          </Link>
        </div>
        <div className="mt-6 max-w-sm">
          <NewsletterForm lang={lang} />
        </div>
      </section>
    </div>
  );
```

Note: `macroPath(lang, "")` yields `/${lang}/macro/` — if a trailing slash 404s, change to a literal `` `/${lang}/macro` ``.

- [ ] **Step 3: Update `BlockHeading` to accept a thesis line; delete `MoveColumn`.**

Replace the existing `BlockHeading` function with:

```tsx
function BlockHeading({ title, thesis, href, isZh }: { title: string; thesis: string; href: string; isZh: boolean }) {
  return (
    <div className="border-b border-[var(--tt-border)] pb-2">
      <div className="flex items-baseline justify-between">
        <h2 className="font-display text-2xl font-medium tracking-tight text-[var(--tt-text)] sm:text-3xl">{title}</h2>
        <Link href={href} className="font-mono text-[11px] uppercase tracking-[0.08em] text-[var(--tt-accent)] no-underline hover:underline">
          {isZh ? "查看全部 →" : "View all →"}
        </Link>
      </div>
      <p className="mt-1.5 text-xs text-[var(--tt-muted)]">{thesis}</p>
    </div>
  );
}
```

Delete the entire `function MoveColumn(...) { ... }` (now superseded by the hero's proof panel).

- [ ] **Step 4: Type-check**

Run: `cd web && npx tsc --noEmit`
Expected: PASS. Remove any imports the compiler now reports as unused (likely `MoveTag`, `MoveRow`, `FreshnessDot`, `filingFreshness` if no longer referenced in `page.tsx`).

- [ ] **Step 5: Visual verification in the browser preview**

Start the dev server (`preview_start`) and load `/en` and `/zh`. Confirm in **both light and dark mode** and at **mobile width**:
- Hero: dateline credential, large Fraunces value prop (lead ink + muted continuation), sub-line, three underlined entry links, and the Notable Moves panel (right column desktop, stacked below on mobile).
- Wall renders monogram avatars + names; `more` link present.
- Investors + Consensus tables render with the larger heading + thesis line + more whitespace.
- Valuation showcase renders with the value-band bar; clicking the hero's "估值/Valuation" link scrolls to it (`#valuation`).
- Trust strip, macro link, and newsletter render at the bottom.
- Check `preview_console_logs` / `preview_network`: no errors, and **no request to FRED/NYFed/macro external hosts** on load.

- [ ] **Step 6: Commit**

```bash
git add web/src/app/[lang]/page.tsx
git commit -m "feat(landing): recompose home — hero, wall, elevated pillars, valuation, trust strip

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 5: SEO-safe section reveal motion (optional polish — ship only if it reads as tasteful)

A single restrained on-scroll reveal. SSR/no-JS renders content fully visible (SEO-safe); the fade+translate is applied only after mount when motion is allowed.

**Files:**
- Create: `web/src/components/home/SectionReveal.tsx`
- Modify: `web/src/app/[lang]/page.tsx` (wrap the wall, two pillars, and showcase)

**Interfaces:**
- Consumes: nothing project-specific.
- Produces: `export default function SectionReveal(props: { children: React.ReactNode }): React.ReactElement`

- [ ] **Step 1: Write the client component**

```tsx
"use client";
import { useEffect, useRef } from "react";

export default function SectionReveal({ children }: { children: React.ReactNode }): React.ReactElement {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (typeof IntersectionObserver === "undefined") return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    el.style.opacity = "0";
    el.style.transform = "translateY(10px)";
    el.style.transition = "opacity .5s ease-out, transform .5s ease-out";
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          el.style.opacity = "1";
          el.style.transform = "translateY(0)";
          io.disconnect();
        }
      },
      { rootMargin: "0px 0px -10% 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return <div ref={ref}>{children}</div>;
}
```

- [ ] **Step 2: Wrap the lower sections** in `page.tsx` — import `SectionReveal` and wrap the `TrackedInvestorsWall`, the Investors `<section>`, the Consensus `<section>`, and `<ValuationShowcase />` each in `<SectionReveal>…</SectionReveal>`. Do **not** wrap the hero (it's above the fold; must be instant).

- [ ] **Step 3: Type-check**

Run: `cd web && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 4: Visual verification**

In the preview: scroll the page and confirm sections fade+rise once on entry. Then enable reduced-motion (`preview_eval` to emulate, or OS setting) and confirm content is fully visible with no animation. Confirm content is present in view-source / initial HTML (SEO-safe).

- [ ] **Step 5: Commit**

```bash
git add web/src/components/home/SectionReveal.tsx web/src/app/[lang]/page.tsx
git commit -m "feat(landing): SEO-safe on-scroll section reveal (reduced-motion aware)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 6: Final QA pass + finish the branch

**Files:** none (verification only).

- [ ] **Step 1: Full type gate** — `cd web && npx tsc --noEmit` → PASS.
- [ ] **Step 2: Both-locale, both-mode, mobile sweep** in the preview for `/en` and `/zh`: hierarchy reads institution-grade; green appears only on eyebrow dot / move tags / link underlines / value-band; no mixed-language strings; no buy/sell/forecast language; dark mode composed.
- [ ] **Step 3: Performance/constraint check** — confirm `export const revalidate = 3600` still present, no `force-dynamic`, and `preview_network` shows no external macro/FRED/NYFed calls on load.
- [ ] **Step 4: Invoke `superpowers:finishing-a-development-branch`** to choose merge/PR for `feat/landing-professional-redesign`.

---

---

## v2 — Rich scroll expansion (Tasks 7–9)

Surfaces hidden product depth as dedicated Linear-style sections. The v1
hero/wall/trust-strip stay; the three v1 pillars become alternating feature rows;
then foundations grid → philosophy quote → learn teaser → closing CTA. All new
sections are server components wrapped in `SectionReveal`. Same Global
Constraints apply (tokens-only, single-language copy, no buy/sell/forecast, RSC,
no new heavy reads). `lucide-react` (existing dep) provides foundations icons.

Final v2 page order: Hero → Wall → FeatureRow① Investors → FeatureRow② Consensus
→ FeatureRow③ Valuation → FoundationsGrid → PhilosophyQuote → LearnTeaser →
ClosingCTA → Trust strip.

### Task 7: FeatureRow primitive + ValueBandCard + restructure pillars into feature rows

**Files:**
- Create: `web/src/components/home/FeatureRow.tsx` (presentational primitive)
- Create: `web/src/components/home/ValueBandCard.tsx` (the static value-band visual)
- Modify: `web/src/app/[lang]/page.tsx` (replace the two pillar `<section>`s + `<ValuationShowcase/>` with three `<FeatureRow>`s)
- Delete: `web/src/components/home/ValuationShowcase.tsx` (superseded; its band moves to `ValueBandCard`, its copy moves into FeatureRow ③)

**Interfaces:**
- `FeatureRow` produces: `export default function FeatureRow(props: { eyebrow: string; title: string; body: string; ctaLabel: string; href: string; reverse?: boolean; children: React.ReactNode }): React.ReactElement`
- `ValueBandCard` produces: `export default function ValueBandCard(props: { lang: Lang }): React.ReactElement`
- Page consumes the already-loaded `topInvestors`, `held`, `lang`, plus existing `investorPath`, `stockPath`, `EntityName`, `formatUSD`, `cleanIssuer`.

- [ ] **Step 1: Create `FeatureRow.tsx`**

```tsx
import Link from "next/link";

export default function FeatureRow({
  eyebrow,
  title,
  body,
  ctaLabel,
  href,
  reverse = false,
  children,
}: {
  eyebrow: string;
  title: string;
  body: string;
  ctaLabel: string;
  href: string;
  reverse?: boolean;
  children: React.ReactNode;
}): React.ReactElement {
  return (
    <section className="mt-24 grid grid-cols-1 items-center gap-10 md:grid-cols-2">
      <div className={reverse ? "md:order-2" : ""}>
        <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-[var(--tt-accent)]">{eyebrow}</p>
        <h2 className="mt-3 font-display text-2xl font-medium leading-tight tracking-tight text-[var(--tt-text)] sm:text-3xl">
          {title}
        </h2>
        <p className="mt-3 max-w-[42ch] text-sm leading-relaxed text-[var(--tt-muted)]">{body}</p>
        <Link
          href={href}
          className="mt-5 inline-block font-mono text-[11px] uppercase tracking-[0.08em] text-[var(--tt-accent)] no-underline hover:underline"
        >
          {ctaLabel}
        </Link>
      </div>
      <div className={reverse ? "md:order-1" : ""}>{children}</div>
    </section>
  );
}
```

- [ ] **Step 2: Create `ValueBandCard.tsx`** (extracted from ValuationShowcase's band)

```tsx
import type { Lang } from "@/lib/nav";

const COPY = {
  zh: { band: "价值带", floor: "保守下限", fair: "合理区间", optimistic: "乐观上限" },
  en: { band: "Value band", floor: "Conservative floor", fair: "Fair range", optimistic: "Optimistic ceiling" },
} as const;

export default function ValueBandCard({ lang }: { lang: Lang }): React.ReactElement {
  const c = COPY[lang];
  return (
    <div className="rounded-md border border-[var(--tt-border)] bg-[var(--tt-panel)] p-5">
      <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-[var(--tt-faint)]">{c.band}</p>
      <div className="mt-3 flex h-2 w-full overflow-hidden rounded-full">
        <span className="h-full w-1/3 bg-[var(--tt-accent)] opacity-90" />
        <span className="h-full w-1/3 bg-[var(--tt-accent)] opacity-50" />
        <span className="h-full w-1/3 bg-[var(--tt-accent)] opacity-25" />
      </div>
      <div className="mt-2 flex justify-between font-mono text-[10px] text-[var(--tt-faint)]">
        <span>{c.floor}</span>
        <span>{c.fair}</span>
        <span>{c.optimistic}</span>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Restructure `page.tsx`.** Remove the import of `ValuationShowcase`; add imports for `FeatureRow` and `ValueBandCard`. Replace the two pillar `<SectionReveal><section>…</section></SectionReveal>` blocks AND the `<SectionReveal><ValuationShowcase/></SectionReveal>` block with the three feature rows below. Keep the existing `<table>` markup as each row's visual, wrapped in a panel card. Keep `BlockHeading` only if still referenced elsewhere; if it becomes unused after this change, delete it (and remove unused imports flagged by tsc).

Feature row ① (Investors), visual = top investors mini-table in a panel card:

```tsx
{topInvestors.length > 0 && (
  <SectionReveal>
    <FeatureRow
      eyebrow={isZh ? "13F 追踪" : "13F tracking"}
      title={isZh ? "跟随聪明钱，逐季追踪" : "Follow the smart money, quarter by quarter"}
      body={isZh
        ? "追踪 70+ 位传奇投资者的 SEC 13F 季度持仓——谁在建仓、谁在清仓，逐季看清。"
        : "Track 70+ legendary investors' SEC 13F filings — who's building a position, who's getting out, quarter over quarter."}
      ctaLabel={isZh ? "浏览全部投资者 →" : "Browse all investors →"}
      href={`/${lang}/investors`}
    >
      <div className="rounded-md border border-[var(--tt-border)] bg-[var(--tt-panel)] p-4 sm:p-5">
        <table className="w-full border-collapse text-sm">
          <tbody>
            {topInvestors.slice(0, 6).map((m) => (
              <tr key={m.cik} className="border-b border-[var(--tt-border)] last:border-0">
                <td className="py-2 pr-4">
                  <Link href={investorPath(lang, m.slug)} className="font-display font-medium text-[var(--tt-text)] no-underline transition-colors hover:text-[var(--tt-accent)]">
                    {m.person}
                  </Link>
                </td>
                <td className="py-2 text-right font-mono text-xs tabular-nums text-[var(--tt-muted)] whitespace-nowrap">{formatUSD(m.totalValue)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </FeatureRow>
  </SectionReveal>
)}
```

Feature row ② (Consensus), `reverse`, visual = consensus mini-table in a panel card:

```tsx
{held.length > 0 && (
  <SectionReveal>
    <FeatureRow
      reverse
      eyebrow={isZh ? "跨基金共识" : "Cross-fund consensus"}
      title={isZh ? "看共识如何形成" : "See the consensus form"}
      body={isZh
        ? "当多位顶级投资者持有同一只股票，那是值得注意的信号。我们跨基金聚合，告诉你有几位在持有。"
        : "When many of the best investors hold the same stock, that's a signal worth noting. We aggregate across funds so you can see how many own it."}
      ctaLabel={isZh ? "查看共识持仓 →" : "View consensus holdings →"}
      href={`/${lang}/investors/consensus`}
    >
      <div className="rounded-md border border-[var(--tt-border)] bg-[var(--tt-panel)] p-4 sm:p-5">
        <table className="w-full border-collapse text-sm">
          <tbody>
            {held.slice(0, 6).map((row) => (
              <tr key={row.cusip} className="border-b border-[var(--tt-border)] last:border-0">
                <td className="py-2 pr-4">
                  <Link href={stockPath(lang, row.cusip)} className="font-display font-medium text-[var(--tt-text)] no-underline transition-colors hover:text-[var(--tt-accent)]">
                    <EntityName issuer={row.issuer} ticker={row.cusip} />
                  </Link>
                </td>
                <td className="py-2 text-right font-mono text-xs tabular-nums text-[var(--tt-muted)] whitespace-nowrap">
                  {isZh ? `${row.holderCount} 位持有` : `${row.holderCount} hold`}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </FeatureRow>
  </SectionReveal>
)}
```

Feature row ③ (Valuation), `reverse`, visual = `<ValueBandCard lang={lang} />`:

```tsx
<SectionReveal>
  <FeatureRow
    reverse
    eyebrow={isZh ? "估值" : "Valuation"}
    title={isZh ? "知道它到底值多少" : "Know what it’s worth"}
    body={isZh
      ? "持仓只是起点。每只股票都用三套保守方法估值——Buffett 所有者收益 DCF、Greenwald 盈利能力价值、资产重置价值——只为已证实的价值付费。"
      : "Holdings are only the start. Every stock is valued three conservative ways — Buffett owner-earnings DCF, Greenwald earnings-power value, asset reproduction value — so you pay only for proven value."}
    ctaLabel={isZh ? "看个股估值 →" : "See per-stock valuation →"}
    href={`/${lang}/stocks`}
  >
    <ValueBandCard lang={lang} />
  </FeatureRow>
</SectionReveal>
```

Note: feature row ③ needs an `id="valuation"` anchor (the hero links to `#valuation`). Add `id="valuation"` + `scroll-mt-24` to row ③ — simplest is to wrap it: change its `<SectionReveal>` to a `<div id="valuation" className="scroll-mt-24"><SectionReveal>…</SectionReveal></div>`.

- [ ] **Step 4: Type-check** — `cd web && npx tsc --noEmit` → PASS. Delete `ValuationShowcase.tsx` and remove its import; remove `BlockHeading`/`MoveColumn` if now unused.

- [ ] **Step 5: Commit**

```bash
git add web/src/components/home/FeatureRow.tsx web/src/components/home/ValueBandCard.tsx 'web/src/app/[lang]/page.tsx'
git rm web/src/components/home/ValuationShowcase.tsx
git commit -m "feat(landing): pillars → alternating feature rows + value-band card

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

### Task 8: Foundations grid, philosophy quote, learn teaser, closing CTA

**Files:**
- Create: `web/src/components/home/FoundationsGrid.tsx`, `PhilosophyQuote.tsx`, `LearnTeaser.tsx`, `ClosingCTA.tsx`
- Modify: `web/src/app/[lang]/page.tsx` (insert the four after the feature rows, before the trust strip, each in `<SectionReveal>`)

**Interfaces:**
- `FoundationsGrid({ lang })`, `PhilosophyQuote({ lang })`, `ClosingCTA({ lang })` — server, static.
- `LearnTeaser({ lang })` — server; calls `listArticles(lang)` from `@/lib/learn` (returns `Article[]` with `slug`, `title`, `description`), links to `/${lang}/learn/${slug}` and `/${lang}/learn`.

- [ ] **Step 1: `FoundationsGrid.tsx`** — 9 cards, 3-col grid, `lucide-react` icons.

```tsx
import type { Lang } from "@/lib/nav";
import { FileText, Clock, TrendingUp, Users, Calculator, Layers, Target, Languages, ShieldCheck } from "lucide-react";

const COPY = {
  zh: {
    eyebrow: "建立在一手来源之上",
    items: [
      "纯一手 SEC EDGAR 数据", "45 天申报新鲜度标注", "季度环比变动 (QoQ)",
      "跨基金共识聚合", "Buffett 所有者收益 DCF", "Greenwald 盈利能力价值",
      "Strike-zone 区间识别", "中英双语", "不荐股、不预测",
    ],
  },
  en: {
    eyebrow: "Built on primary sources",
    items: [
      "Primary SEC EDGAR data", "45-day filing freshness", "Quarter-over-quarter deltas",
      "Cross-fund consensus", "Buffett owner-earnings DCF", "Greenwald earnings-power value",
      "Strike-zone detection", "Bilingual EN / 中文", "No recommendations, no forecasts",
    ],
  },
} as const;

const ICONS = [FileText, Clock, TrendingUp, Users, Calculator, Layers, Target, Languages, ShieldCheck];

export default function FoundationsGrid({ lang }: { lang: Lang }): React.ReactElement {
  const c = COPY[lang];
  return (
    <section className="mt-24 border-t border-[var(--tt-border)] pt-8">
      <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-[var(--tt-accent)]">{c.eyebrow}</p>
      <div className="mt-6 grid grid-cols-1 gap-x-8 gap-y-5 sm:grid-cols-2 md:grid-cols-3">
        {c.items.map((label, i) => {
          const Icon = ICONS[i];
          return (
            <div key={label} className="flex items-start gap-3">
              <Icon className="mt-0.5 h-4 w-4 shrink-0 text-[var(--tt-accent)]" strokeWidth={1.75} aria-hidden />
              <span className="font-display text-sm text-[var(--tt-text)]">{label}</span>
            </div>
          );
        })}
      </div>
    </section>
  );
}
```

- [ ] **Step 2: `PhilosophyQuote.tsx`** — large attributed Fraunces quote.

```tsx
import type { Lang } from "@/lib/nav";

const COPY = {
  zh: { quote: "价格是你付出的，价值是你得到的。", who: "—— 沃伦·巴菲特" },
  en: { quote: "Price is what you pay. Value is what you get.", who: "— Warren Buffett" },
} as const;

export default function PhilosophyQuote({ lang }: { lang: Lang }): React.ReactElement {
  const c = COPY[lang];
  return (
    <section className="mt-24 border-t border-[var(--tt-border)] pt-12">
      <blockquote className="mx-auto max-w-3xl text-center">
        <p className="font-display text-2xl font-medium leading-snug tracking-tight text-[var(--tt-text)] sm:text-3xl">
          “{c.quote}”
        </p>
        <footer className="mt-4 font-mono text-[11px] uppercase tracking-[0.1em] text-[var(--tt-faint)]">{c.who}</footer>
      </blockquote>
    </section>
  );
}
```

- [ ] **Step 3: `LearnTeaser.tsx`** — 3 real primers.

```tsx
import Link from "next/link";
import type { Lang } from "@/lib/nav";
import { listArticles } from "@/lib/learn";

const COPY = {
  zh: { eyebrow: "学习", title: "读懂生意，而非代码", cta: "全部指南 →" },
  en: { eyebrow: "Learn", title: "Learn to read businesses, not tickers", cta: "All guides →" },
} as const;

export default function LearnTeaser({ lang }: { lang: Lang }): React.ReactElement {
  const c = COPY[lang];
  const articles = listArticles(lang).slice(0, 3);
  return (
    <section className="mt-24 border-t border-[var(--tt-border)] pt-8">
      <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-[var(--tt-accent)]">{c.eyebrow}</p>
      <h2 className="mt-3 font-display text-2xl font-medium tracking-tight text-[var(--tt-text)] sm:text-3xl">{c.title}</h2>
      <div className="mt-6 grid grid-cols-1 gap-6 md:grid-cols-3">
        {articles.map((a) => (
          <Link key={a.slug} href={`/${lang}/learn/${a.slug}`} className="group block no-underline">
            <h3 className="font-display text-base font-medium text-[var(--tt-text)] transition-colors group-hover:text-[var(--tt-accent)]">{a.title}</h3>
            <p className="mt-1.5 text-xs leading-relaxed text-[var(--tt-muted)]">{a.description}</p>
          </Link>
        ))}
      </div>
      <Link href={`/${lang}/learn`} className="mt-6 inline-block font-mono text-[11px] uppercase tracking-[0.08em] text-[var(--tt-accent)] no-underline hover:underline">{c.cta}</Link>
    </section>
  );
}
```

- [ ] **Step 4: `ClosingCTA.tsx`** — confident closing band.

```tsx
import Link from "next/link";
import type { Lang } from "@/lib/nav";

const COPY = {
  zh: { line: "从任意一位投资者、任意一只股票开始。", investors: "投资者", stocks: "股票", valuation: "估值" },
  en: { line: "Start with any investor, any stock.", investors: "Investors", stocks: "Stocks", valuation: "Valuation" },
} as const;

export default function ClosingCTA({ lang }: { lang: Lang }): React.ReactElement {
  const c = COPY[lang];
  return (
    <section className="mt-24 border-t border-[var(--tt-border)] pt-12 text-center">
      <p className="font-display text-2xl font-medium tracking-tight text-[var(--tt-text)] sm:text-3xl">{c.line}</p>
      <nav className="mt-6 flex flex-wrap items-center justify-center gap-x-6 gap-y-2">
        <Link href={`/${lang}/investors`} className="font-display text-[15px] text-[var(--tt-text)] no-underline [border-bottom:1px_solid_var(--tt-accent)] hover:text-[var(--tt-accent)]">{c.investors}</Link>
        <Link href={`/${lang}/stocks`} className="font-display text-[15px] text-[var(--tt-text)] no-underline [border-bottom:1px_solid_var(--tt-accent)] hover:text-[var(--tt-accent)]">{c.stocks}</Link>
        <Link href="#valuation" className="font-display text-[15px] text-[var(--tt-text)] no-underline [border-bottom:1px_solid_var(--tt-accent)] hover:text-[var(--tt-accent)]">{c.valuation}</Link>
      </nav>
    </section>
  );
}
```

- [ ] **Step 5: Wire into `page.tsx`** — import the four; insert after feature row ③ and before the trust-strip section, in this order, each wrapped in `<SectionReveal>`: `FoundationsGrid` → `PhilosophyQuote` → `LearnTeaser` → `ClosingCTA`.

- [ ] **Step 6: Type-check** — `cd web && npx tsc --noEmit` → PASS.

- [ ] **Step 7: Commit**

```bash
git add web/src/components/home/FoundationsGrid.tsx web/src/components/home/PhilosophyQuote.tsx web/src/components/home/LearnTeaser.tsx web/src/components/home/ClosingCTA.tsx 'web/src/app/[lang]/page.tsx'
git commit -m "feat(landing): foundations grid, philosophy quote, learn teaser, closing CTA

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

### Task 9: v2 QA + whole-branch review + finish

- [ ] **Step 1:** `cd web && npx tsc --noEmit` → PASS.
- [ ] **Step 2:** Controller visual QA in the preview (`/en` + `/zh`, light + dark, mobile): all 9 sections render in order, feature rows alternate sides on desktop and stack on mobile, foundations icons render, philosophy quote centered, learn teaser shows 3 real primers, closing CTA links work, `#valuation` anchor still scrolls to feature row ③. No console errors; no external macro/FRED calls; `revalidate=3600` intact.
- [ ] **Step 3:** Whole-branch final review (most-capable model) on the full v2 diff.
- [ ] **Step 4:** `superpowers:finishing-a-development-branch`.

## Self-Review

**Spec coverage:**
- ① Hero masthead → Task 1 + Task 4 wiring. ✓
- ② Credibility wall → Task 2 + Task 4. ✓
- ③ Investors pillar (elevated) → Task 4 Step 2/3. ✓
- ④ Consensus pillar (elevated) → Task 4 Step 2/3. ✓
- ⑤ Valuation showcase → Task 3 + Task 4. ✓ (static treatment; live flagship card deferred per spec open question + no-new-reads constraint — documented in Task 3.)
- ⑥ Trust strip + demoted macro + soft newsletter → Task 4 Step 2. ✓
- Visual craft (type scale, whitespace `mt-20`, green-as-signature, tabular mono, dark parity) → embedded across Tasks 1/3/4 + Task 6 sweep. ✓
- Motion (one reveal, reduced-motion, SEO-safe, optional) → Task 5. ✓
- Performance/compliance/mobile constraints → Global Constraints + Task 4 Step 5 + Task 6 Step 3. ✓
- Revertible defaults (monogram / text links / panel placement) → realized in Tasks 1–2. ✓

**Placeholder scan:** No TBD/TODO; all components have full code; copy strings are concrete zh/en. ✓

**Type consistency:** `HeroMasthead({lang, period, moves})`, `TrackedInvestorsWall({lang, managers, total})`, `ValuationShowcase({lang})`, `SectionReveal({children})` — names/props match between their definition tasks and the Task 4/5 call sites. `MoveRow`/`NotableMoves`/`ManagerSummary` field names match `aggregations.ts` / `managers/types.ts` as read from source. ✓

**Known follow-ups (out of scope, documented):** live flagship valuation card; investor portraits; marquee vs static wall.
