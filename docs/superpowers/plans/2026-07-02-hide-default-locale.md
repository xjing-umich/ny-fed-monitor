# 英文默认语言免前缀（hide-default-locale）实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 always-prefix 的 i18n 路由迁移到 hide-default-locale——英文用裸 URL、中文保留 `/zh`——且不损伤现有 SEO/GEO 收录。

**Architecture:** 新增 `src/proxy.ts`（Next 16 中间件新约定）在服务端做 rewrite（裸→`/en`，URL 不变）与 301（旧 `/en/*`→裸，合并收录），`/zh/*` 放行。把「en 无前缀、zh 带前缀」的规则收敛到 `src/lib/urls.ts` 的单一 `localePath()` helper，全站所有 URL 出口（canonical/hreflang/sitemap/JSON-LD/内链/OG/manifest）一律经它，杜绝散拼。底层 `src/app/[lang]/…` 目录与页面组件不动。

**Tech Stack:** Next.js 16 App Router（SSR，无 static export）、React 19、TypeScript。验证靠 `next dev` + curl + `npx tsc --noEmit` + preview 抓页面（本项目无测试套件）。

## Global Constraints

- 本项目**无测试套件**（solo dev）：每个任务的「测试」= `npx tsc --noEmit` 通过 + 相应 curl/grep/preview 验证；不要新建 jest/vitest。
- Next 16 中间件文件叫 **`proxy.ts`**（`export function proxy`），不是 `middleware.ts`。
- 设计令牌只用 `--tt-*`；本次**不改任何视觉/文案/组件外观**——纯路由与 URL 出口迁移。
- 所有绝对 URL 的域名源为 `https://thecompounder.fyi`（`SITE_ORIGIN`）。
- 数据来源标注纪律（CLAUDE.md）与本次无关（不碰数据层）。
- 每个任务结束提交；提交 trailer：`Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`。
- 工作分支 `feat/hide-default-locale`（已建，基于 `db-foundation`，在 worktree `.claude/worktrees/hide-default-locale`）。

**每个任务的隐含验收**：`npx tsc --noEmit` = 0。命令须在 worktree 的 `web/` 目录跑。

---

### Task 1: 前缀规则单一真相源（`localePath` + `altFor`）

这是地基，后续所有任务依赖它。

**Files:**
- Modify: `web/src/lib/urls.ts`
- Modify: `web/src/lib/seo.ts`

**Interfaces:**
- Produces:
  - `localePath(lang: Lang, path: string): string` — `path` 是**无语言前缀**的应用内路径（如 `""`、`"/investors/x"`）；en 返回 `path || "/"`，zh 返回 `/zh${path}`。
  - `investorPath/stockPath/macroPath(lang, x): string` — 签名不变，内部改用 `localePath`。
  - `absoluteUrl(path: string): string` — 不变，`SITE_ORIGIN + path`。
  - `altFor(lang: Lang, path: string): { canonical: string; languages: Record<string,string> }` — 每页 `alternates` 统一构造器。

- [ ] **Step 1: 改 `web/src/lib/urls.ts`**

把现有三个 helper 的实现替换为经 `localePath`，并新增 `localePath`：

```ts
import type { Lang } from "@/lib/nav";

// en → 无前缀；zh → /zh 前缀。全站唯一定义此规则的地方。
// path 是无语言前缀的应用内路径,如 "" / "/investors/AAPL"。
export const localePath = (lang: Lang, path: string): string =>
  lang === "en" ? (path || "/") : `/zh${path}`;

export const investorPath = (lang: Lang, slug: string) => localePath(lang, `/investors/${slug}`);
// 个股 URL 以 ticker 为锚(无 ticker 的标的回退用 cusip, 仍可访问)
export const stockPath = (lang: Lang, tickerOrCusip: string) => localePath(lang, `/stocks/${tickerOrCusip}`);
export const macroPath = (lang: Lang, indicator: string) => localePath(lang, `/macro/${indicator}`);

// 站点 canonical 源（与 layout.tsx metadataBase 一致）。分享/外链需绝对地址。
export const SITE_ORIGIN = "https://thecompounder.fyi";
export const absoluteUrl = (path: string) => `${SITE_ORIGIN}${path}`;
```

