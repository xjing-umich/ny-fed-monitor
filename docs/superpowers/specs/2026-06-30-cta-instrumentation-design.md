# CTA 埋点（关键转化点）设计

- 日期：2026-06-30
- 分支：`plan/cta-instrumentation`（off `db-foundation`）
- 纲领对齐：[[north-star-strategy]] Phase 1「可见」/ §7 北极星②回访转化。
- 范围：补两个北极星转化事件——`newsletter_subscribe`（留存）+ `discovery_handoff_click`（合力漏斗）。次要事件（screener sort / strikezone chip）不在本 PRD（YAGNI，留到有流量看细漏斗时）。

## 问题

站点已有 Vercel Web Analytics（`@vercel/analytics` 挂在 `[lang]/layout.tsx`，custom events 已用 `track()`），但只埋了 `conviction_card_click`（ConvictionPicks）和 share（ShareButton）。**北斗星最在意的两个转化点都没埋**：
1. **newsletter 订阅** —— 留存的核心信号（§7 北极星②），现在订阅成功无事件，无法知道哪个位置带来订阅。
2. **发现面接力出口点击** —— 刚上线的引导线（PR #120）的核心漏斗信号，详情页→screener 的转化无事件，无法验证"合力"是否真把人导到差异化页。

没有这两个事件，Phase 1 的「可见」不成立——优化全靠猜。

## 目标 / 非目标

**目标**：两个事件进 Vercel Web Analytics custom events，payload 足够区分来源/去向，可在后台看转化。

**非目标（YAGNI）**：
- 不加次要事件（`screener_sort`、`strikezone_pick_click`、各种内链）。
- 不上 PostHog（纲领已定：Vercel WA + GSC 够现阶段）。
- 不做漏斗可视化/dashboard 搭建（Vercel 后台现成）。
- 不改 `discoveryHandoff.ts` 纯函数（target 在组件内从 href 解析）。

## 约束（硬）

- **零额外客户端重量**：复用现成 `TrackedLink`（client 壳 + fire-and-forget `track()`）和现成 `track()` import，不引新依赖。
- **容错不阻断**：埋点抛错（adblock 拦截）绝不影响导航/订阅（`TrackedLink` 已 try/catch；newsletter 同样包裹）。
- **订阅只在成功时发**：`res.ok && json.ok` 分支，不发尝试/失败。
- **payload 无 PII**：绝不发 email；只发 `source`/`from`/`target`/`lang` 等枚举值。
- **事件命名**：snake_case，沿用既有 `conviction_card_click` 风格。

## 既有事实（设计输入，已读代码）

- `TrackedLink`（`src/components/common/TrackedLink.tsx`，`"use client"`）：props `{ href, event, payload?, className, children }`，onClick `try { track(event, payload ?? {}) } catch {}` 后正常 `<Link>` 导航。可直接复用。
- `NewsletterForm`（`src/components/shell/NewsletterForm.tsx`，`"use client"`）：props 当前仅 `{ lang }`。`handleSubmit` 在 `res.ok && json.ok` 时 `setStatus("ok")`——即订阅成功点。
- `NewsletterCTA`（`src/components/entity/NewsletterCTA.tsx`）：内联订阅卡，投资人页/个股页文末用（`EntityPage` 的 `footerCta`）。
- footer 直接用 `NewsletterForm`。
- `DiscoveryHandoff`（`src/components/discovery/DiscoveryHandoff.tsx`，RSC）：props `DiscoveryCta = { eyebrow, line, href, ctaLabel }`，内部用 `next/link` 渲染 CTA。href 形如 `/{lang}/stocks/screener`、`?view=strike_zone`、`?view=below`。

## 事件规格

### `newsletter_subscribe`
- 触发：`NewsletterForm` 成功分支（`res.ok && json.ok`，`setStatus("ok")` 同处）。
- payload：`{ source: "footer" | "investor" | "stock", lang: "zh" | "en" }`。
- 实现：
  - `NewsletterForm` 加可选 prop `source?: string`（默认 `"footer"`）；成功分支加 `try { track("newsletter_subscribe", { source, lang }) } catch {}`。
  - `NewsletterCTA` 加可选 prop `source?: string`，转发给 `NewsletterForm`。
  - 投资人页渲染 `NewsletterCTA` 传 `source="investor"`；个股页传 `source="stock"`。footer 不传 → 默认 `"footer"`。

### `discovery_handoff_click`
- 触发：`DiscoveryHandoff` 的 CTA 链接点击。
- payload：`{ from: "stock" | "investor", target: "strike_zone" | "below" | "generic", lang: "zh" | "en" }`。
- 实现：
  - `DiscoveryHandoff` 加 props `from: "stock" | "investor"` 和 `lang: Lang`；CTA 由 `next/link` 换成 `TrackedLink`。
  - `target` 在组件内从 href 解析：`href.includes("strike_zone") → "strike_zone"`；`href.includes("below") → "below"`；否则 `"generic"`。
  - 个股页传 `from="stock"`，投资人页传 `from="investor"`，两页都传 `lang`。

## 触及文件

- Modify `src/components/discovery/DiscoveryHandoff.tsx`：Link→TrackedLink，加 `from`/`lang` props，解析 `target`，传 event+payload。
- Modify `src/app/[lang]/stocks/[ticker]/page.tsx`：`<DiscoveryHandoff>` 传 `from="stock"` + `lang`。
- Modify `src/app/[lang]/investors/[slug]/page.tsx`：`<DiscoveryHandoff>` 传 `from="investor"` + `lang`。
- Modify `src/components/shell/NewsletterForm.tsx`：加 `source?` prop，成功分支 `track`。
- Modify `src/components/entity/NewsletterCTA.tsx`：加 `source?` prop 转发。
- Modify 投资人页/个股页渲染 `NewsletterCTA` 处：传 `source`。

## 错误处理 / 降级

- 所有 `track()` 调用包 `try {} catch {}`（adblock/失败静默，绝不阻断导航或订阅）。
- `source`/`from` 未传 → 用默认（`"footer"` / 必填由 TS 保证）。

## 测试 / 验证

- 客户端事件无法 `.check.ts`。验证：
  1. `cd web && npx tsc --noEmit` → exit 0。
  2. dev 手动：点发现面出口 + 提交订阅，在浏览器 Network 看 `/_vercel/insights/event` 请求带对事件名与 payload（或 Vercel 后台 events 面板出现）。
- 回归：导航与订阅在 track 抛错时仍正常（手动用 adblock 或断网模拟）。

## 分解为执行块（建议）

1. **块 A — newsletter_subscribe**：NewsletterForm 加 source+track → NewsletterCTA 转发 → 两页传 source。
2. **块 B — discovery_handoff_click**：DiscoveryHandoff 换 TrackedLink+from/lang+target → 两页传 from/lang。

A、B 互不依赖，可任意序/并行。
