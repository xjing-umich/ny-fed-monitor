# SEO / GEO Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **Project convention (overrides skill default):** This repo has **no test suite** (solo dev — see memory `no-tests-solo-dev`). Verification = `npx tsc --noEmit`, `npm run build`, and inspecting rendered HTML/headers. Do **not** write test files.
>
> **Next.js note:** This is Next **16.2.6** App Router with breaking changes vs. training data. Before editing metadata/image/route conventions, read the relevant guide under `web/node_modules/next/dist/docs/` (especially `app/api-reference/file-conventions/metadata/` and `app/getting-started/metadata-and-og-images`).

**Goal:** Fix the favicon-not-indexed problem and substantially deepen Google SEO + GEO (AI answer-engine) signals across the bilingual (zh/en) site without touching business logic.

**Architecture:** Centralize all SEO config and builders in one `src/lib/seo.ts` module (site constants, OpenGraph helper, JSON-LD builders) so per-page code stays DRY. Convert per-request `force-dynamic` pages to time-based ISR. Add raster favicons ≥96px + a programmatic default OG image via Next's `ImageResponse`. Enrich `robots.ts`/`sitemap.ts` with AI-bot rules and hreflang alternates.

**Tech Stack:** Next.js 16.2.6 App Router, TypeScript, `next/og` (`ImageResponse`), Next file-convention metadata, ImageMagick/sharp (one-time icon raster generation).

All paths are relative to `web/` unless absolute.

---

## File Structure

| File | Responsibility |
|---|---|
| `src/lib/seo.ts` **(new)** | Single source of SEO truth: `SITE_URL`, `SITE_NAME`, locale map; `ogFor()` OpenGraph+Twitter builder; JSON-LD builders (`organizationLd`, `websiteLd`, `breadcrumbLd`, `datasetLd`, `personLd`). |
| `src/app/icon.png` **(new)** | 96×96 raster favicon (Google requires square, multiple-of-48). Generated from `icon.svg`. |
| `src/app/apple-icon.png` **(new)** | 180×180 Apple touch icon. Generated from `icon.svg`. |
| `src/app/opengraph-image.tsx` **(new)** | Default site OG image (1200×630) via `ImageResponse`. |
| `src/app/layout.tsx` | Global `openGraph` + `twitter` + explicit `icons` in root metadata. |
| `src/app/page.tsx` | Root `/` → 308 permanent redirect to `/zh`. |
| `src/app/robots.ts` | Explicit AI-bot user-agents + `host`. |
| `src/app/sitemap.ts` | `alternates.languages` (hreflang + x-default), `lastModified`, full stock list. |
| `src/app/[lang]/page.tsx` | `force-dynamic`→ISR; `openGraph` via `ogFor()`; add `WebSite`+`SearchAction` JSON-LD. |
| `src/app/[lang]/stocks/page.tsx` | `force-dynamic`→ISR; `openGraph`. |
| `src/app/[lang]/macro/page.tsx` | `force-dynamic`→ISR; `openGraph`. |
| `src/app/[lang]/stocks/[ticker]/page.tsx` | `openGraph`; add `Dataset` JSON-LD alongside existing breadcrumb. |
| `src/app/[lang]/investors/[slug]/page.tsx` | `openGraph`; add `Person`/`ProfilePage` JSON-LD alongside existing breadcrumb. |
| `src/app/[lang]/investors/page.tsx`, `macro/[indicator]/page.tsx` | `openGraph` via `ogFor()`. |

---

## Task 1: Central SEO module

**Files:**
- Create: `src/lib/seo.ts`

- [ ] **Step 1: Create the module**

