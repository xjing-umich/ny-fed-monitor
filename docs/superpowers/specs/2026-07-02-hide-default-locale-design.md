# 设计：英文默认语言免前缀（hide-default-locale）

- 日期：2026-07-02
- 分支：`feat/hide-default-locale`（基于 `db-foundation`）
- 状态：已获用户批准，待写实施计划

## 1. 背景与动机

站点当前采用 **always-prefix** 的 i18n 路由：所有页面都在 `src/app/[lang]/…` 下，任何 URL 必带 `/en` 或 `/zh` 前缀；根路径 `/` 由 `next.config.ts` 里一条 307 临时重定向到 `/en`；无 `middleware`/`proxy`。

问题：站点战略是 **English-first**（英文优先收录、`x-default→en`、英文在 sitemap 排第一），但英文——主力受众与主排名语言——却背着冗余的 `/en/` 前缀，例如 `thecompounder.fyi/en/investors/berkshire-hathaway`。一线英文优先站（Linear/Stripe/Vercel，及直接对手 dataroma）默认语言一律用**裸 URL**，只有次要语言才带前缀。当前前缀在轻微反着自身的英文权威目标做功。

目标：迁移到 **hide-default-locale**——英文用裸 URL，中文保留 `/zh` 前缀——且**不损伤现有 SEO/GEO 收录**。

## 2. 目标 URL 契约（所有改动的锚）

| 语言 | 迁移前 | 迁移后（浏览器可见） |
|---|---|---|
| 英文（默认） | `/en/investors/berkshire-hathaway` | `/investors/berkshire-hathaway` |
| 英文首页 | `/en` | `/` |
| 中文 | `/zh/investors/berkshire-hathaway` | `/zh/investors/berkshire-hathaway`（**不变**） |

**canonical / hreflang（每页）**
- en 页 canonical → 裸 `https://thecompounder.fyi/investors/x`
- zh 页 canonical → `https://thecompounder.fyi/zh/investors/x`
- hreflang：`en` 与 `x-default` → 裸；`zh-CN` → `/zh/…`

**底层目录不动**：仍是 `src/app/[lang]/…`，`lang` 仍为 `"en" | "zh"`。裸 URL 靠 proxy 在服务端 rewrite 到 `/en/…`，`[lang]` 组件照常拿到 `lang="en"`、`<html lang>` 照常本地化。**零页面组件重写**——这是选 proxy-rewrite 而非改 route group `(en)/(zh)` 的关键原因（后者需复制整棵树）。

## 3. 关键决策（已确认）

1. **方向**：英文免前缀（hide-default-locale）。
2. **不做 Accept-Language 自动跳转**：裸路径恒为英文。理由：与现状一致；自动跳转对 SEO 有害（Googlebot 常被连带重定向、制造重复/软 404），恰会戳当前脆弱的收录；中文受众用页面语言切换（→ `/zh`）即可，显式可控。

## 4. 架构

### 4.1 运行时路由：`src/proxy.ts`（Next 16 新文件约定）

> Next 16 已将 `middleware` 文件约定改名为 **`proxy`**（`export function proxy(request)`，放 `src/proxy.ts`，与 `app/` 同级）。这是相对旧版 Next 的破坏性变更，务必用新名。

三条规则，按序：

```
1. pathname 以 /zh 开头            → 放行（NextResponse.next）
2. pathname 为 /en 或 /en/… 开头   → 301 永久重定向到去掉 /en 的裸路径   （合并旧收录）
3. 其它一切裸路径                  → 内部 rewrite 到 /en + 原路径（URL 不变）（出英文）
```

