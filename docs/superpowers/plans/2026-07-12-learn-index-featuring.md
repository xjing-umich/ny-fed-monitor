# Learn 首页置顶改造 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 `/learn` 索引页从扁平等权列表升级为四区块编辑首页(品牌块 → 精选门面 → 最新自动置顶 → 其余列表),给品牌介绍和日常更新各一个凸显位。

**Architecture:** 纯页面 + 纯数据层改造,零迁移零部署 op。在 `learn.ts` 加品牌文案常量 `BRAND`、手挑门面 `FEATURED_SLUG`、三个纯函数(`getFeatured`/`getLatest`/`listRest`),不改 `Article` 类型;`/learn/page.tsx` 依次渲染四区块并收短页眉导语。复用既有 `getArticle`/`listArticles`/`ARTICLE_SLUGS`/`PageHeader`/`localePath`。

**Tech Stack:** Next.js 16 App Router(RSC),TypeScript,`--tt-*` 设计令牌,Tailwind。

## Global Constraints

- 回复正文与文档正文一律中文;代码/术语/路径除外。
- 双语文案各按各自语感,不逐字互译;每个 locale 纯本语言,禁中英混排。
- 所有面向用户文案守 `web/docs/copy-voice.md`:具体、有主张、数据先行,无空洞对偶/三元装饰枚举/煽情 em-dash/SaaS 腔/对冲词。
- 不构成投资建议(品牌块结尾保留免责句)。
- 布局只用 `--tt-*` 令牌 + `PageHeader`,不引入 shadcn Card,绿色克制(仅眉标/标签用 accent)。
- 本地 `next build`/dev 因 Google Fonts 被屏蔽必失败;唯一硬门是 `npx tsc --noEmit`(在 `web/` 下跑),纯函数额外用 tsx 冒烟。tsc 已知有 4 条来自 `.next/**` 陈旧 `research/[ticker]` 生成桩的报错,与本改动无关,核验时用 `grep -viE "research/\[ticker\]"` 过滤。
- 不改文章正文、不改详情页、不改首页 `LearnTeaser`、不加标签/分类体系。
- 当前分支 `plan/valuation-transparency-table`,直接在其上提交。

---

### Task 1: `learn.ts` — 品牌文案 + 门面常量 + 三个编排纯函数

**Files:**
- Modify: `web/src/lib/learn.ts`(在文件尾部 `listArticles` 之后追加)
- Test(冒烟): `web/scripts/smoke-learn-featuring.ts`(临时脚本,验完删除)

**Interfaces:**
- Consumes(已存在,签名精确):
  - `export const ARTICLE_SLUGS: string[]`(顺序:`how-to-read-a-13f`, `what-is-a-superinvestor`, `what-is-intrinsic-value`, `reading-cross-fund-consensus`, `q1-2026-superinvestor-consensus`, `reading-business-quality`)
  - `export function getArticle(slug: string, lang: Lang): Article | undefined`
  - `export function listArticles(lang: Lang): Article[]`
  - `interface Article { slug; title; description; updated /* "YYYY-MM-DD" */; intro; sections; related? }`
  - `type Lang`(来自 `@/lib/nav`,值为 `"en" | "zh"`)
- Produces(供 Task 2 使用,签名精确):
  - `export const FEATURED_SLUG: string`
  - `export const BRAND: Record<Lang, { body: string; aboutLabel: string }>`
  - `export function getFeatured(lang: Lang): Article | null`
  - `export function getLatest(lang: Lang): Article | null`
  - `export function listRest(lang: Lang): Article[]`

- [ ] **Step 1: 在 `learn.ts` 尾部(`listArticles` 函数闭合 `}` 之后)追加常量与函数**