```typescript
import type { Metadata } from "next";
import type { Lang } from "@/lib/nav";

export const SITE_URL = "https://thecompounder.fyi";
export const SITE_NAME = "Compounder";
export const TWITTER_HANDLE = "@compounder"; // update if a real handle exists; harmless if not

// next/intl-style locale tags for hreflang/openGraph
export const OG_LOCALE: Record<Lang, string> = { zh: "zh_CN", en: "en_US" };

/**
 * Build OpenGraph + Twitter metadata for a page.
 * `path` is the locale-prefixed path, e.g. "/zh/stocks/AAPL".
 * Omitting `image` falls back to the route's opengraph-image.tsx (Next auto-fills).
 */
export function ogFor(opts: {
  lang: Lang;
  title: string;
  description: string;
  path: string;
  type?: "website" | "article" | "profile";
}): Pick<Metadata, "openGraph" | "twitter"> {
  const { lang, title, description, path, type = "website" } = opts;
  const url = `${SITE_URL}${path}`;
  return {
    openGraph: {
      type,
      url,
      siteName: SITE_NAME,
      title,
      description,
      locale: OG_LOCALE[lang],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      site: TWITTER_HANDLE,
    },
  };
}

// ── JSON-LD builders ─────────────────────────────────────────────────────────

export function organizationLd(lang: Lang) {
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: SITE_NAME,
    url: `${SITE_URL}/${lang}`,
    logo: `${SITE_URL}/icon.png`,
    description:
      lang === "zh"
        ? "聚合超级投资者 13F 持仓、个股估值与宏观流动性。"
        : "Smart-money 13F holdings, single-stock valuation, and the macro funding backdrop.",
  };
}

/** WebSite + SearchAction — enables Google sitelinks search box. */
export function websiteLd(lang: Lang) {
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: SITE_NAME,
    url: `${SITE_URL}/${lang}`,
    inLanguage: lang === "zh" ? "zh-CN" : "en",
    potentialAction: {
      "@type": "SearchAction",
      target: {
        "@type": "EntryPoint",
        urlTemplate: `${SITE_URL}/${lang}/stocks?q={search_term_string}`,
      },
      "query-input": "required name=search_term_string",
    },
  };
}

export function breadcrumbLd(items: { name: string; url: string }[]) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((it, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: it.name,
      item: it.url,
    })),
  };
}

/** Dataset for a stock's holders table — GEO-friendly factual structure. */
export function datasetLd(opts: {
  lang: Lang;
  name: string;
  description: string;
  url: string;
}) {
  return {
    "@context": "https://schema.org",
    "@type": "Dataset",
    name: opts.name,
    description: opts.description,
    url: opts.url,
    inLanguage: opts.lang === "zh" ? "zh-CN" : "en",
    isAccessibleForFree: true,
    creator: { "@type": "Organization", name: SITE_NAME, url: SITE_URL },
    isBasedOn: "https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany",
  };
}

export function personLd(opts: {
  name: string;
  affiliation?: string;
  url: string;
}) {
  return {
    "@context": "https://schema.org",
    "@type": "Person",
    name: opts.name,
    url: opts.url,
    ...(opts.affiliation
      ? { affiliation: { "@type": "Organization", name: opts.affiliation } }
      : {}),
  };
}
```

- [ ] **Step 2: Typecheck**

Run: `cd web && npx tsc --noEmit`
Expected: no errors referencing `src/lib/seo.ts`. (`Lang` is exported from `src/lib/nav` — confirm the import path resolves.)

- [ ] **Step 3: Commit**

```bash
git add web/src/lib/seo.ts
git commit -m "feat(seo): central SEO config + OpenGraph/JSON-LD builders"
```

---

## Task 2: Raster favicons ≥96px (fix Google icon indexing)

**Why:** Google Search only shows favicons that are **square and a multiple of 48px**. The current `favicon.ico` is 16/32 only and `icon.svg` is not used by Google's results favicon. Adding `icon.png` (96×96) + `apple-icon.png` (180×180) gives Google a compliant raster.

**Files:**
- Create: `src/app/icon.png`
- Create: `src/app/apple-icon.png`

- [ ] **Step 1: Generate PNGs from the brand SVG**

The brand mark is a thin green stroke on transparent. Render at high resolution onto a transparent canvas. From `web/`:

```bash
# 96x96 results favicon (Google-compliant: square, multiple of 48)
magick -background none src/app/icon.svg -resize 96x96 src/app/icon.png
# 180x180 Apple touch icon
magick -background none src/app/icon.svg -resize 180x180 src/app/apple-icon.png
```

If `magick` is unavailable, fall back to: `sips -s format png -Z 96 src/app/icon.svg --out src/app/icon.png` (sips rasterizes via Quick Look).

- [ ] **Step 2: Verify dimensions**