- **matcher** 排除：`/_next/static`、`/_next/image`、`/api`、`sitemap.xml`、`robots.txt`、`manifest.webmanifest`、`favicon.ico` 及带扩展名的静态资源（`.png/.ico/.svg/.txt/.xml` 等）。cron 打到 `/api/cron/*`，已被 `/api` 排除。
- 规则 2 的 301 是 SEO 核心：把已收录/在爬的 `/en/*` 老 URL 永久指向裸版本，权重合并而非 404。
- 规则 3 用 **rewrite（非 redirect）**：地址栏保持裸 URL，服务端才知真身是 `[lang]=en`；rewrite 不二次触发 proxy，无循环。
- 边缘情况：非法语言前缀（如 `/fr/x`）落规则 3 → rewrite 到 `/en/fr/x` → 该路由不存在 → 404（可接受，垃圾路径本就应 404）。

### 4.2 前缀规则单一真相源：`src/lib/urls.ts`

迁移要安全，「en 无前缀、zh 带前缀」这条规则必须**只存在于一个地方**，所有 URL 出口都调它——否则任一处漏改，Google 就同时看到 `/en/x` 与 `/x` 两个 URL → 重复内容。

新增：

```ts
// en → 无前缀；zh → /zh 前缀。全站唯一定义此规则的地方。
export const localePath = (lang: Lang, path: string): string =>
  lang === "en" ? (path || "/") : `/zh${path}`;
```

改造现有 helper 内部改用它：
- `investorPath(lang, slug)` → `localePath(lang, `/investors/${slug}`)`
- `stockPath(lang, x)` → `localePath(lang, `/stocks/${x}`)`
- `macroPath(lang, ind)` → `localePath(lang, `/macro/${ind}`)`
- `absoluteUrl(path)` 不变（拼域名），配合 `localePath` 产出绝对 canonical/JSON-LD URL。

新增 hreflang/canonical 统一构造器（放 `urls.ts` 或 `seo.ts`）：

