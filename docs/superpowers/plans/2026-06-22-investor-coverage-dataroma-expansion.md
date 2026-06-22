# 投资人覆盖扩圈（映射 Dataroma 全集 34→~80）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把投资人覆盖从 34 位策展价值投资者扩到 ~80 位，复用现成 13F 摄取管线，零新增运行时代码。

**Architecture:** 纯数据策展 —— 以 Dataroma guru 全集为选择参照，逐个回 SEC EDGAR 解析 CIK + 校验有活跃 13F-HR，去重后写入种子表 `web/config/managers.json`，分两波跑现成 `npm run ingest` 管线（抓 8 季 13F → Supabase upsert → 共识重算）。最后给最知名 ~15 位补中文别名。

**Tech Stack:** TypeScript / tsx；SEC EDGAR submissions API + 公司检索；Supabase（ingest upsert）；Next.js 16 App Router（`generateStaticParams` 自动出页）。

## Global Constraints

- 数据准确性铁律：CIK / 名称 / 13F / 持仓**只从 SEC EDGAR 权威源解析**，Dataroma 仅作选择参照；每条新增记录解析来源 + 日期。
- 守复利品牌：每位必须能归到公认 `person` 人名；纯机构 filer 不收（与 WhaleWisdom 式全量大基金的分界线）。
- 准入硬条件：CIK 存在 `13F-HR` 且最近一期 `reportDate ≥ 2024-06-30`。
- 去重键 = **CIK**（10 位补零）。
- 种子 schema 不变：`{cik, slug, person, people?[], aliases?[]}`（见 `web/config/managers.json` 现有 berkshire 条目）。
- 无测试套件 [[no-tests-solo-dev]]：验证用 SEC 校验脚本 + tsc + build + 计数对账 + 抽查页面。
- SEC 请求礼貌限速：`User-Agent: NYFedMonitor research junlinzhu@jobright.ai`，≥250ms 间隔。
- worktree 跑 `npm run build` 须先 `npm ci` 真包（软链 Turbopack 崩）[[worktree-build-needs-real-node-modules]]；tsc/tsx 不受影响。
- **环境前提**：`npm run ingest` 与新页渲染都需 Supabase 凭据（`SUPABASE_URL` / `SUPABASE_SERVICE_KEY`）。本地 worktree 无凭据时：可做 config 校验 / tsc / 候选 CIK 校验；ingest 与页面渲染验证须在连库环境（GitHub Action `ingest.yml` / Vercel preview）执行——计划中已逐步标注 **[需连库]**。

---

### Task 1: 组装并校验净新增候选清单

把 Dataroma guru 全集解析成「已验证、去重、可直接灌入种子表」的候选 JSON，并填回 spec 附录 A/B。产出一个一次性校验脚本（dev 工具，非运行时）。

**Files:**
- Create: `web/config/managers.candidates.json`（候选种子，临时中转；Task 3 末删除）
- Create: `web/scripts/validate-13f-filers.ts`（一次性校验脚本）
- Modify: `docs/superpowers/specs/2026-06-22-investor-coverage-dataroma-expansion-design.md`（填附录 A/B）
- Read: `web/config/managers.json`（现有 34，去重基准）

**Interfaces:**
- Produces: `web/config/managers.candidates.json` = `Array<{cik, slug, person}>`（已验证净新增），供 Task 2/3 消费。

- [ ] **Step 1: 取 Dataroma guru 名单**

WebFetch `https://www.dataroma.com/m/home.php`，提取每位 guru 的「基金名 + 主理人名」。预期 ~80 行。仅作选择参照，不抄派生数据。

- [ ] **Step 2: 去重现有 34**

读 `web/config/managers.json`，按主理人/基金身份剔除已收的（Buffett/Burry/Ackman/Klarman/Pabrai/Icahn/Einhorn 等多半已在）。剩约 45-50 位进候选。最终去重在 Step 5 按 CIK 复核。

