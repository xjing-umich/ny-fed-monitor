# /learn Module — Design

Date: 2026-06-07
Branch: `feat/learn-module`

## Context

Compounder needs an owned-domain home for evergreen SEO articles, so that
search equity and external-post link targets compound on thecompounder.fyi
rather than on Medium/Reddit. The site currently has no blog/article capability
— only data pages, legal pages, and About.

Approach chosen: **content-as-code** (option A), reusing the existing
`LegalDoc` → `ProseDoc` pattern. No MDX dependency. URL section: `/learn`.

## Scope

### Routes
- `/[lang]/learn` — article index/list page (SEO hub + internal-link node).
- `/[lang]/learn/[slug]` — article page, body rendered via existing `ProseDoc`.

### Content layer — `web/src/lib/learn.ts`
- `Article` interface = the `LegalDoc` shape (title / intro / sections) plus
  `slug`, `description` (meta + list-page summary), and `updated` (date).
- Exports: `getArticle(slug, lang)`, `listArticles(lang)`, `ARTICLE_SLUGS`.
- Bilingual: English-first + Chinese; both langs written in full (the route is
  statically generated for en and zh, so zh must not be empty).

### SEO / GEO (the core value)
- Per-article `generateMetadata`: title, description, canonical, hreflang
  alternates (en / zh-CN / x-default), mirroring existing pages.
- `Article` JSON-LD per article (headline, datePublished/dateModified,
  author/publisher = Compounder) — consistent with existing FAQ/Breadcrumb
  schema, improves AI/Google citation.
- Sitemap: add the `/learn` index plus each article by iterating `ARTICLE_SLUGS`.

### Navigation
- Add "Learn / 学习" to `TOP_NAV` (primary content entry + internal linking).
- Add a Learn link to the footer Explore column (falls out of TOP_NAV mapping).

### First batch (full bilingual copy, written as part of this work)
1. **How to Read a 13F** — what a 13F is, what it shows, and what it does NOT
   show (up to 45-day lag, no shorts/options detail, quarterly snapshot not
   real-time). Holds the educational, non-advice line; soft-links to `/stocks`.
2. **What Is a Superinvestor** — definition + the Graham → Buffett value lineage
   + compounding philosophy; soft-links to `/investors`.

## Out of scope / unchanged
- ProseDoc, legal pages, and data pages are untouched.
- No MDX, no RSS (can revisit if article volume grows).
- Quarterly 13F-roundup posts and outbound channel drafts (separate follow-up).

## Verification
Solo-dev convention: `tsc --noEmit` clean + manual page review
(`/en/learn`, `/en/learn/how-to-read-a-13f`, `/zh/learn/...`, nav link,
sitemap contains the new routes).