```ts
/** 首页手挑的「从这里开始」门面文章。改这一行即可换门面。 */
export const FEATURED_SLUG = "what-is-intrinsic-value";

/**
 * Learn 首页品牌块文案(双语)。理念提炼自 /about,已对照 web/docs/copy-voice.md:
 * 落到北极星句 "…so the thinking is left to you" 的声音;em-dash 仅作同位澄清;
 * 不与页眉标题「读懂生意,而非代码」字面重复。
 */
export const BRAND: Record<Lang, { body: string; aboutLabel: string }> = {
  en: {
    body:
      "Compounder comes out of the value-investing tradition — Graham's margin of safety, Buffett's preference for good businesses at fair prices held for years. We pull superinvestors' 13F filings, valuation, and the macro backdrop into one place and keep it readable, so the judgment stays yours. Everything here is for learning, not investment advice.",
    aboutLabel: "About Compounder",
  },
  zh: {
    body:
      "Compounder 出自价值投资这一脉:格雷厄姆的安全边际,巴菲特那种以合理价格买好生意、然后拿住多年的偏好。我们把超级投资者的 13F、估值和宏观背景归到一处、做得可读,判断留给你。这里的一切只供学习,不构成投资建议。",
    aboutLabel: "关于 Compounder",
  },
};

/** 门面文章;取不到返回 null(区块隐藏)。 */
export function getFeatured(lang: Lang): Article | null {
  return getArticle(FEATURED_SLUG, lang) ?? null;
}

/**
 * 最新更新的文章 —— 在「非门面」文章里按 updated 取最新一篇。
 * updated 是 "YYYY-MM-DD",可直接字符串降序比较;缺 updated 的排最后(不参与竞争)。
 * 取不到返回 null。
 */
export function getLatest(lang: Lang): Article | null {
  const pool = listArticles(lang).filter((a) => a.slug !== FEATURED_SLUG && a.updated);
  if (pool.length === 0) return null;
  return pool.reduce((newest, a) => (a.updated > newest.updated ? a : newest));
}

/** 其余文章:全部指南去掉门面 + 最新两个 slug,原顺序不变。 */
export function listRest(lang: Lang): Article[] {
  const latest = getLatest(lang);
  const exclude = new Set<string>([FEATURED_SLUG]);
  if (latest) exclude.add(latest.slug);
  return listArticles(lang).filter((a) => !exclude.has(a.slug));
}
```

- [ ] **Step 2: 写冒烟脚本 `web/scripts/smoke-learn-featuring.ts`**

```ts
import { getFeatured, getLatest, listRest, FEATURED_SLUG } from "../src/lib/learn";

for (const lang of ["en", "zh"] as const) {
  const featured = getFeatured(lang);
  const latest = getLatest(lang);
  const rest = listRest(lang);

  // 门面 = 手挑 slug
  if (featured?.slug !== FEATURED_SLUG) throw new Error(`[${lang}] featured 应为 ${FEATURED_SLUG}, 实为 ${featured?.slug}`);
  // 最新 ≠ 门面
  if (latest && latest.slug === FEATURED_SLUG) throw new Error(`[${lang}] latest 不应等于门面`);
  // 当前数据下最新应是 q1-2026-superinvestor-consensus(updated 最大)之外的真实最大值;这里只断言"有值且非门面"
  if (!latest) throw new Error(`[${lang}] latest 不应为空(现有多篇带 updated)`);
  // 去重:rest 不含门面,也不含 latest
  const restSlugs = rest.map((a) => a.slug);
  if (restSlugs.includes(FEATURED_SLUG)) throw new Error(`[${lang}] rest 不应含门面`);
  if (latest && restSlugs.includes(latest.slug)) throw new Error(`[${lang}] rest 不应含 latest`);
  // 无重复
  if (new Set(restSlugs).size !== restSlugs.length) throw new Error(`[${lang}] rest 有重复`);
  // 总数守恒:featured(1) + latest(1) + rest = 全部
  const total = 1 + (latest ? 1 : 0) + rest.length;
  console.log(`[${lang}] featured=${featured?.slug} latest=${latest?.slug} rest=[${restSlugs.join(", ")}] total=${total}`);
}
console.log("smoke OK");
```

- [ ] **Step 3: 跑冒烟,确认三函数行为正确**