Run: `file src/app/icon.png src/app/apple-icon.png`
Expected: `icon.png` → 96 x 96, `apple-icon.png` → 180 x 180, both PNG.

- [ ] **Step 3: Commit**

```bash
git add web/src/app/icon.png web/src/app/apple-icon.png
git commit -m "feat(seo): add Google-compliant 96px raster favicon + apple touch icon"
```

> Note: Next.js auto-detects `app/icon.png` and `app/apple-icon.png` by file convention — no code change needed. Keep `favicon.ico` and `icon.svg` (they remain valid alternates).

---

## Task 3: Default OpenGraph image

**Files:**
- Create: `src/app/opengraph-image.tsx`

- [ ] **Step 1: Create the dynamic OG image route**

```tsx
import { ImageResponse } from "next/og";

export const runtime = "nodejs";
export const alt = "Compounder · 复利 — smart-money holdings, valuation, macro";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OgImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          padding: "80px",
          background: "#0E1F17",
          color: "#F4F1EA",
          fontFamily: "serif",
        }}
      >
        <div style={{ fontSize: 30, letterSpacing: 8, color: "#7FB89A", textTransform: "uppercase" }}>
          Compounder · 复利
        </div>
        <div style={{ fontSize: 64, lineHeight: 1.1, marginTop: 24, maxWidth: 900 }}>
          Smart-money holdings × valuation × macro
        </div>
        <div style={{ fontSize: 26, marginTop: 28, color: "#A9C7B5" }}>
          SEC 13F · NY Fed · thecompounder.fyi
        </div>
      </div>
    ),
    { ...size }
  );
}
```

- [ ] **Step 2: Typecheck + build the route**

Run: `cd web && npx tsc --noEmit && npm run build 2>&1 | grep -iE "opengraph-image|error" | head`
Expected: no error; build emits the `/opengraph-image` route.

- [ ] **Step 3: Commit**

```bash
git add web/src/app/opengraph-image.tsx
git commit -m "feat(seo): default 1200x630 OpenGraph image via ImageResponse"
```

---

## Task 4: Global OpenGraph / Twitter / icons in root layout

**Files:**
- Modify: `src/app/layout.tsx` (the `metadata` export, ~line 17-23)

- [ ] **Step 1: Replace the metadata export**

Current:
```typescript
export const metadata: Metadata = {
  metadataBase: new URL("https://thecompounder.fyi"),
  title: "Compounder · 复利",
  description:
    "Compounder (复利) — an editorial read on smart-money holdings, single-stock valuation, and the macro funding backdrop.",
};
```

Replace with:
```typescript
export const metadata: Metadata = {
  metadataBase: new URL("https://thecompounder.fyi"),
  title: {
    default: "Compounder · 复利",
    template: "%s · Compounder",
  },
  description:
    "Compounder (复利) — an editorial read on smart-money holdings, single-stock valuation, and the macro funding backdrop.",
  applicationName: "Compounder",
  openGraph: {
    type: "website",
    siteName: "Compounder",
    title: "Compounder · 复利",
    description:
      "An editorial read on smart-money 13F holdings, single-stock valuation, and the macro funding backdrop.",
    url: "https://thecompounder.fyi",
  },
  twitter: {
    card: "summary_large_image",
    title: "Compounder · 复利",
    description:
      "Smart-money 13F holdings, single-stock valuation, and the macro funding backdrop.",
  },
};
```

> `metadataBase` makes the relative `opengraph-image` resolve to an absolute URL automatically. The per-page `title` strings (which already include "Compounder · 复利") will be wrapped by the template — verify no double-branding looks wrong in Step 2; if it does, drop the `template` line.

- [ ] **Step 2: Typecheck**

Run: `cd web && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add web/src/app/layout.tsx
git commit -m "feat(seo): global OpenGraph + Twitter card defaults in root layout"
```

---

## Task 5: Root redirect → 308 permanent

**Files:**
- Modify: `src/app/page.tsx`

- [ ] **Step 1: Use permanentRedirect**

Current:
```typescript
import { redirect } from "next/navigation";

export default function Root() {
  redirect("/zh");
}
```