```ts
// 每页 alternates 统一产出，杜绝散拼。
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

## 5. SEO/GEO 全出口清单（逐个消灭 `/${lang}` 硬编码）

每一个会被爬虫/AI 引擎读到的 URL 出口，一个不漏：

| # | 出口 | 现状 | 迁移后 | 影响 |
|---|---|---|---|---|
| 1 | canonical（每页 `alternates.canonical`） | `/en/x` | 裸 `/x`（经 `altFor`） | SEO 核心 |
| 2 | hreflang（`languages`） | `/en/x` | en+x-default→裸，zh-CN→`/zh/x`（经 `altFor`） | SEO 双语配对 |
| 3 | `sitemap.ts` 主 URL + alternates | `BASE/en{path}` | `BASE{path}`，alternates 同 hreflang 规则 | SEO：须与 canonical 一致 |
| 4 | OG `og:url`（layout + `ogFor` 的 `path`） | `/en` | 裸（经 `localePath`） | 社交分享 |
| 5 | JSON-LD BreadcrumbList `item`（investor/stock 页） | `.../en/…` | 裸/`/zh`（经 `absoluteUrl(localePath(...))`） | **GEO** |
| 6 | JSON-LD Person/Organization/Dataset `url`/`@id` | `.../en/…` | 裸/`/zh` | **GEO** |
| 7 | JSON-LD FAQPage / WebSite / macro Dataset `url` | 部分裸部分带 lang | 统一经 helper | **GEO** |
| 8 | `manifest.ts` `start_url` | `/en` | `/` | PWA |
| 9 | 全站内链（TopNav/MobileDrawer/SubNav/Footer/页面体/搜索项） | `/${lang}/x` | 经 `localePath`/helper | SEO：爬虫顺内链只应见一种 URL |
| 10 | `robots.ts` sitemap/host | 已裸域名 | **不变** | — |

**受影响文件（约 47 个含 `lang}` 插值）**，重点：
- `src/proxy.ts`（新）
- `src/lib/urls.ts`、`src/lib/seo.ts`（helper 收敛点）
- `src/app/[lang]/layout.tsx`（OG url、metadataBase 保持）、`src/app/[lang]/page.tsx`（homepage alternates + WebSite/Organization LD）
- 各页 `generateMetadata` 的 `alternates` 内联块（investors/stocks/macro/learn/about/terms/privacy/disclaimer/research/consensus/buys/sells 等）
- JSON-LD 硬编码块：`investors/[slug]/page.tsx`、`stocks/[ticker]/page.tsx`、`macro/[indicator]/page.tsx`、`page.tsx`、`consensus/page.tsx`、`_movesPage.tsx`、`learn/[slug]/page.tsx`
- `src/app/sitemap.ts`、`src/app/manifest.ts`
- 组件内链：`components/shell/TopNav.tsx`（`otherLangPath`、`homeHref`、nav href、active 判定）、`MobileDrawer.tsx`、`SubNav.tsx`、`Footer.tsx`、`components/home/HeroMasthead.tsx`、`components/entity/OwnershipConsensusPanel.tsx`
- `next.config.ts`：删除 `/ → /en` 那条 307（proxy 接管，`/` 直接出内容）；保留 macro legacy 301（`/:lang/slug → /:lang/macro/slug`）与 `/:lang/managers → /:lang/investors`

## 6. SEO/GEO 安全保证

1. **旧 `/en/*` 收录零丢失**：proxy 对所有 `/en/*` 发 301 永久重定向到裸版本 → Google 合并老 URL 权重/收录状态，非 404；外链与 AI 引用照通。
2. **零重复内容**：迁移后每个英文页只有一个 200 URL（裸）；`/en/*` 只 301 不返 200；内链、canonical、sitemap、JSON-LD 全部一致指向裸 URL（靠第 4.2 单一 helper 保证）。
3. **中文 `/zh/*` 完全不动**：proxy 直接放行，canonical/hreflang/JSON-LD 的 zh 分支照旧 → 中文现有收录零风险。
4. **hreflang 对称完整**：en↔zh 互指 + `x-default→裸en`，由 `altFor` 统一产出，不会半边裸半边 `/en` 破碎。

**已知可接受的次要项**（非阻断）：
- 别名两跳链：旧 `/en/stocks/apple` → proxy 301 → `/stocks/apple` → 页面 308 → `/stocks/AAPL`。两跳 301/308，Google 可跟随，后续可优化不阻断本次。

## 7. 验证关卡（迁移后逐条跑，不靠感觉）

- `curl -I /en/investors/berkshire-hathaway` → `301` 且 `Location: /investors/berkshire-hathaway`
- `curl -I /investors/berkshire-hathaway` → `200`
- `curl -I /zh/investors/berkshire-hathaway` → `200`（未被动）
- `curl -I /` → `200`（英文首页直接出，无 307）
- 改完后 `grep -rn '/en\b\|\${lang}\|/\${l}' src`（排除 `proxy.ts`）**归零**——机器验证无漏网硬编码
- 抓 3 个代表页 HTML，验 canonical / hreflang / 全部 JSON-LD `url|item|@id` 均为裸 en 或 `/zh`
- `sitemap.xml` 全部主 URL 为裸；抽验 hreflang alternates
- `npx tsc --noEmit` = 0

## 8. 明确不做（YAGNI）

- 不做 Accept-Language 自动语言协商/地理跳转。
- 不改底层 `[lang]` 目录结构、不引入 route group `(en)/(zh)`。
- 不引入第三方 i18n 库（next-intl 等）。
- 不做别名两跳链的合并优化（本次不阻断）。
- 不改任何页面的**内容/文案/组件视觉**——纯路由与 URL 出口迁移。

## 9. 上线顺序（安全优先）

1. 合入并部署后，第一时间用第 7 节关卡在生产验证 301/200/canonical。
2. 在 Google Search Console 观察 `/en/*` → 裸 URL 的迁移收敛（老 URL 转「带重定向」、新 URL 进索引）。
3. 确认无异常后再考虑清理别名两跳等次要项。