- [ ] **Step 2: 在 `web/src/lib/seo.ts` 新增 `altFor`**

在文件末尾（或 `ogFor` 之后）加入。注意 `seo.ts` 已 `import type { Lang }` 与 `SITE_ORIGIN, absoluteUrl`；补 `localePath` 到那条 import：

```ts
// 现有 import 改为:
import { SITE_ORIGIN, absoluteUrl, localePath } from "@/lib/urls";
```

```ts
/**
 * 每页 alternates（canonical + hreflang）统一构造器。
 * path 是无语言前缀的应用内路径,如 "/investors/AAPL"、"" (首页)。
 * en/x-default → 裸；zh-CN → /zh 前缀。杜绝各页散拼 /en 硬编码。
 */
export function altFor(lang: Lang, path: string) {
  return {
    canonical: localePath(lang, path),
    languages: {
      en: localePath("en", path),
      "zh-CN": localePath("zh", path),
      "x-default": localePath("en", path),
    },
  };
}
```

- [ ] **Step 3: 验证 tsc**

Run（在 worktree）：`cd web && npx tsc --noEmit`
Expected: 退出码 0（此步只改 helper，尚未改调用点，`ogFor` 的 `path` 参数仍旧值，不报错）。

- [ ] **Step 4: 提交**

```bash
git add web/src/lib/urls.ts web/src/lib/seo.ts
git commit -m "feat(i18n): localePath/altFor 单一前缀真相源(en 裸/zh 带前缀)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 2: 运行时路由 `src/proxy.ts`

**Files:**
- Create: `web/src/proxy.ts`

**Interfaces:**
- Consumes: 无（独立模块，spec 要求 proxy 不依赖共享 globals）。
- Produces: 运行时行为——`/zh/*` 放行、`/en/*` 301 去前缀、其它裸路径 rewrite 到 `/en`。

- [ ] **Step 1: 创建 `web/src/proxy.ts`**

```ts
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// hide-default-locale 路由:
//  1. /zh 或 /zh/… → 放行(中文带前缀)
//  2. /en 或 /en/… → 301 去掉 /en,合并旧收录到裸 URL
//  3. 其它一切裸路径 → 内部 rewrite 到 /en + 原路径(地址栏保持裸,服务端出英文)
// 不做 Accept-Language 自动跳转:裸路径恒英文(spec §3)。
export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // 1. 中文:放行
  if (pathname === "/zh" || pathname.startsWith("/zh/")) {
    return NextResponse.next();
  }

  // 2. 旧英文前缀:301 到裸路径
  if (pathname === "/en" || pathname.startsWith("/en/")) {
    const stripped = pathname.slice(3) || "/"; // "/en" → "/", "/en/x" → "/x"
    const url = request.nextUrl.clone();
    url.pathname = stripped;
    return NextResponse.redirect(url, 301);
  }

  // 3. 裸英文路径:内部 rewrite 到 /en(URL 不变)
  const url = request.nextUrl.clone();
  url.pathname = `/en${pathname === "/" ? "" : pathname}`;
  return NextResponse.rewrite(url);
}

export const config = {
  // 排除 /api、Next 内部、以及**结尾为已知静态/元数据扩展名**的文件
  // (sitemap.xml、robots.txt、icon.png、manifest.webmanifest 等)。
  // 注意:只排除结尾扩展名,不能排除「任何含点的路径」——否则带点的 ticker
  // (如 /stocks/BRK.B、/stocks/BF.B) 会被误排除 → 裸 URL 不被 rewrite → 404。
  matcher: [
    "/((?!api|_next/static|_next/image|.*\\.(?:png|jpg|jpeg|gif|svg|ico|webp|avif|txt|xml|json|webmanifest)$).*)",
  ],
};
```

> 说明：matcher 只排除**结尾**为上述扩展名的路径，故 `sitemap.xml`/`robots.txt`/`icon.png` 等元数据不被 rewrite，而带点的 ticker 段（`/stocks/BRK.B`，无结尾静态扩展名）仍正常走 proxy。`/api` 显式排除（含 cron）。

- [ ] **Step 2: 起 dev server 验证路由矩阵**

Run（在 worktree `web/`）：
```bash
npm run dev   # 后台起；或用已在跑的 dev
```
然后（换一个终端 / 后续 curl）：
```bash
curl -sI http://localhost:3000/en/investors/berkshire-hathaway | grep -iE 'HTTP|location'
curl -sI http://localhost:3000/investors/berkshire-hathaway     | grep -iE 'HTTP'
curl -sI http://localhost:3000/zh/investors/berkshire-hathaway  | grep -iE 'HTTP'
curl -sI http://localhost:3000/                                  | grep -iE 'HTTP|location'
```
Expected:
- `/en/investors/berkshire-hathaway` → `301` + `location: /investors/berkshire-hathaway`
- `/investors/berkshire-hathaway` → `200`
- `/zh/investors/berkshire-hathaway` → `200`
- `/` → `200`（英文首页直接出，不再 307 到 /en）

> 注：`/` 目前仍受 `next.config.ts` 的 307 影响（Task 3 才删）。若本步 `/` 返回 307→/en 属预期中间态；Task 3 后应为 200。其余三条本步即应成立。

- [ ] **Step 3: 提交**

```bash
git add web/src/proxy.ts
git commit -m "feat(i18n): proxy 路由(裸 rewrite /en、旧 /en 301、/zh 放行)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 3: 删除 `next.config.ts` 的根 307 重定向

proxy 现已接管根路径处理，且我们要 `/` 直接出内容而非跳转。

**Files:**
- Modify: `web/next.config.ts`

- [ ] **Step 1: 删除 `/` → `/en` 那条 redirect**

在 `redirects()` 返回数组中，删除这一段（保留 `managers` 与 `sectionRedirects`）：

```ts
      {
        // Root → default locale...
        source: "/",
        destination: "/en",
        permanent: false,
      },
```

删除后 `return` 数组为：
```ts
    return [
      {
        source: "/:lang(zh|en)/managers",
        destination: "/:lang/investors",
        permanent: true,
      },
      ...sectionRedirects,
    ];
```

- [ ] **Step 2: 验证 `/` 出 200**

Run：`curl -sI http://localhost:3000/ | grep -iE 'HTTP|location'`
Expected: `200`（无 `location` 头）。若 dev server 有 config 缓存，重启 `npm run dev`。

- [ ] **Step 3: 验证 tsc + 提交**

Run：`cd web && npx tsc --noEmit` → 0
```bash
git add web/next.config.ts
git commit -m "feat(i18n): 删根 307(proxy 接管,/ 直接出英文首页)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 4: 迁移各页 `generateMetadata` 的 alternates → `altFor`

把每页内联散拼的 `canonical`/`languages` 换成 `altFor(lang, <裸路径>)`。同时把 `ogFor` 的 `path:` 参数从 `/${l}/…` 改成 `localePath(l, …)`（即裸路径版）。

**Files（含 alternates 或 ogFor path 的页面，逐个改）:**
- `web/src/app/[lang]/page.tsx`
- `web/src/app/[lang]/investors/page.tsx`
- `web/src/app/[lang]/investors/[slug]/page.tsx`
- `web/src/app/[lang]/investors/consensus/page.tsx`
- `web/src/app/[lang]/investors/buys/page.tsx`
- `web/src/app/[lang]/investors/sells/page.tsx`
- `web/src/app/[lang]/stocks/page.tsx`
- `web/src/app/[lang]/stocks/[ticker]/page.tsx`
- `web/src/app/[lang]/stocks/screener/page.tsx`
- `web/src/app/[lang]/macro/page.tsx`
- `web/src/app/[lang]/macro/[indicator]/page.tsx`
- `web/src/app/[lang]/macro/methodology/page.tsx`
- `web/src/app/[lang]/learn/page.tsx`
- `web/src/app/[lang]/learn/[slug]/page.tsx`
- `web/src/app/[lang]/about/page.tsx`
- `web/src/app/[lang]/terms/page.tsx`
- `web/src/app/[lang]/privacy/page.tsx`
- `web/src/app/[lang]/disclaimer/page.tsx`
- `web/src/app/[lang]/research/[ticker]/page.tsx`

**Interfaces:**
- Consumes: `altFor` (Task 1)、`localePath` (Task 1)。

- [ ] **Step 1: 统一转换规则**

每个文件顶部确保 import：
```ts
import { altFor } from "@/lib/seo";
import { localePath } from "@/lib/urls"; // 仅当该文件还用到 ogFor 的 path 或其它裸路径时
```

转换（以 `stocks/[ticker]/page.tsx` 为例，代表所有页的形状）：

Before：
```ts
  const alternates = {
    canonical: `/${l}/stocks/${ticker}`,
    languages: { en: `/en/stocks/${ticker}`, "zh-CN": `/zh/stocks/${ticker}`, "x-default": `/en/stocks/${ticker}` },
  };
  // ...
    ...ogFor({ lang, title: meta.title, description: meta.description, path: `/${l}/stocks/${ticker}` }),
```

After：
```ts
  const alternates = altFor(lang, `/stocks/${ticker}`);
  // ...
    ...ogFor({ lang, title: meta.title, description: meta.description, path: localePath(lang, `/stocks/${ticker}`) }),
```

首页 `page.tsx` 的对应形状：
Before：`alternates: { canonical: `/${l}`, languages: { en: "/en", "zh-CN": "/zh", "x-default": "/en" } }`
After：`alternates: altFor(lang, "")`

macro `[indicator]/page.tsx` 同理：`altFor(lang, `/macro/${indicator}`)`；ogFor path → `localePath(lang, `/macro/${indicator}`)`。

逐文件套用：canonical 的裸路径 = 去掉 `/${l}` 前缀后的部分。

- [ ] **Step 2: 机器验证无漏网 alternates 硬编码**

Run（在 worktree `web/`）：
```bash
grep -rn 'canonical: `/\${l\|"/en"\|"/zh"\|/en/\|/zh/' src/app/\[lang\] --include='*.tsx' | grep -iE 'canonical|languages|x-default|en:|zh-CN'
```
Expected: 无输出（所有 alternates 已走 `altFor`）。若有残留，改掉。

- [ ] **Step 3: tsc + 提交**

Run：`cd web && npx tsc --noEmit` → 0
```bash
git add web/src/app/\[lang\]
git commit -m "feat(i18n): 各页 canonical/hreflang 走 altFor(裸 en/zh 前缀)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 5: 迁移 JSON-LD 绝对 URL（GEO 命脉）

JSON-LD 里的 `item`/`url`/`@id` 是 AI 答案引擎引用页面的地址，必须与 canonical 一致（裸 en / `/zh`）。把硬编码的 `https://thecompounder.fyi/${lang}/…` 换成 `absoluteUrl(localePath(lang, …))`。

**Files:**
- `web/src/app/[lang]/investors/[slug]/page.tsx`（BreadcrumbList `item` ×2、Person `url`）
- `web/src/app/[lang]/stocks/[ticker]/page.tsx`（BreadcrumbList `item` ×2、Organization `url`）
- `web/src/app/[lang]/macro/[indicator]/page.tsx`（Dataset `url`）
- `web/src/app/[lang]/investors/consensus/page.tsx`
- `web/src/app/[lang]/investors/_movesPage.tsx`
- `web/src/app/[lang]/learn/[slug]/page.tsx`
- `web/src/app/[lang]/page.tsx`（WebSite/Organization 用裸域名 `https://thecompounder.fyi`，无 lang → **无需改**，仅确认）

**Interfaces:**
- Consumes: `absoluteUrl`、`localePath`（Task 1）。

- [ ] **Step 1: 确保 import**

每个文件补：
```ts
import { absoluteUrl, localePath } from "@/lib/urls";
```
（`investors/[slug]/page.tsx` 已 import `absoluteUrl`，补 `localePath`。）

- [ ] **Step 2: 转换 `investors/[slug]/page.tsx`**

Before（breadcrumb + person）：
```ts
        item: `https://thecompounder.fyi/${lang}/investors`,
        // ...
        item: `https://thecompounder.fyi/${lang}/investors/${manager.slug}`,
        // ...
    url: `https://thecompounder.fyi/${lang}/investors/${manager.slug}`,
```
After：
```ts
        item: absoluteUrl(localePath(lang, `/investors`)),
        // ...
        item: absoluteUrl(localePath(lang, `/investors/${manager.slug}`)),
        // ...
    url: absoluteUrl(localePath(lang, `/investors/${manager.slug}`)),
```

- [ ] **Step 3: 转换 `stocks/[ticker]/page.tsx`**

Before：
```ts
      { "@type": "ListItem", position: 1, name: lang === "zh" ? "个股" : "Stocks", item: `https://thecompounder.fyi/${lang}/stocks` },
      { "@type": "ListItem", position: 2, name: issuer, item: `https://thecompounder.fyi/${lang}/stocks/${ticker}` },
      // ...
    url: `https://thecompounder.fyi/${lang}/stocks/${ticker}`,
```
After：
```ts
      { "@type": "ListItem", position: 1, name: lang === "zh" ? "个股" : "Stocks", item: absoluteUrl(localePath(lang, `/stocks`)) },
      { "@type": "ListItem", position: 2, name: issuer, item: absoluteUrl(localePath(lang, `/stocks/${ticker}`)) },
      // ...
    url: absoluteUrl(localePath(lang, `/stocks/${ticker}`)),
```
`datasetLd({ ..., path })` 的 `path:` 参数若为 `/${l}/…`，改为 `localePath(lang, `/stocks/${ticker}`)`。

- [ ] **Step 4: 转换 `macro/[indicator]/page.tsx`**

Before：`url: `https://thecompounder.fyi/${lang}/macro/${indicator}`,`
After：`url: absoluteUrl(localePath(lang, `/macro/${indicator}`)),`

- [ ] **Step 5: 扫剩余文件同规则套用**

对 `consensus/page.tsx`、`_movesPage.tsx`、`learn/[slug]/page.tsx` 里任何 `https://thecompounder.fyi/${lang}/…` 或 `datasetLd`/`ogFor` 的 `/${l}/…` path，一律换 `absoluteUrl(localePath(lang, <裸路径>))` / `localePath(lang, <裸路径>)`。

- [ ] **Step 6: 机器验证 JSON-LD 无漏网**

Run：
```bash
grep -rn 'thecompounder.fyi/\${lang}\|thecompounder.fyi/\${l}' src/app/\[lang\] --include='*.tsx'
```
Expected: 无输出。

- [ ] **Step 7: tsc + 提交**

Run：`cd web && npx tsc --noEmit` → 0
```bash
git add web/src/app/\[lang\]
git commit -m "feat(i18n): JSON-LD url/item/@id 走 localePath(GEO 出口对齐 canonical)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 6: sitemap + manifest + layout OG url

**Files:**
- `web/src/app/sitemap.ts`
- `web/src/app/manifest.ts`
- `web/src/app/[lang]/layout.tsx`

**Interfaces:**
- Consumes: `localePath`（Task 1）。sitemap/manifest 在 `[lang]` 外，须 import：`import { localePath } from "@/lib/urls";`

- [ ] **Step 1: `sitemap.ts` — 主 URL 与 alternates 改裸 en 规则**

`entry()` 里的 `url` 与 `alternates.languages` 现为 `${BASE}/en${path}` / `${BASE}/zh${path}`。改为经裸规则：

Before：
```ts
  return {
    url: `${BASE}/en${path}`,
    // ...
    alternates: {
      languages: {
        en: `${BASE}/en${path}`,
        "zh-CN": `${BASE}/zh${path}`,
        "x-default": `${BASE}/en${path}`,
      },
    },
  };
```
After：
```ts
  return {
    url: `${BASE}${localePath("en", path)}`,
    // ...
    alternates: {
      languages: {
        en: `${BASE}${localePath("en", path)}`,
        "zh-CN": `${BASE}${localePath("zh", path)}`,
        "x-default": `${BASE}${localePath("en", path)}`,
      },
    },
  };
```
（`localePath("en","")` = `/`，故首页 entry `url` = `https://thecompounder.fyi/` —— 正确。）

- [ ] **Step 2: `manifest.ts` — start_url**

Before：`start_url: "/en",`
After：`start_url: "/",`

- [ ] **Step 3: `layout.tsx` — OG url**

Before：`url: isEn ? "https://thecompounder.fyi/en" : "https://thecompounder.fyi/zh",`
After：`url: isEn ? "https://thecompounder.fyi" : "https://thecompounder.fyi/zh",`
（`metadataBase` 保持 `https://thecompounder.fyi` 不变。第 115-117 行对非法 lang 的 `redirect("/en")` 保持——proxy rewrite 后 lang 恒 en/zh，此分支实际不会触发，无需改。）

- [ ] **Step 4: 验证 sitemap 主 URL 为裸**

Run：`curl -s http://localhost:3000/sitemap.xml | grep -oE '<loc>[^<]+</loc>' | head -5`
Expected: 形如 `https://thecompounder.fyi/`、`https://thecompounder.fyi/investors` —— **无 `/en`**。

- [ ] **Step 5: tsc + 提交**

Run：`cd web && npx tsc --noEmit` → 0
```bash
git add web/src/app/sitemap.ts web/src/app/manifest.ts web/src/app/\[lang\]/layout.tsx
git commit -m "feat(i18n): sitemap/manifest/OG url 迁裸 en 前缀

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 7: 全站内链走 helper（爬虫只应见一种 URL）

内链是爬虫的爬取路径；任何一处仍出 `/en/*`，Google 就会同时爬到裸与 `/en` 两版。全部经 `localePath`。

**Files:**
- `web/src/components/shell/TopNav.tsx`
- `web/src/components/shell/MobileDrawer.tsx`
- `web/src/components/shell/SubNav.tsx`
- `web/src/components/shell/Footer.tsx`
- `web/src/components/home/HeroMasthead.tsx`
- `web/src/components/entity/OwnershipConsensusPanel.tsx`

**Interfaces:**
- Consumes: `localePath`（Task 1）。这些是 client/server 组件，均可 `import { localePath } from "@/lib/urls";`（`urls.ts` 只 import 类型，无 server-only，client 安全）。

- [ ] **Step 1: `TopNav.tsx` — 语言切换 + 首页 + nav href + active 判定**

顶部加：`import { localePath } from "@/lib/urls";`

替换第 26-38 行区块：
```ts
  const otherLang: Lang = lang === "zh" ? "en" : "zh";
  // 当前 pathname 去掉语言前缀(裸 en 无前缀; /zh 有前缀),再按目标语言重新加。
  const barePath = pathname ? pathname.replace(/^\/(zh|en)(?=\/|$)/, "") : "";
  const otherLangPath = localePath(otherLang, barePath);

  const homeHref = localePath(lang, "");

  function isActive(entry: (typeof TOP_NAV)[number]) {
    if (entry.key === "home") {
      return pathname === homeHref || pathname === `${homeHref === "/" ? "" : homeHref}/`;
    }
    return pathname.startsWith(localePath(lang, entry.href));
  }
```

替换第 60 行 nav href：
```ts
          const href = entry.key === "home" ? homeHref : localePath(lang, entry.href);
```

> 说明：`localePath("en","")` = `/`（首页裸）；`entry.href` 如 `/investors` → en `/investors`、zh `/zh/investors`。active 的 home 分支用精确匹配避免 en 下 `startsWith("/")` 恒真。

- [ ] **Step 2: `MobileDrawer.tsx` / `SubNav.tsx` / `Footer.tsx` / `HeroMasthead.tsx` / `OwnershipConsensusPanel.tsx`**

逐个打开，把所有 `/${lang}${x}`、`` `/${lang}` ``、`/${lang}/investors` 之类的链接拼接替换为 `localePath(lang, x)`（`x` 为无前缀路径；首页用 `localePath(lang, "")`）。语言切换类逻辑（若有 `pathname.replace(/^\/(zh|en)/, …)`）套用 Step 1 的 `barePath` 模式。

用下面命令先定位每个文件里的确切行：
```bash
grep -rn '/\${lang}\|/\${l}`\|replace(/\^\\/(zh|en)' src/components --include='*.tsx'
```
逐条改。

- [ ] **Step 3: 机器验证内链无漏网**

Run（在 worktree `web/`）：
```bash
grep -rn '`/\${lang}\|"/en/\|"/zh/\|/\${lang}/' src/components --include='*.tsx'
```
Expected: 无输出（所有内链走 `localePath`）。

- [ ] **Step 4: preview 验证导航可用**

起 dev（若未起），在 preview 打开 `http://localhost:3000/`（裸英文首页），点 TopNav 各链接确认落裸 URL；点语言切换到 `/zh` 确认落 `/zh/…`；再切回确认落裸。用 `preview_snapshot`/`preview_eval location.pathname` 核对。

- [ ] **Step 5: tsc + 提交**

Run：`cd web && npx tsc --noEmit` → 0
```bash
git add web/src/components
git commit -m "feat(i18n): 全站内链走 localePath(en 裸/zh 前缀,爬虫单一 URL)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 8: 全局终检 sweep（grep-zero + curl 矩阵 + 三页抓验）

确保无一处漏网，SEO/GEO 出口全一致。

**Files:** 无（纯验证；若发现残留则回到对应任务修）。

- [ ] **Step 1: grep-zero — 全库无 `/${lang}` 路径硬编码（proxy 除外）**

Run（在 worktree `web/`）：
```bash
grep -rn '/\${lang}\|/\${l}`\|/\${l}/\|thecompounder.fyi/\${' src --include='*.ts' --include='*.tsx' | grep -v 'src/proxy.ts'
```
Expected: 无输出。有则修。

- [ ] **Step 2: curl 路由矩阵（dev server）**

```bash
for u in \
  /en/investors/berkshire-hathaway \
  /investors/berkshire-hathaway \
  /zh/investors/berkshire-hathaway \
  /en/stocks/AAPL /stocks/AAPL /zh/stocks/AAPL \
  /stocks/BRK.B /zh/stocks/BRK.B \
  /en /zh / ; do
  printf '%s -> ' "$u"; curl -sI "http://localhost:3000$u" | grep -iE '^HTTP|^location' | tr '\n' ' '; echo
done
```
Expected：
- 所有 `/en*` → `301` + `location` 去掉 `/en`
- 所有裸英文路径 + `/` → `200`
- 所有 `/zh*` → `200`

- [ ] **Step 3: 三页抓验 canonical / hreflang / JSON-LD**

对 `/investors/berkshire-hathaway`、`/stocks/AAPL`、`/`（各裸英文）与对应 `/zh/…` 抓 HTML：
```bash
curl -s http://localhost:3000/stocks/AAPL | grep -oE '<link rel="canonical"[^>]*>|hreflang="[^"]*" href="[^"]*"'
curl -s http://localhost:3000/stocks/AAPL | grep -oE '"@type":"BreadcrumbList".*?}]}' | head -c 400
```
Expected：
- en 页 canonical = `https://thecompounder.fyi/stocks/AAPL`（裸）
- hreflang：`en` 与 `x-default` 裸、`zh-CN` = `/zh/stocks/AAPL`
- JSON-LD `item`/`url` 均裸 en（或对 `/zh` 页为 `/zh/…`）

- [ ] **Step 4: sitemap 抽验**

```bash
curl -s http://localhost:3000/sitemap.xml | grep -oE '<loc>[^<]+</loc>' | head -8
```
Expected: 全部 `https://thecompounder.fyi/…`（无 `/en`）。

- [ ] **Step 5: 最终 tsc**

Run：`cd web && npx tsc --noEmit`
Expected: 0。

- [ ] **Step 6: 提交终检记录（若前序有修补则一并提交）**

若 Step 1-5 全绿无改动，无需额外提交；若有修补：
```bash
git add -A
git commit -m "fix(i18n): 终检 sweep 修补漏网前缀

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## 上线后验证（部署到生产后，非本地）

- 生产 curl 同 Task 8 Step 2 矩阵（换域名 `https://thecompounder.fyi`）。
- Google Search Console：观察 `/en/*` 老 URL 转「带重定向」、裸 URL 进索引；`/zh/*` 保持不变。
- 抽查 3 个已被 AI 引擎引用的页，确认 JSON-LD `url` 现为裸并 200。