Replace with:
```typescript
import { permanentRedirect } from "next/navigation";

// Root domain permanently resolves to the default (zh) locale.
// 308 (vs 307) tells Google /zh is the canonical home and passes signals.
export default function Root() {
  permanentRedirect("/zh");
}
```

- [ ] **Step 2: Typecheck**

Run: `cd web && npx tsc --noEmit`
Expected: no errors. (`permanentRedirect` is exported from `next/navigation` in Next 16 — confirm in `node_modules/next/dist/docs` if unsure.)

- [ ] **Step 3: Commit**

```bash
git add web/src/app/page.tsx
git commit -m "fix(seo): root redirect 307→308 permanent to /zh"
```

---

## Task 6: robots.ts — AI-bot allowlist + host

**Files:**
- Modify: `src/app/robots.ts`

- [ ] **Step 1: Replace robots()**

```typescript
import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      { userAgent: "*", allow: "/" },
      // Explicitly welcome AI answer-engine + training crawlers (GEO).
      { userAgent: "GPTBot", allow: "/" },
      { userAgent: "OAI-SearchBot", allow: "/" },
      { userAgent: "ChatGPT-User", allow: "/" },
      { userAgent: "PerplexityBot", allow: "/" },
      { userAgent: "ClaudeBot", allow: "/" },
      { userAgent: "Claude-Web", allow: "/" },
      { userAgent: "Google-Extended", allow: "/" },
      { userAgent: "Applebot-Extended", allow: "/" },
      { userAgent: "Bytespider", allow: "/" },
    ],
    sitemap: "https://thecompounder.fyi/sitemap.xml",
    host: "https://thecompounder.fyi",
  };
}
```

- [ ] **Step 2: Typecheck**

Run: `cd web && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add web/src/app/robots.ts
git commit -m "feat(geo): explicit AI-bot allowlist + host in robots"
```

---

## Task 7: sitemap.ts — hreflang alternates + lastModified + full stocks

**Files:**
- Modify: `src/app/sitemap.ts`

- [ ] **Step 1: Rewrite sitemap() with per-URL alternates**

```typescript
import type { MetadataRoute } from "next";
import { getManagerIndex } from "@/lib/managers/source";
import { mostHeld } from "@/lib/aggregations";
import { MACRO_GROUPS } from "@/lib/nav";

const BASE = "https://thecompounder.fyi";
const LANGS = ["zh", "en"] as const;

// hreflang alternates for a locale-agnostic suffix like "/stocks/AAPL" or ""
function alts(suffix: string) {
  return {
    languages: {
      "zh-CN": `${BASE}/zh${suffix}`,
      en: `${BASE}/en${suffix}`,
      "x-default": `${BASE}/zh${suffix}`,
    },
  };
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const idx = await getManagerIndex();
  const held = await mostHeld(500); // was 50 — surface the full stock long tail
  const indicators = MACRO_GROUPS.flatMap((g) => g.indicators as readonly string[]);
  const urls: MetadataRoute.Sitemap = [];

  // Locale-agnostic suffixes paired with crawl hints
  const statics: { suffix: string; freq: "daily" | "weekly"; pr: number }[] = [
    { suffix: "", freq: "daily", pr: 1 },
    { suffix: "/investors", freq: "weekly", pr: 0.8 },
    { suffix: "/stocks", freq: "weekly", pr: 0.8 },
    { suffix: "/macro", freq: "daily", pr: 0.7 },
  ];

  for (const lang of LANGS) {
    for (const s of statics) {
      urls.push({
        url: `${BASE}/${lang}${s.suffix}`,
        lastModified: new Date(),
        changeFrequency: s.freq,
        priority: s.pr,
        alternates: alts(s.suffix),
      });
    }
    for (const m of idx.managers ?? []) {
      const suffix = `/investors/${m.slug}`;
      urls.push({
        url: `${BASE}/${lang}${suffix}`,
        lastModified: new Date(),
        changeFrequency: "weekly",
        priority: 0.7,
        alternates: alts(suffix),
      });
    }
    for (const h of held) {
      const suffix = `/stocks/${h.cusip}`;
      urls.push({
        url: `${BASE}/${lang}${suffix}`,
        lastModified: new Date(),
        changeFrequency: "weekly",
        priority: 0.6,
        alternates: alts(suffix),
      });
    }
    for (const ind of indicators) {
      const suffix = `/macro/${ind}`;
      urls.push({
        url: `${BASE}/${lang}${suffix}`,
        lastModified: new Date(),
        changeFrequency: "daily",
        priority: 0.6,
        alternates: alts(suffix),
      });
    }
  }
  return urls;
}
```

