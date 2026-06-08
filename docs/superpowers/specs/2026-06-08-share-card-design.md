# 分享卡 / Share Card 设计

> 状态：设计已与用户分段确认（2026-06-08），待用户审阅 spec 后转 writing-plans。
> 所属规划 thread：Compounder 产品长期规划。
> 分支：`feat/share-card`（worktree `.claude/worktrees/share-card`，基于 origin/db-foundation 最新）。
> 相关记忆：[[product-direction]]、[[valuation-philosophy-constraint]]、[[promotion-and-compliance]]、[[seo-english-first]]；增长闭环 `docs/growth/measurement-loop.md`。
> 关联策略：`docs/superpowers/specs/2026-06-06-cold-start-wedge-growth-design.md`（§2.4 可分享卡片、§4 分发与指标）。

## 1. 背景与目标

分发是冷启动楔子的关键一环，而站上目前**没有任何主动分享入口**（无 `navigator.share`、无复制链接、无 `track()`）。

**关键发现（2026-06-08 基建核查）——"图"已经做好，缺的是"动作 + 打点"：**
- `web/src/lib/ogCard.tsx` 已能渲染 1200×630 品牌卡（暗色、Logo + Compounder 字标、`thecompounder.fyi` 水印、`Sources: SEC EDGAR` 出处行）。
- 投资人 / 个股 / 共识 / 买 / 卖 **六类页面已各自有 `opengraph-image.tsx`**，自动产出 OG 卡 → **任意 Compounder 链接被粘贴到 X/Reddit/Telegram 已会自动展开品牌卡**。
- 缺失：页面上的分享/复制按钮、预填分发文案、分享打点。

**目标**：给"值得转发"的页面加一个**高可用、可复用**的分享入口 + 确定性预填文案 + 分享打点，喂养 `measurement-loop` 的 referral / AI 引用验证。

**非目标（明确不做 v1）**：重做 OG 图引擎（已存在，不碰）、下载卡片为 PNG、个股页分享按钮、新引入 toast 库、二维码/短链服务、AI 生成分享文案。

## 2. 范围与行为

### 2.1 挂载页面
- 投资人页 `/[lang]/investors/[slug]`
- 三聚合页 `/[lang]/investors/{consensus,buys,sells}`
- （个股页 v1 不挂——查询型、转发动机弱、预填文案不好写。留待有流量信号再补。）

### 2.2 分享行为（B 方案 + 能力降级，progressive enhancement）
不按"手机/桌面" UA 嗅探分叉，**按浏览器能力逐级降级**，保证任何环境都有可用结果：

1. `navigator.share`（含 `navigator.canShare`）可用 → 调起系统分享面板（带预填 `text` + `url`）。
2. 否则 → 桌面弹层/下拉，含三项：
   - **复制链接** → `navigator.clipboard.writeText`；
   - **分享到 X**（预填意图链接）；
   - **分享到 Telegram**（预填意图链接）。
3. `navigator.clipboard` 不可用（非安全上下文 / 老浏览器）→ `document.execCommand('copy')` 兜底。
4. 再不行 → 选中链接文本，提示用户手动复制。

**边界处理（高可用核心）：**
- `navigator.share` 被用户取消 → 抛 `AbortError`，**catch 且不视为错误**（不显示失败提示）。
- clipboard promise reject → 走下一级兜底，不让按钮卡死。
- **SSR/hydration**：render 期**绝不读 `navigator`**；服务端与客户端渲染同一份按钮标记，能力判断只在**点击 handler 内**进行（避免水合不一致）。

### 2.3 图
完全复用现有 `opengraph-image.tsx` + `ogCard()`。**本 PRD 不碰图**。链接被粘贴时由各页已有 OG 卡自动展开。

## 3. 预填文案（确定性、双语、零推荐）

约束：遵 [[valuation-philosophy-constraint]] 禁投机/禁荐股；发到外部的推文**不会带站内免责标签**，故文案**必须确定性、纯事实、无判断性措辞**，**不调用 AI**（避免 AI 生成断言脱离免责语境外流，也绕开"去AI味/过检测"问题）。

- 新增纯函数 `lib/share/shareText.ts`：`buildShareText({ kind, ...slots }, lang) → string`。
- `kind`：`'investor' | 'consensus' | 'buys' | 'sells'`。
- 数据槽位**复用页面已查询的确定性数据**（投资人 keyFacts / 聚合 blurb 槽位），不新增数据查询。
- 输出 = 事实句 + ` via @thecompounder`。