Run(在 `web/` 下):`npx tsx scripts/smoke-learn-featuring.ts`
Expected:两行 `[en]…` / `[zh]…` 打印,门面为 `what-is-intrinsic-value`,latest 为当前 `updated` 最大且非门面的那篇,rest 无重复无门面无 latest,结尾 `smoke OK`。无抛错。

- [ ] **Step 4: tsc 门**

Run(在 `web/` 下):`npx tsc --noEmit 2>&1 | grep -viE "research/\[ticker\]" | grep -i "learn" || echo "learn clean"`
Expected:输出 `learn clean`(learn 相关文件无类型错误)。

- [ ] **Step 5: 删冒烟脚本并提交**

```bash
rm web/scripts/smoke-learn-featuring.ts
git add web/src/lib/learn.ts
git commit -m "feat(learn): 首页编排数据层(BRAND/FEATURED_SLUG/getFeatured/getLatest/listRest)"
```

---

### Task 2: `/learn/page.tsx` — 四区块渲染 + 页眉导语收短

**Files:**
- Modify: `web/src/app/[lang]/learn/page.tsx`

**Interfaces:**
- Consumes(来自 Task 1 + 既有):`getFeatured`/`getLatest`/`listRest`/`BRAND` from `@/lib/learn`;`localePath` from `@/lib/urls`;`PageHeader`(props:`eyebrow?`, `title`, `intro?`)。
- Produces:无(终端页面)。

- [ ] **Step 1: 改 import,引入新函数**

把首行 imports 里的:
```ts
import { listArticles } from "@/lib/learn";
```
改为:
```ts
import { getFeatured, getLatest, listRest, BRAND } from "@/lib/learn";
```

- [ ] **Step 2: 页眉导语收短 + 新增区块文案键**

把 `COPY` 常量整体替换为(en/zh 各加 `startHere`/`latest` 标签;`intro` 收成一句纯定位,理念交给品牌块):

```ts
const COPY = {
  en: {
    title: "Learn",
    eyebrow: "Learn",
    heading: "Learn to read businesses, not tickers",
    intro: "Plain guides to reading businesses the way serious investors do.",
    startHere: "Start here",
    latest: "Latest",
    updated: "Updated",
  },
  zh: {
    title: "学习",
    eyebrow: "学习",
    heading: "读懂生意，而非代码",
    intro: "像严肃投资者那样读懂生意的大白话指南。",
    startHere: "从这里开始",
    latest: "最新",
    updated: "更新于",
  },
} as const;
```

- [ ] **Step 3: 替换页面主体渲染(四区块)**

把 `LearnIndexPage` 的函数体里从 `const articles = listArticles(lang);` 到 `return (…);` 结束整段替换为:

```tsx
  const { lang: rawLang } = await params;
  const lang: Lang = rawLang === "en" ? "en" : "zh";
  const c = COPY[lang];
  const brand = BRAND[lang];
  const featured = getFeatured(lang);
  const latest = getLatest(lang);
  const rest = listRest(lang);

  return (
    <article className="max-w-[720px] mx-auto py-8 sm:py-10">
      <PageHeader eyebrow={c.eyebrow} title={c.heading} intro={c.intro} />

      {/* 品牌块:理念常驻凸显,accent 左描边区别于列表 */}
      <section className="mt-8 border-l-2 border-[var(--tt-accent)] pl-4">
        <p className="text-sm leading-relaxed text-[var(--tt-muted)]">{brand.body}</p>
        <Link
          href={localePath(lang, "/about")}
          className="mt-2 inline-block font-mono text-[10px] uppercase tracking-[0.08em] text-[var(--tt-accent)] no-underline hover:underline"
        >
          {brand.aboutLabel} →
        </Link>
      </section>

      {/* 从这里开始:手挑基石文,大卡 */}
      {featured ? (
        <Link
          href={localePath(lang, `/learn/${featured.slug}`)}
          className="group mt-8 block border-t border-[var(--tt-border)] pt-6 no-underline"
        >
          <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-[var(--tt-accent)]">
            {c.startHere}
          </span>
          <h2 className="mt-2 font-display text-2xl font-medium leading-tight text-[var(--tt-text)] group-hover:text-[var(--tt-accent)] transition-colors">
            {featured.title}
          </h2>
          <p className="mt-1.5 text-sm leading-relaxed text-[var(--tt-muted)]">
            {featured.description}
          </p>
        </Link>
      ) : null}

      {/* 最新:按 updated 自动置顶 */}
      {latest ? (
        <Link
          href={localePath(lang, `/learn/${latest.slug}`)}
          className="group mt-6 block border-t border-[var(--tt-border)] pt-5 no-underline"
        >
          <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-[var(--tt-accent)]">
            {c.latest}
          </span>
          <h2 className="mt-2 text-lg font-medium text-[var(--tt-text)] group-hover:text-[var(--tt-accent)] transition-colors">
            {latest.title}
          </h2>
          <p className="mt-1.5 text-sm leading-relaxed text-[var(--tt-muted)]">
            {latest.description}
          </p>
          {latest.updated ? (
            <p className="mt-2 font-mono text-[10px] uppercase tracking-[0.08em] text-[var(--tt-faint)]">
              {c.updated} {latest.updated}
            </p>
          ) : null}
        </Link>
      ) : null}

      {/* 全部指南:其余文章,沿用原列表样式 */}
      {rest.length > 0 ? (
        <ul className="mt-8 flex flex-col">
          {rest.map((a) => (
            <li key={a.slug} className="border-t border-[var(--tt-border)] py-5">
              <Link href={localePath(lang, `/learn/${a.slug}`)} className="group no-underline">
                <h2 className="text-lg font-medium text-[var(--tt-text)] group-hover:text-[var(--tt-accent)] transition-colors">
                  {a.title}
                </h2>
                <p className="mt-1.5 text-sm leading-relaxed text-[var(--tt-muted)]">
                  {a.description}
                </p>
                {a.updated ? (
                  <p className="mt-2 font-mono text-[10px] uppercase tracking-[0.08em] text-[var(--tt-faint)]">
                    {c.updated} {a.updated}
                  </p>
                ) : null}
              </Link>
            </li>
          ))}
        </ul>
      ) : null}
    </article>
  );
```

- [ ] **Step 4: tsc 门**

Run(在 `web/` 下):`npx tsc --noEmit 2>&1 | grep -viE "research/\[ticker\]" | grep -iE "learn/page" || echo "page clean"`
Expected:输出 `page clean`。

- [ ] **Step 5: 提交**

```bash
git add web/src/app/[lang]/learn/page.tsx
git commit -m "feat(learn): 首页四区块(品牌块/从这里开始/最新/全部指南)"
```

---

## 部署与人工核验(合并后)

- 本地无法渲染(Google Fonts 屏蔽 `next build`);合并到 `db-foundation` 后在 Vercel preview 上人工核验:
  - `/learn` 与 `/zh/learn` 四区块顺序正确、层级清晰。
  - 品牌块「关于 Compounder →」跳 `/about`;门面跳 `what-is-intrinsic-value`;最新跳当前 `updated` 最大的那篇。
  - 全部指南不含门面/最新(无重复)。
  - 双语各自纯语言,文案念出来像人话、非发布会腔。

## Self-Review 记录

- **Spec 覆盖**:品牌块(Task 2 §品牌块 + Task 1 `BRAND`)/ 门面(`FEATURED_SLUG`+`getFeatured`)/ 最新自动(`getLatest`)/ 其余去重(`listRest`)/ 页眉收短(Task 2 Step 2)/ 边界(函数返回 null → 区块 `? :` 隐藏)/ 令牌与非 shadcn(Task 2 className 全 `--tt-*`)—— 均有对应任务。
- **无占位符**:所有代码块为可直接落地的完整实现。
- **类型一致**:`getFeatured/getLatest` 返回 `Article | null`,Task 2 用 `featured ? … : null` / `latest ? … : null` 对齐;`BRAND` 的 `{ body; aboutLabel }` 形状在 Task 2 以 `brand.body`/`brand.aboutLabel` 消费一致。