- [ ] **Step 3: 解析每位候选 CIK**

对每个候选基金法定名，用 SEC 公司检索解析 13F filer CIK：
```bash
curl -s -A "NYFedMonitor research junlinzhu@jobright.ai" \
  "https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&company=<URL编码基金名>&type=13F-HR&dateb=&owner=include&count=10&output=atom" | grep -iE "<cik>|<title>"
```
取有 13F-HR 历史的那条 CIK。写入候选条目 `{cik(10位补零), slug(kebab基金名), person}`。解析不到 → 落剔除清单（附录 B），记原因。

- [ ] **Step 4: 写校验脚本**

`web/scripts/validate-13f-filers.ts`：读 `config/managers.candidates.json`，对每个 CIK 拉 `https://data.sec.gov/submissions/CIK##########.json`，断言 `filings.recent.form` 含 `13F-HR` 且最近 `reportDate ≥ 2024-06-30`，打印 `PASS <slug> <官方name> <最近reportDate>` 或 `FAIL <slug> <原因>`。带 250ms 限速 + 上述 User-Agent。结构参照 `web/scripts/prices-backfill.ts` 的 tsx 脚本风格。

- [ ] **Step 5: 跑校验，剔除不合格**

Run: `cd web && npx tsx scripts/validate-13f-filers.ts`
Expected: 多数 PASS。把 FAIL 的从 `managers.candidates.json` 移到 spec 附录 B（记原因）；PASS 的填 spec 附录 A（含官方 name、最近 reportDate）。再按 CIK 与现有 34 复核去重一次。

- [ ] **Step 6: 提交**

```bash
cd /Users/junlinzhu/Desktop/yangyang-code/ny-fed-monitor/.claude/worktrees/investor-coverage-dataroma
git add web/config/managers.candidates.json web/scripts/validate-13f-filers.ts docs/superpowers/specs/2026-06-22-investor-coverage-dataroma-expansion-design.md
git commit -m "feat(investors): 净新增候选清单 + SEC 13F-HR 校验脚本(Task 1)"
```

---

### Task 2: 第 1 波 —— 加 ~10 位验证全链路

先加约 10 位最有名的净新增，跑通整条管线，确认页面/构建/sitemap 无碍，再灌全量。

**Files:**
- Modify: `web/config/managers.json`（追加 ~10 条）
- Read: `web/config/managers.candidates.json`

**Interfaces:**
- Consumes: `web/config/managers.candidates.json`（Task 1 产出）

- [ ] **Step 1: 追加 ~10 条种子**

从 `managers.candidates.json` 取约 10 位最知名者（如 Oakmark/Bill Nygren、Gardner Russo、Lou Simpson、Chris Hohn 之类，以实际 PASS 为准），把 `{cik, slug, person}` 追加进 `web/config/managers.json` 数组末尾。校验 JSON 合法：
```bash
cd web && node -e "JSON.parse(require('fs').readFileSync('config/managers.json','utf8')); console.log('JSON OK')"
```

- [ ] **Step 2: 跑摄取 [需连库]**

Run: `cd web && npm run ingest`
Expected: 日志含新增各 slug 的「Written … (N quarters)」与「upserted to Supabase」；末尾「Total managers processed」≈ 44；无护栏 `exit 1`；「Consensus: … 行」非空。
（无凭据环境：跳过本步，交由 `ingest.yml` Action 或手动连库跑。）

- [ ] **Step 3: 验证页面渲染 [需连库]**

起 dev（`npm run dev`）或在 preview 抽查 3 个新 slug：`/en/investors/<slug>` 与 `/zh/investors/<slug>` —— 人名 / 持仓表 / 8 季趋势 / QoQ / 正文均渲染，无 notFound。

- [ ] **Step 4: tsc + build**

Run（worktree 须先 `npm ci`）: `cd web && npx tsc --noEmit && npm run build`
Expected: tsc exit 0；build 路由表成功，无报错。