**模板示例（最终中英文案在实现期定稿，保持事实陈述语气）：**
- investor（EN）：`Warren Buffett's latest 13F — top holding {topTicker} {topWeight}%, added {newName} this quarter. via @thecompounder`
- investor（ZH）：`Warren Buffett 最新 13F：第一大持仓 {topTicker} 占 {topWeight}%，本季新增 {newName}。via @thecompounder`
- consensus（ZH）：`本季 {topTicker} 被 {holderCount} 位顶级投资者同时持有，居共识首位。via @thecompounder`
- buys/sells：同构，措辞改"获最多买入 / 减持"。

**边界（确定性）：**
- 任一关键槽位缺失（无数据 / 季度空窗）→ **退化为「页面标题 + URL」**，不拼任何数据断言。
- 文案保持精简（X 字数限制 + URL 占位），避免被截断。

## 4. URL（canonical 绝对地址）

分享出去的必须是**带 lang 的 canonical 绝对地址**（`https://thecompounder.fyi/{lang}/...`）。
- 不在 client 用 `window.location` 拼接。
- 页面 `generateMetadata` 已计算 canonical → **复用同一来源**，由服务端把绝对 URL 作为 `url` prop 传入 `ShareButton`。

## 5. 打点（Vercel Analytics 自定义事件）

客户端 `import { track } from '@vercel/analytics'`。

| 事件 | 触发 | 属性 |
|---|---|---|
| `share_click` | 任意分享动作发起 | `{ entity, entityType: 'investor'\|'consensus'\|'buys'\|'sells', method: 'native'\|'copy'\|'x'\|'telegram', lang }` |
| `copy_link` | 复制成功 | `{ entity, entityType, lang }` |

- **打点容错**：`track()` fire-and-forget，包 try/catch；被 adblock 拦截 / 抛错**绝不阻断分享动作**。
- 这两个事件名同步写进 `docs/growth/measurement-loop.md` 的「埋点预留」表，闭合度量闭环。

## 6. 组件架构（单一职责 / 可复用 / 可单测）

- **`components/share/ShareButton.tsx`**（client，**哑组件**）：props `{ url: string; text: string; label?: string }`，零业务知识 → 全站任意位置可复用（含未来个股页 / 新功能）。负责：能力降级链、`aria-live="polite"` 内联状态（「已复制 ✓」2 秒消失，**不引 toast 库**）、可访问性（按钮 `aria-label`、桌面弹层 Esc 关闭 + 点击外部关闭 + 键盘可达）、`track()`。
- **`lib/share/shareText.ts`**（纯函数）：拼双语文案 + 退化分支，与 UI 解耦、可单测。
- **`lib/share/intents.ts`**（纯函数）：`xIntentUrl(text, url)` / `telegramIntentUrl(text, url)`，正确 `encodeURIComponent`；外链 `target="_blank"` + `rel="noopener noreferrer"`。
- **页面装配**：server component 用 `buildShareText()` 算好文案、取 canonical 绝对 URL，只把 `{url, text}` 传给 `ShareButton`。业务逻辑全留在纯函数侧。

## 7. 验收标准

1. 四类页面（投资人 + 共识 + 买 + 卖）出现分享按钮；`navigator.share` 可用时走系统面板，否则桌面弹层含复制 + X + Telegram。
2. 能力降级链生效：clipboard 不可用走 execCommand 兜底；任何环境都给得出可用结果。
3. 用户取消分享（AbortError）不报错；复制成功显示 `aria-live` 内联「已复制 ✓」。
4. SSR 不读 `navigator`，无 hydration 警告；按钮服务端/客户端同标记。
5. 预填文案确定性、双语、无推荐措辞、可回溯到页面数据；关键槽位缺失退化为标题 + URL。
6. 分享 URL 为带 lang 的 canonical 绝对地址（复用 metadata canonical 来源）。
7. `share_click` / `copy_link` 在 Vercel Analytics 可见、属性正确；`track()` 抛错不阻断分享。
8. 事件定义同步进 `docs/growth/measurement-loop.md` 埋点表。
9. ShareButton 为哑组件（props 仅 `{url, text, label?}`），不依赖任何 page-specific 类型。

## 8. 风险与备注

- 投资人页 `judgment_line` 是 AI 生成的——**本 PRD 明确不用它做分享文案**，只用确定性事实句，规避免责标签外流风险（[[valuation-philosophy-constraint]]、[[promotion-and-compliance]]）。
- 多 session 共用主工作树：实现应在本 worktree / `feat/share-card` 进行，勿与其他在飞 PRD 的 worktree 并发改同文件。
- X 分享意图依赖第三方 intent URL 规范；若 X 改协议需小幅维护（不影响复制 / Telegram / native 路径）。
- `@vercel/analytics@^2.0.1` 已安装、`<Analytics/>` 已挂 `layout.tsx`，`track()` 即用。自定义事件为 Pro 档位能力（已开通）。