> Verify `mostHeld(n)` accepts `500` and that `h.cusip` is the same field used in the existing sitemap (it is — line 20 of the original). If `mostHeld` caps internally, leave 500; it just returns what it has.

- [ ] **Step 2: Typecheck**

Run: `cd web && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add web/src/app/sitemap.ts
git commit -m "feat(seo): sitemap hreflang alternates + lastModified + full stock list"
```

---

## Task 8: Home page — ISR + OpenGraph + WebSite JSON-LD

**Files:**
- Modify: `src/app/[lang]/page.tsx`

- [ ] **Step 1: Swap force-dynamic for ISR**

Find: `export const dynamic = "force-dynamic";`
Replace with:
```typescript
// Home data refreshes at most hourly; ISR lets Googlebot fetch cached HTML fast.
export const revalidate = 3600;
```

- [ ] **Step 2: Add OpenGraph to generateMetadata**

In `generateMetadata`, add the `ogFor` import at top of file (with the other `@/lib` imports):
```typescript
import { ogFor, websiteLd, organizationLd } from "@/lib/seo";
```

Then change the returned object from:
```typescript
  return {
    title,
    description,
    alternates: { canonical: `/${l}`, languages: { "zh-CN": "/zh", en: "/en" } },
  };
```
to:
```typescript
  return {
    title,
    description,
    alternates: { canonical: `/${l}`, languages: { "zh-CN": "/zh", en: "/en" } },
    ...ogFor({ lang: l, title, description, path: `/${l}` }),
  };
```

- [ ] **Step 3: Enrich JSON-LD (add WebSite + Organization)**

The page currently builds a single `ld` Organization object (around line 110) and renders one `<script>` (line 138). Replace the `const ld = {...}` block with a use of the builders and render an array. Change the `const ld = { ... }` object to:
```typescript
  const ldGraph = [organizationLd(lang), websiteLd(lang)];
```
and change the render (line ~137-140) from:
```tsx
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(ld) }}
      />
```
to:
```tsx
      {ldGraph.map((node, i) => (
        <script
          key={i}
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(node) }}
        />
      ))}
```

- [ ] **Step 4: Typecheck**

Run: `cd web && npx tsc --noEmit`
Expected: no errors. If `isZh`/old `ld` vars are now unused, remove them.

- [ ] **Step 5: Commit**

```bash
git add web/src/app/[lang]/page.tsx
git commit -m "feat(seo): home ISR + OpenGraph + WebSite/Organization JSON-LD"
```

---

## Task 9: Listing pages — ISR + OpenGraph (stocks, macro, investors)

**Files:**
- Modify: `src/app/[lang]/stocks/page.tsx`
- Modify: `src/app/[lang]/macro/page.tsx`
- Modify: `src/app/[lang]/investors/page.tsx`

- [ ] **Step 1: stocks/page.tsx — ISR + og**

Replace `export const dynamic = "force-dynamic";` with:
```typescript
export const revalidate = 3600;
```
Add `import { ogFor } from "@/lib/seo";` to the imports. In `generateMetadata`, spread `ogFor` into the returned object using the same `title`/`description`/canonical `path` the function already computes (path = the existing `alternates.canonical` value, e.g. `/${l}/stocks`):
```typescript
    ...ogFor({ lang: l, title, description, path: `/${l}/stocks` }),
```

- [ ] **Step 2: macro/page.tsx — ISR + og**

Replace `export const dynamic = "force-dynamic";` with:
```typescript
export const revalidate = 3600;
```
Add `import { ogFor } from "@/lib/seo";`. Spread into the returned metadata:
```typescript
    ...ogFor({ lang: l, title, description, path: `/${l}/macro` }),
```

- [ ] **Step 3: investors/page.tsx — og only (no force-dynamic here)**

