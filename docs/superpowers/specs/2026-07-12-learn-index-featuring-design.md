# Learn 首页置顶改造 设计文档

- 日期:2026-07-12
- 分支:`plan/valuation-transparency-table`(off `db-foundation`)
- 范围:只改 `/learn` 索引页,从「扁平等权列表」升级为「小型编辑首页」,给品牌介绍和日常更新的文章各自一个凸显位。

## 问题

`/learn` 现在是一条扁平列表:所有文章按 `ARTICLE_SLUGS` 顺序等权铺开,没有层级。两个后果:

1. **品牌无处发声**。页眉只有一句导语,读者进来不知道 Compounder 是什么立场、什么方法论。
2. **重点内容被淹没**。基石文(如「一只股票到底值多少钱」)和刚更新的时效文,和其余文章一样躺在列表里,容易被忽略。

## 目标

- 品牌介绍常驻凸显(不依赖任何单篇文章)。
- 手挑一篇基石文当门面(「从这里开始」)。
- 最新更新的文章自动置顶(按 `updated` 日期,无需人工维护)。
- 其余文章沿用现有列表。
- 不动文章正文、不动详情页、不动首页 teaser。

## 方案选型

**采用 A:精选常量 + 日期派生。** 在 `learn.ts` 加一段品牌文案常量 `BRAND`、一个手挑门面 `FEATURED_SLUG`,「最新」由现有 `updated` 字段算出。不改 `Article` 类型,所有编排集中在 `learn.ts`,契合现有 `ARTICLE_SLUGS` 约定。最小、好懂、YAGNI。

- 弃 B(给 `Article` 加 `tier`/`featured` 字段):「最新」本就该由日期算而非人工标记;6 篇文章上属过度设计。
- 弃 C(全量分类目录 Foundations/Valuation/Timely):文章量太少,现在做纯属早。

## 页面结构(四个纵向区块,自上而下)

```
Learn(眉标) · 读懂生意,而非代码(标题) · 一句话短导语     ← PageHeader,导语收短
│
├ 【品牌块】   accent 描边卡:理念 2-3 句 +「关于 Compounder →」链接   ← 品牌凸显位(常驻)
│
├ 【从这里开始】精选基石文(大卡):眉标「从这里开始」+ 标题 + 摘要      ← 内容门面(手挑)
│
├ 【最新】     updated 最新的那篇(挂「最新」标签):标题 + 摘要 + 日期    ← 日常更新凸显位(自动)
│
└ 【全部指南】 其余文章,沿用现有列表(去重,不与上面重复)
```

## 数据模型与函数(`web/src/lib/learn.ts`)

只增不改类型:

1. **`BRAND` 常量**(双语),品牌块文案。提炼自 `/about` 的「我们的理念」,已对照权威文案准则 `web/docs/copy-voice.md` 自检:落到北极星句 *"make it readable, so the thinking is left to you"* 的声音;不与页眉标题「读懂生意,而非代码」字面重复;em-dash 仅作同位澄清(列举传统内容),非煽情:

   - EN:*Compounder comes out of the value-investing tradition — Graham's margin of safety, Buffett's preference for good businesses at fair prices held for years. We pull superinvestors' 13F filings, valuation, and the macro backdrop into one place and keep it readable, so the judgment stays yours. Everything here is for learning, not investment advice.*
   - ZH:*Compounder 出自价值投资这一脉:格雷厄姆的安全边际,巴菲特那种以合理价格买好生意、然后拿住多年的偏好。我们把超级投资者的 13F、估值和宏观背景归到一处、做得可读,判断留给你。这里的一切只供学习,不构成投资建议。*

2. **`FEATURED_SLUG = "what-is-intrinsic-value"`** —— 手挑门面,一行可改。

3. 三个纯函数(输入 `lang`,复用现有 `getArticle`/`listArticles`):
   - `getFeatured(lang)` → 返回 `FEATURED_SLUG` 对应文章(取不到返回 `null`,区块隐藏)。
   - `getLatest(lang)` → 在**非精选**文章里按 `updated` 取最新一篇。日期字符串为 `YYYY-MM-DD`,可直接字符串比较;缺 `updated` 的排在最后。取不到返回 `null`。
   - `listRest(lang)` → `listArticles(lang)` 去掉 featured 和 latest 两个 slug,顺序不变。

## 页面渲染(`web/src/app/[lang]/learn/page.tsx`)

- `COPY` 增本地文案键:品牌块的「关于 Compounder」链接文案、门面眉标「Start here / 从这里开始」、最新标签「Latest / 最新」。
- 页眉导语(`COPY.intro`)**收短成一句纯定位**,理念交给品牌块,避免与品牌块重复(品牌块已承载 13F/估值/宏观 + 免责,页眉不再重复这些)。建议:EN *"Plain guides to reading businesses the way serious investors do."* / ZH *"像严肃投资者那样读懂生意的大白话指南。"*
- 依次渲染:PageHeader → 品牌块 → 门面大卡 → 最新卡 → 全部指南列表。
- 品牌块用 `--tt-*` 令牌,accent 左描边或细框,区别于纯列表;门面卡标题字号略大 + 眉标;最新卡挂 mono 小标签。全部走 `localePath` 生成链接。

## 边界情况

- **门面 == 最新**:`getLatest` 已排除精选文,天然不会重复;若全站仅剩精选一篇,最新区块隐藏。
- **文章不足**:任一函数返回 `null`/空 → 对应区块不渲染,不留空壳。
- **去重**:`listRest` 显式剔除 featured + latest,保证一篇不出现两次。
- **无 `updated`**:该文不参与「最新」竞争,仍出现在「全部指南」。

## 范围外(YAGNI)

- 不加标签/分类体系。
- 不动首页 `LearnTeaser`、不动任何详情页、不动文章正文。
- 不做订阅/RSS/搜索。

## 验收

- `npx tsc --noEmit` 干净(本地 `next build` 因 Google Fonts 屏蔽会失败,不作门)。
- 双语各自纯语言,无中英混排。
- 品牌块、门面、最新、列表四区块层级清晰,去重正确。
- 文案过 `web/docs/copy-voice.md` 6 条 checklist(无空洞对偶/三元排比/煽情 em-dash/SaaS 腔/对冲词),不构成投资建议。
- 布局用 `--tt-*` 令牌 + PageHeader,不引入 shadcn Card,绿色克制(仅眉标/标签),符合前端设计语言。
