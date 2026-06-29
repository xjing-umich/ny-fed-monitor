# 引导线 块①：landing 三步叙事 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把首页三条并列的 `FeatureRow`（投资者 / 共识 / 估值）从"三扇平行门"重排成一条**编号的下降路径**——加一句把三步连成因果叙事的过渡 thesis + 每行一个步骤序号，让用户读成"跟谁 → 他们共同看好啥 → 那只便不便宜"一条路。

**Architecture:** 给 `FeatureRow` 加一个**可选** `step?: number` prop（眉标前缀一个 faint mono 序号，无 step 时逐字不变、向后兼容）→ 首页在三条 `FeatureRow` 上传 `step={1|2|3}`，并在大师墙之后、第一条 FeatureRow 之前插一句 mono muted 的"三步看懂"过渡叙事。纯 RSC、零 hydration、零数据改动、零新组件。

**Tech Stack:** Next.js 16 App Router（RSC，无 "use client"）、TypeScript、Tailwind（仅 `--tt-*`）。

## Global Constraints

- 令牌只用 `--tt-*`，禁 shadcn 别名；明暗双模等价。
- 字体：序号/眉标 Geist Mono（`font-mono`）；标题 Fraunces（`font-display`）。
- **绿色克制**：序号用 `--tt-faint`（**不抢眉标的 accent 绿**）；过渡 thesis 用 `--tt-muted`，箭头用 faint；不加实心绿按钮。
- **不碰** `FeatureRow` 的 `reverse` 右/左/右 节奏（[[frontend-design-language]] 明确保留）；眉标→Fraunces→muted intro 节奏不动。
- 文案禁中英混排（[[no-mixed-language-copy]]）：每 locale 纯单语（`①②③`/`→` 为符号，允许）。
- 合规：叙事是产品导览，非荐股；不引入 BUY/SELL/目标价。
- 全 RSC 零 hydration，叙事进服务端 HTML。
- 验证（[[no-tests-solo-dev]]）：门 = `cd web && npx tsc --noEmit`（**非 `next build`**，本机 google fonts 被墙）+ curl SSR + 人工 QA（明暗双模 + 390/768/1280）。

---

## File Structure

- **Modify** `web/src/components/home/FeatureRow.tsx` — 加可选 `step?: number`，眉标行前缀序号。
- **Modify** `web/src/app/[lang]/page.tsx` — 三条 FeatureRow 传 `step`；大师墙后插一句"三步看懂"过渡叙事。

> 本块无纯函数、无数据、无新组件 → 无 `.check.ts`；验收靠 tsc + SSR + 人工 QA。

---

## Task 1: FeatureRow 加可选 `step` prop

**Files:**
- Modify: `web/src/components/home/FeatureRow.tsx`

**Interfaces:**
- Produces: `FeatureRow` 新增可选 prop `step?: number`。无 `step` → 渲染与现状逐字一致（向后兼容）。Task 2 使用。

- [ ] **Step 1: 加 prop + 眉标序号**

把 `FeatureRow.tsx` 的参数解构、类型、眉标行改为带 step：

参数解构（加 `step`）：

```tsx
export default function FeatureRow({
  eyebrow,
  title,
  body,
  ctaLabel,
  href,
  reverse = false,
  step,
  children,
}: {
  eyebrow: string;
  title: string;
  body: string;
  ctaLabel: string;
  href: string;
  reverse?: boolean;
  step?: number;
  children: React.ReactNode;
}): React.ReactElement {
```

眉标行（原 `<p className="font-mono text-[10px] uppercase tracking-[0.14em] text-[var(--tt-accent)]">{eyebrow}</p>`）改为：

```tsx
        <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-[var(--tt-accent)]">
          {step != null && <span className="text-[var(--tt-faint)]">{`0${step} — `}</span>}
          {eyebrow}
        </p>
```

> 序号 `--tt-faint`（不抢 accent 绿）；`0${step}` → `01/02/03`。无 step 时该 span 不渲染，眉标逐字不变。

- [ ] **Step 2: tsc 门**

Run: `cd web && npx tsc --noEmit`
Expected: exit 0（旧调用无 step → 仍合法）。

- [ ] **Step 3: 提交**

```bash
cd web && git add src/components/home/FeatureRow.tsx
git commit -m "feat(home): FeatureRow 加可选 step 序号(向后兼容)"
```

---

## Task 2: 首页三步叙事（序号 + 过渡 thesis）

**Files:**
- Modify: `web/src/app/[lang]/page.tsx`

**Interfaces:**
- Consumes: `FeatureRow` 的 `step` prop（Task 1）。
- 复用页面已有的 `isZh`、`SectionReveal`。

- [ ] **Step 1: 大师墙后插"三步看懂"过渡叙事**

在 `TrackedInvestorsWall` 的 `</SectionReveal>` 之后、第一条 `{/* Feature row ① — Investors */}` 之前，插入：