Add `import { ogFor } from "@/lib/seo";`. Spread into the returned metadata:
```typescript
    ...ogFor({ lang: l, title, description, path: `/${l}/investors` }),
```

> For each page, confirm the local variable names are `title`, `description`, and `l` (the normalized lang). If a page names them differently, adapt the spread accordingly — do not invent new variables.

- [ ] **Step 4: Typecheck**

Run: `cd web && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add web/src/app/[lang]/stocks/page.tsx web/src/app/[lang]/macro/page.tsx web/src/app/[lang]/investors/page.tsx
git commit -m "feat(seo): listing pages ISR + OpenGraph"
```

---

## Task 10: Stock detail — OpenGraph + Dataset JSON-LD

**Files:**
- Modify: `src/app/[lang]/stocks/[ticker]/page.tsx`

- [ ] **Step 1: OpenGraph in generateMetadata**

Add `import { ogFor, datasetLd } from "@/lib/seo";` to imports. In `generateMetadata`, both the zh and en branches return `{ title, description, alternates }`. Refactor so OG is shared — compute `title`/`description` into locals then return once. Concretely replace the final `return lang === "zh" ? {...} : {...}` with:
```typescript
  const title =
    lang === "zh"
      ? `${issuer}（${ticker}）— 谁在持有 / 机构持仓 — Compounder · 复利`
      : `${issuer} (${ticker}) — Who's Holding — Compounder · 复利`;
  const description =
    lang === "zh"
      ? `查看持有 ${issuer}（${ticker}）的超级投资者，了解机构持仓分布。`
      : `See which superinvestors hold ${issuer} (${ticker}) and their position sizes.`;
  return {
    title,
    description,
    alternates,
    ...ogFor({ lang: l, title, description, path: `/${l}/stocks/${ticker}`, type: "article" }),
  };
```

- [ ] **Step 2: Add Dataset JSON-LD next to existing breadcrumb**

The page already renders a `breadcrumb` `<script>` (line ~218). Locate where `breadcrumb` is built (line ~207) and the issuer/ticker are in scope inside the default page component. Add a dataset node and render it adjacent to the breadcrumb script:
```tsx
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify(
              datasetLd({
                lang,
                name:
                  lang === "zh"
                    ? `${issuer}（${ticker}）机构持仓`
                    : `${issuer} (${ticker}) institutional holders`,
                description:
                  lang === "zh"
                    ? `持有 ${issuer}（${ticker}）的超级投资者 13F 持仓数据，来源 SEC EDGAR。`
                    : `Superinvestor 13F holdings of ${issuer} (${ticker}), sourced from SEC EDGAR.`,
                url: `https://thecompounder.fyi/${lang}/stocks/${ticker}`,
              })
            ),
          }}
        />
```

> `issuer` is resolved in `generateMetadata`, not necessarily in the page body. If `issuer`/`ticker` are not already in scope where the breadcrumb is rendered, reuse whatever issuer/display variable the page body already computes for its heading; do not duplicate the cusip lookup.

- [ ] **Step 3: Typecheck**

Run: `cd web && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add web/src/app/[lang]/stocks/[ticker]/page.tsx
git commit -m "feat(seo): stock detail OpenGraph + Dataset JSON-LD"
```

---

## Task 11: Investor detail — OpenGraph + Person JSON-LD

**Files:**
- Modify: `src/app/[lang]/investors/[slug]/page.tsx`

- [ ] **Step 1: OpenGraph in generateMetadata**

Add `import { ogFor, personLd } from "@/lib/seo";`. The function returns zh/en branches with `{ title, description, alternates }`. Refactor to compute locals and return once:
```typescript
  const title =
    lang === "zh"
      ? `${person} 持仓 13F — Compounder · 复利`
      : `${person} 13F Holdings — Compounder · 复利`;
  const description =
    lang === "zh"
      ? `${name} — ${person} 的最新 SEC 13F 季度持仓披露，持仓明细与环比变动。`
      : `${name} — Latest SEC 13F quarterly holdings for ${person}, with positions and quarter-over-quarter changes.`;
  return {
    title,
    description,
    alternates,
    ...ogFor({ lang: l, title, description, path: `/${l}/investors/${slug}`, type: "profile" }),
  };