- [ ] **Step 5: 提交**

```bash
cd /Users/junlinzhu/Desktop/yangyang-code/ny-fed-monitor/.claude/worktrees/investor-coverage-dataroma
git add web/config/managers.json web/src/data/13f/ web/src/data/13f/former-names.json
git commit -m "feat(investors): 第1波扩圈 ~10 位 + 摄取(Task 2)"
```
（`src/data/13f/*.json` 由 ingest 写；若在无库环境只改了 config，则仅 add config。）

---

### Task 3: 第 2 波 —— 灌入剩余全量

**Files:**
- Modify: `web/config/managers.json`（追加剩余净新增）
- Delete: `web/config/managers.candidates.json`（中转件，用完删）

- [ ] **Step 1: 追加剩余种子**

把 `managers.candidates.json` 中剩余全部 PASS 条目追加进 `web/config/managers.json`。JSON 合法性校验同 Task 2 Step 1。计数：
```bash
cd web && grep -c '"cik"' config/managers.json   # 预期 ≈ 80
```

- [ ] **Step 2: 跑摄取 [需连库]**

Run: `cd web && npm run ingest`
Expected: 「Total managers processed」≈ 80；无护栏 exit 1；共识行数非空。

- [ ] **Step 3: 全量验证 [需连库] + 本地**

- [需连库] index 计数 ≈ 80；sitemap 投资人 URL ≈ 80×2（抽查 `/sitemap.xml` 或 `src/app/sitemap.ts` 派生结果）。
- 本地：`cd web && npx tsc --noEmit && npm run build`（先 `npm ci`）全绿。
- [需连库] 抽查 3-5 个第 2 波新页渲染正常。

- [ ] **Step 4: 删中转件 + 提交**

```bash
cd /Users/junlinzhu/Desktop/yangyang-code/ny-fed-monitor/.claude/worktrees/investor-coverage-dataroma
git rm web/config/managers.candidates.json
git add web/config/managers.json web/src/data/13f/
git commit -m "feat(investors): 第2波灌入剩余净新增,覆盖达~80(Task 3)"
```

---

### Task 4: 给最知名 ~15 位补中文别名

按 spec §6 选项 b：只给净新增里最知名的 ~15 位补 `people[].zh` + 中文 `aliases`，长尾英文为主。中文别名由 `src/lib/aliases/config.ts` 构建期从 config 读，**无需 re-ingest，重新 build 即可**。

**Files:**
- Modify: `web/config/managers.json`（给 ~15 条加 `people[]`/`aliases`）
- Read: `web/src/lib/aliases/config.ts`（确认消费方式）

- [ ] **Step 1: 加中文富化字段**

给 ~15 位知名净新增条目加：
```jsonc
"people": [{ "name": "<英文principal>", "zh": "<中文名>" }],
"aliases": ["<基金简称>", "<中文别名>"]
```
中文名取通行译名（如 Howard Marks→霍华德·马克斯）。JSON 合法性校验同前。

- [ ] **Step 2: build 验证别名生效**

Run（先 `npm ci`）: `cd web && npx tsc --noEmit && npm run build`
Expected: 全绿。[可选，需连库] dev 起后搜索框输入某中文名 → 命中对应投资人页。

- [ ] **Step 3: 提交**

```bash
cd /Users/junlinzhu/Desktop/yangyang-code/ny-fed-monitor/.claude/worktrees/investor-coverage-dataroma
git add web/config/managers.json
git commit -m "feat(investors): 知名~15位补中文别名(people.zh + aliases)(Task 4)"
```

---

## 收尾

四个任务后：分支 `feat/investor-coverage-dataroma` 含 spec + plan + 校验脚本 + 扩充种子表 + ingest 产物。按 superpowers:finishing-a-development-branch 走 PR（用户浏览器合并；`ingest.yml` 在合并后/手动以连库凭据回灌 Supabase 使新页上线）。