```tsx
      <SectionReveal>
        <p className="mt-20 font-mono text-xs leading-relaxed tracking-[0.04em] text-[var(--tt-muted)]">
          {isZh
            ? "三步看懂 · ① 跟谁 → ② 他们共同看好什么 → ③ 那只到底便不便宜"
            : "Three steps · ① who to follow → ② what they agree on → ③ whether it's actually cheap"}
        </p>
      </SectionReveal>
```

> 这句把三条 FeatureRow 从"平行陈列"显式框成"一条下降路径";mono muted、`①②③/→` 符号，纯单语不混排。

- [ ] **Step 2: 三条 FeatureRow 各传 step**

- 投资者行（`eyebrow={isZh ? "13F 追踪" : "13F tracking"}` 那条）的 `<FeatureRow` 标签加 `step={1}`。
- 共识行（`eyebrow={isZh ? "跨基金共识" : "Cross-fund consensus"}`，带 `reverse`）加 `step={2}`。
- 估值行（`eyebrow={isZh ? "估值" : "Valuation"}`）加 `step={3}`。

示例（投资者行，其余同理只改 step 值，**不动** `reverse`/其它 prop）：

```tsx
          <FeatureRow
            step={1}
            eyebrow={isZh ? "13F 追踪" : "13F tracking"}
            title={isZh ? "跟随聪明钱，逐季追踪" : "Follow the smart money, quarter by quarter"}
            body={isZh
              ? "追踪 70+ 位传奇投资者的 SEC 13F 季度持仓——谁在建仓、谁在清仓，逐季看清。"
              : "Track 70+ legendary investors' SEC 13F filings — who's building a position, who's getting out, quarter over quarter."}
            ctaLabel={isZh ? "浏览全部投资者 →" : "Browse all investors →"}
            href={`/${lang}/investors`}
          >
```

> 共识行的 `reverse` 保持原样（右/左/右 节奏不破）；序号在眉标行、与 reverse 的左右摆放无关。

- [ ] **Step 3: tsc 门**

Run: `cd web && npx tsc --noEmit`
Expected: exit 0。

- [ ] **Step 4: SSR view-source 核验**

```bash
cd web && npm ci && npm run dev &
# 待启动:
curl -s http://localhost:3000/en/ | grep -iE "Three steps|01 —|02 —|03 —"
curl -s http://localhost:3000/zh/ | grep -iE "三步看懂|01 —"
```

Expected：过渡叙事句 + `01 —/02 —/03 —` 三个序号在 SSR payload（en 与 zh 各自纯单语）。

- [ ] **Step 5: 人工 QA（明暗双模 + 三宽）**

`/en/` 与 `/zh/`：
- 三条 FeatureRow 眉标前各有 `01/02/03` faint 序号；不抢 accent 绿。
- "三步看懂 …"过渡句在大师墙与第一条行之间，读成一条路。
- `reverse` 节奏未变（投资者左 / 共识右 / 估值左）。
- 暗色等价；390/768/1280 不塌；纯单语无混排；`SectionReveal` 淡入正常、reduced-motion 安全。

- [ ] **Step 6: 提交**

```bash
cd web && git add src/app/\[lang\]/page.tsx
git commit -m "feat(home): 三步叙事 — FeatureRow 序号 + '三步看懂'过渡, 三扇门串成一条路"
```

---

## Self-Review

**1. Spec coverage（对 spec §2 块①）：**
- FeatureRow 加可选 `step` → Task 1 ✓
- 三行串成编号下降路径 + 过渡叙事 → Task 2 Step 1/2 ✓
- 不破 `reverse` 节奏、眉标→Fraunces→intro 节奏不动 → Global Constraints + Task 2 注释 ✓
- ③ 行落点已是 `StrikeLeadersCard`（叙事终点天然成立）→ 现状未动 ✓
- "开始这条路"引导 → 由"三步看懂"过渡句承担（不另造 hero 按钮，守绿色克制/最小改动）✓
- 设计语言/合规/单语 → Global Constraints ✓

**2. Placeholder scan：** 无 TBD/TODO；每步真码/真命令 + 期望。✓

**3. Type consistency：** `step?: number`（Task 1 定义）与 Task 2 三处 `step={1|2|3}` 一致；无其它跨任务符号。✓

**4. 范围说明：** 仅排序/叙事层，不动三行的 `eyebrow/title/body/ctaLabel/href/children` 与数据；落点 `StrikeLeadersCard`/`ValueBandCard` 不改。

---

## Execution Handoff

执行在独立 thread/worktree：从 `db-foundation` 切 `feat/guided-line-landing-narrative`，逐 task 走 subagent-driven 或 executing-plans，每 task 末提交，完成后走 [[finishing-a-development-branch]] 开 PR 到 db-foundation。本块是引导线倒序最后一块（①）；与块②无文件冲突（FeatureRow/home page vs investor page/consensusRead），②①可并行执行。