```

- [ ] **Step 2: Add Person JSON-LD next to existing breadcrumb**

The page renders a `breadcrumb` `<script>` (~line 335). In the page body, `d.manager` provides `person` and `name`. Add adjacent to the breadcrumb script:
```tsx
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify(
              personLd({
                name: d.manager.person,
                affiliation: d.manager.name,
                url: `https://thecompounder.fyi/${lang}/investors/${slug}`,
              })
            ),
          }}
        />
```

> Confirm `d`, `slug`, and `lang` are in scope at the render site (the page already uses them for the breadcrumb). If the manager variable is named differently in the body, match it.

- [ ] **Step 3: Typecheck**

Run: `cd web && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add web/src/app/[lang]/investors/[slug]/page.tsx
git commit -m "feat(seo): investor detail OpenGraph + Person JSON-LD"
```

---

## Task 12: Full build verification

- [ ] **Step 1: Production build**

Run: `cd web && npm run build`
Expected: build succeeds. Confirm in output that `/[lang]` routes are **not** marked `ƒ (Dynamic)` for stocks/macro/home where ISR was added (they should be `ISR`/`revalidate`), and `/opengraph-image`, `/icon.png`, `/apple-icon.png`, `/sitemap.xml`, `/robots.txt` all appear.

- [ ] **Step 2: Spot-check rendered head + structured data**

Run (in one terminal `npm run start`, then):
```bash
curl -s http://localhost:3000/zh | grep -iE 'og:|twitter:|application/ld\+json|rel="icon"|rel="apple-touch'
curl -s http://localhost:3000/sitemap.xml | grep -i 'hreflang\|xhtml:link' | head
curl -s http://localhost:3000/robots.txt
curl -sI http://localhost:3000/ | grep -i '^location\|308'
```
Expected: og/twitter tags present; sitemap shows `<xhtml:link rel="alternate" hreflang=...>`; robots lists AI bots; `/` returns 308 → `/zh`.

- [ ] **Step 3: Validate JSON-LD**

Copy a page's JSON-LD into the [Schema Markup Validator](https://validator.schema.org/) (manual). Expected: WebSite, Organization, BreadcrumbList, Dataset/Person parse with no errors.

- [ ] **Step 4: Final commit (if any cleanup)**

```bash
git add -A web/
git commit -m "chore(seo): build verification fixes" || echo "nothing to commit"
```

---

## Post-merge manual follow-ups (not code — do after deploy)

These are outside the codebase but required to fully realize the gains:

1. **Google Search Console** → submit `https://thecompounder.fyi/sitemap.xml`; use URL Inspection on `/zh` and request indexing; check the favicon under the page's "Live test."
2. **Re-request favicon crawl:** Google refetches favicons on its own cadence (days–weeks). The 96px `icon.png` is the fix; GSC can nudge recrawl.
3. **GEO content depth (next phase, separate plan):** add a 1–2 sentence "As of {date}, source: SEC EDGAR / NY Fed" factual lede to each data page and an FAQ block — this is what AI answer engines quote. Tracked separately from this technical-framework plan.

---

## Self-Review

- **Spec coverage:** favicon (T2), force-dynamic→ISR (T8/T9), OpenGraph+Twitter (T3/T4/T8–T11), OG images (T3), sitemap hreflang+lastModified+full stocks (T7), JSON-LD WebSite/Breadcrumb/Dataset/Person (T1/T8/T10/T11), robots AI-bot allowlist (T6), root 308 (T5). All six "thin" problems + icon problem + GEO robots covered. Content-depth (problem #6) is explicitly deferred to a follow-up plan (noted above) since it touches editorial copy, not framework.
- **Placeholders:** none — every code step shows full code.
- **Type consistency:** `ogFor`/`organizationLd`/`websiteLd`/`breadcrumbLd`/`datasetLd`/`personLd` signatures defined in T1 match all call sites in T8–T11. `Lang` imported from `@/lib/nav` consistently.
- **Risk note:** Several tasks assume local variable names (`title`, `description`, `l`, `issuer`, `d.manager`) in existing `generateMetadata` functions; each task flags "confirm/adapt if named differently" so the executor verifies against the actual file rather than blindly pasting.
