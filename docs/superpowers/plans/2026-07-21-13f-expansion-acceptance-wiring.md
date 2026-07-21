# 13F 扩容验收门禁与页面串联 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 按 [spec](../specs/2026-07-21-13f-expansion-acceptance-wiring-design.md) 收口 GMO+Wave1、跑通 Wave 2a/2b，并以 M1–M6 + 页面串联抽查把扩容做成可合并交付。

**Architecture:** 策展数据驱动（`managers.json` → `INGEST_ONLY` 13F → OpenFIGI + consensus 快照 → `sec:ingest:holdings` → `valuation:ingest`）。用 `expansion-acceptance.ts` 采 B0/Bw 并判定 M1–M5；M6 为手工 URL 抽查。运行时页面只读 Supabase。

**Tech Stack:** TypeScript / tsx；SEC EDGAR；Supabase；Next.js App Router；现有 `npm run ingest` / `sec:ingest:holdings` / `valuation:ingest`。

## Global Constraints

- Spec 是唯一验收真相：`docs/superpowers/specs/2026-07-21-13f-expansion-acceptance-wiring-design.md`。
- **B0** 在 Wave 2a 前锁定，之后禁止覆盖；**Bw** 每波重采；**M5 只对 B0**。
- Policy A 不收：Jensen / Mairs & Power / Third Avenue / Torray / Phil Town / Abrams Bison / Independent Franchise / Parnassus。
- 无测试套件 [[no-tests-solo-dev]]：验证用 acceptance 脚本 + 计数对账 + 页面抽查（不写 Jest）。
- SEC 礼貌限速：`User-Agent: NYFedMonitor research junlinzhu@jobright.ai`，≥250ms。
- **[需连库]** 步骤需仓库根 `.env.local` 或 CI secrets：`SUPABASE_URL` / `SUPABASE_SERVICE_KEY`（或 `NEXT_PUBLIC_SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY`）。
- 分支：`feat/add-gmo-13f-manager`（已有 design commits + 未提交的 Wave1 种子/INGEST_ONLY）。
- 回滚：`npx tsx scripts/retire-manager.ts <slug...>` + 从 `managers.json` 删条目 + 重跑 consensus。

## File map

| File | Responsibility |
|---|---|
| `web/config/managers.json` | 种子真相（追加 Wave 2a/2b） |
| `web/scripts/ingest-13f.ts` | 已有 `INGEST_ONLY`；勿回归全量重写 index |
| `web/scripts/expansion-acceptance.ts` | 新建：采基线 / 判 M1–M5 / 读写 B0 文件 |
| `web/config/expansion-baseline-b0.json` | 新建：锁定的 B0 数字（可提交） |
| `web/scripts/validate-13f-filers.ts` | 复用：校验候选 CIK |
| `web/config/managers.candidates.json` | 临时：Wave 2a/2b 候选（用完可删或不提交） |
| `web/src/data/13f/former-names.json` | ingest 合并产物（可提交） |
| `docs/.../2026-07-21-...-design.md` 附录 C | 实收 / 剔减记录 |

---

### Task 0: 提交已落地的 GMO + Wave 1 + INGEST_ONLY

把会话里已跑通、尚未 commit 的种子与脚本改动落盘，作为后续波次基线。

**Files:**
- Modify: `web/config/managers.json`（应已含 gmo + 10 Wave1）
- Modify: `web/scripts/ingest-13f.ts`（`INGEST_ONLY`）
- Modify: `web/src/data/13f/former-names.json`（若有 diff）

- [ ] **Step 1: 核对种子计数与唯一性**

```bash
cd web && node <<'NODE'
const m = require('./config/managers.json');
const slugs = m.map(x => x.slug);
const ciks = m.map(x => x.cik);
if (new Set(slugs).size !== m.length) throw new Error('dup slug');
if (new Set(ciks).size !== m.length) throw new Error('dup cik');
const need = ['gmo','altarock-partners','adw-capital','alta-fox-capital','joho-capital','greenbrier-partners','7g-capital','ancient-art','triple-frond','meritage-group','bares-capital'];
for (const s of need) if (!slugs.includes(s)) throw new Error('missing '+s);
console.log('OK managers', m.length);
NODE
```

Expected: `OK managers 87`（或当前实数；须 ≥ 87 且含上列 slug）。

- [ ] **Step 2: 确认 DB 已有这 11 户 [需连库]**

若本地尚未 upsert，补跑：

```bash
cd web && INGEST_ONLY=gmo,altarock-partners,adw-capital,alta-fox-capital,joho-capital,greenbrier-partners,7g-capital,ancient-art,triple-frond,meritage-group,bares-capital npm run ingest
```

Expected: 各 slug `upserted to Supabase`；`Consensus: holdings … 行` 非空；exit 0。

- [ ] **Step 3: Commit**

```bash
git add web/config/managers.json web/scripts/ingest-13f.ts web/src/data/13f/former-names.json
git commit -m "$(cat <<'EOF'
feat(13f): add GMO + Wave1 managers and INGEST_ONLY partial ingest

EOF
)"
```

不要提交 `web/.tmp-research/`、`web/hrb-reddit-post.md`、gitignore 的 `src/data/13f/*.json`（除 `former-names.json`）。

---

### Task 1: `expansion-acceptance.ts` + 锁定 B0

**Files:**
- Create: `web/scripts/expansion-acceptance.ts`
- Create: `web/config/expansion-baseline-b0.json`（Step 3 写出）
- Optional Modify: `web/package.json` 增加 `"expansion:accept": "tsx scripts/expansion-acceptance.ts"`

- [ ] **Step 1: 实现验收脚本**

创建 `web/scripts/expansion-acceptance.ts`（完整逻辑如下；风格对齐 `retire-manager.ts` 读 `.env.local`）：

```typescript
/**
 * 13F 扩容验收：采 consensus/valuation 指标，判 M1–M5。
 * 用法:
 *   npx tsx scripts/expansion-acceptance.ts snapshot --out config/expansion-baseline-b0.json
 *   npx tsx scripts/expansion-acceptance.ts check --b0 config/expansion-baseline-b0.json [--bw config/expansion-baseline-bw.json]
 * snapshot 无 --out 时打印 JSON 到 stdout。
 * check 若传 --write-bw <path> 会把当前指标写作 Bw。
 */
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";
import { createClient } from "@supabase/supabase-js";
import WebSocket from "ws";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

type Metrics = {
  capturedAt: string;
  managers_json: number;
  managers_db: number;
  consensus_n: number;
  ge2_n: number;
  lonely_n: number;
  valued_n: number;
  valued_ratio: number;
};

function loadEnv(): Record<string, string> {
  const fileEnv: Record<string, string> = {};
  const envPath = path.join(__dirname, "../../.env.local");
  if (fs.existsSync(envPath)) {
    for (const line of fs.readFileSync(envPath, "utf8").split("\n")) {
      const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
      if (m) fileEnv[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
    }
  }
  return { ...fileEnv, ...process.env } as Record<string, string>;
}

function dbClient() {
  const env = loadEnv();
  const url = env.SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL;
  const key = env.SUPABASE_SERVICE_KEY || env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("缺 Supabase env");
  return createClient(url, key, {
    auth: { persistSession: false },
    realtime: { transport: WebSocket as unknown as never },
  });
}

async function countAll(db: ReturnType<typeof dbClient>, table: string, filter?: string): Promise<number> {
  let q = db.from(table).select("*", { count: "exact", head: true });
  if (filter === "ge2") q = q.gte("holder_count", 2);
  if (filter === "lonely") q = q.eq("holder_count", 1);
  const { count, error } = await q;
  if (error) throw new Error(`${table}: ${error.message}`);
  return count ?? 0;
}

async function capture(): Promise<Metrics> {
  const db = dbClient();
  const managersPath = path.join(__dirname, "../config/managers.json");
  const managers_json = (JSON.parse(fs.readFileSync(managersPath, "utf8")) as unknown[]).length;
  const managers_db = await countAll(db, "managers");
  const consensus_n = await countAll(db, "consensus_holdings");
  const ge2_n = await countAll(db, "consensus_holdings", "ge2");
  const lonely_n = await countAll(db, "consensus_holdings", "lonely");
  const valued_n = await countAll(db, "valuation_snapshot");
  const valued_ratio = consensus_n > 0 ? valued_n / consensus_n : 0;
  return {
    capturedAt: new Date().toISOString(),
    managers_json,
    managers_db,
    consensus_n,
    ge2_n,
    lonely_n,
    valued_n,
    valued_ratio,
  };
}

function pp(ratio: number): string {
  return (ratio * 100).toFixed(2) + "%";
}

function check(b0: Metrics, cur: Metrics, bw: Metrics | null): number {
  let failed = 0;
  const gate = (name: string, ok: boolean, detail: string) => {
    console.log(`${ok ? "PASS" : "FAIL"} ${name} | ${detail}`);
    if (!ok) failed++;
  };

  gate("M1", cur.managers_json === cur.managers_db, `json=${cur.managers_json} db=${cur.managers_db}`);
  // M2 由 ingest 进程 exit code 判定；此处只提示
  console.log("SKIP M2 | 由本波 INGEST_ONLY 进程成功比 ≥90% 判定（看 ingest 日志）");

  const base = bw ?? b0;
  gate("M3", cur.consensus_n >= base.consensus_n && cur.ge2_n >= base.ge2_n,
    `consensus ${base.consensus_n}→${cur.consensus_n}; ge2 ${base.ge2_n}→${cur.ge2_n}`);

  const dCons = cur.consensus_n - base.consensus_n;
  const dLonely = cur.lonely_n - base.lonely_n;
  let m4 = true;
  let m4detail = "";
  if (dCons === 0) {
    m4 = dLonely === 0;
    m4detail = dLonely === 0 ? "Δconsensus=0 Δlonely=0 → N/A pass" : `Δconsensus=0 but Δlonely=${dLonely}`;
  } else {
    const ratio = dLonely / dCons;
    m4 = ratio <= 0.6;
    m4detail = `Δlonely/Δconsensus=${ratio.toFixed(3)} (≤0.6)`;
  }
  gate("M4", m4, m4detail);

  const dropPp = (b0.valued_ratio - cur.valued_ratio) * 100;
  const m5 = dropPp <= 3 || cur.valued_n >= b0.valued_n;
  gate("M5", m5,
    `ratio ${pp(b0.valued_ratio)}→${pp(cur.valued_ratio)} (Δ=${dropPp.toFixed(2)}pp); valued_n ${b0.valued_n}→${cur.valued_n}`);

  console.log("SKIP M6 | 手工页面抽查（见 plan Task 4）");
  return failed;
}

async function main() {
  const [cmd, ...rest] = process.argv.slice(2);
  const arg = (name: string) => {
    const i = rest.indexOf(name);
    return i >= 0 ? rest[i + 1] : undefined;
  };

  if (cmd === "snapshot") {
    const m = await capture();
    const out = arg("--out");
    const json = JSON.stringify(m, null, 2) + "\n";
    if (out) {
      fs.writeFileSync(path.resolve(out), json);
      console.log(`wrote ${out}`);
    }
    console.log(json);
    return;
  }

  if (cmd === "check") {
    const b0path = arg("--b0");
    if (!b0path) throw new Error("check 需要 --b0 <path>");
    const b0 = JSON.parse(fs.readFileSync(path.resolve(b0path), "utf8")) as Metrics;
    const cur = await capture();
    const writeBw = arg("--write-bw");
    if (writeBw) fs.writeFileSync(path.resolve(writeBw), JSON.stringify(cur, null, 2) + "\n");
    const bwPath = arg("--bw");
    const bw = bwPath
      ? (JSON.parse(fs.readFileSync(path.resolve(bwPath), "utf8")) as Metrics)
      : null;
    console.log("current:", cur);
    const failed = check(b0, cur, bw);
    process.exitCode = failed > 0 ? 1 : 0;
    return;
  }

  console.error("用法: snapshot [--out path] | check --b0 path [--bw path] [--write-bw path]");
  process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
```

- [ ] **Step 2: 采并锁定 B0 [需连库]**

```bash
cd web && npx tsx scripts/expansion-acceptance.ts snapshot --out config/expansion-baseline-b0.json
```

Expected: 写出文件；`consensus_n` / `valued_n` 为正；`managers_json` 与 `managers_db` 相等（否则先修 M1 再锁 B0）。

- [ ] **Step 3: 自检 check 对 B0 应全绿 [需连库]**

```bash
cd web && npx tsx scripts/expansion-acceptance.ts check --b0 config/expansion-baseline-b0.json
```

Expected: M1/M3/M4/M5 PASS（相对自身）；exit 0。

- [ ] **Step 4: Commit**

```bash
git add web/scripts/expansion-acceptance.ts web/config/expansion-baseline-b0.json web/package.json
git commit -m "$(cat <<'EOF'
feat(13f): expansion acceptance script and lock B0 baseline

EOF
)"
```

---

### Task 2: Wave 2a（中等宽度 5 户）全链路

名单：Hillman、Muhlenkamp、Turtle Creek、Arbiter、Check Capital。

**Files:**
- Create: `web/config/managers.candidates.json`（临时）
- Modify: `web/config/managers.json`
- Modify: spec 附录 C

- [ ] **Step 1: 解析 CIK 并写入 candidates**

对每户基金名用 SEC 全文检索定位 13F filer CIK，再拉 submissions 确认活跃：

```bash
# 例：检索
curl -sL -A "NYFedMonitor research junlinzhu@jobright.ai" \
  "https://efts.sec.gov/LATEST/search-index?q=%22HILLMAN%22&forms=13F-HR&dateRange=custom&startdt=2024-01-01&enddt=2026-07-21" \
  | python3 -c "import json,sys; d=json.load(sys.stdin); print([(h['_source'].get('ciks'), h['_source'].get('display_names'), h['_source'].get('file_date')) for h in d.get('hits',{}).get('hits',[])[:8]])"

# 例：确认 reportDate
curl -sL -A "NYFedMonitor research junlinzhu@jobright.ai" \
  "https://data.sec.gov/submissions/CIK##########.json" \
  | python3 -c "import json,sys; d=json.load(sys.stdin); f=d['filings']['recent']; print(d['name']); print([(a,b) for a,b in zip(f['form'],f['reportDate']) if '13F' in a][:3])"
```

写入：

```json
[
  { "cik": "##########", "slug": "hillman-capital", "person": "Mark Hillman" },
  { "cik": "##########", "slug": "muhlenkamp", "person": "Ronald Muhlenkamp" },
  { "cik": "##########", "slug": "turtle-creek", "person": "Andrew Brenton" },
  { "cik": "##########", "slug": "arbiter-partners", "person": "Paul Isaac" },
  { "cik": "##########", "slug": "check-capital", "person": "Steven Check" }
]
```

slug 以实际不冲突为准（查现有 `managers.json`）。

- [ ] **Step 2: 校验 13F-HR**

```bash
cd web && npx tsx scripts/validate-13f-filers.ts
```

Expected: 5 条 PASS（`reportDate ≥ 2024-06-30`）。FAIL 的移出本波并记附录 C。

- [ ] **Step 3: 采本波 Bw（= 当前，应接近 B0）[需连库]**

```bash
cd web && npx tsx scripts/expansion-acceptance.ts snapshot --out /tmp/expansion-bw-2a-before.json
```

- [ ] **Step 4: 追加种子**

把 PASS 条目 append 进 `managers.json`；跑 Task 0 Step 1 同类唯一性检查。

- [ ] **Step 5: INGEST_ONLY [需连库]**

```bash
cd web && INGEST_ONLY=hillman-capital,muhlenkamp,turtle-creek,arbiter-partners,check-capital npm run ingest
```

（slug 以实际为准，逗号拼接。）

Expected: 本波成功比 ≥ 90%；各 slug upsert；Consensus 行数更新；**M2 PASS**。

- [ ] **Step 6: SEC + valuation [需连库]**

```bash
cd web && npm run sec:ingest:holdings
cd web && npm run valuation:ingest
```

Expected: 无致命 exit；允许个别 ticker 跳过（ADR/非经营性）。若 `sec:ingest:holdings` 过久，可让其跑完（GHA 预算 90min）；本地可隔夜。

- [ ] **Step 7: 门禁 check [需连库]**

```bash
cd web && npx tsx scripts/expansion-acceptance.ts check \
  --b0 config/expansion-baseline-b0.json \
  --bw /tmp/expansion-bw-2a-before.json
```

Expected: M1/M3/M4/M5 PASS。若 M4/M5 FAIL：从本波剔除最宽 1–2 户 → `retire-manager.ts` → 从 JSON 删除 → 重跑 ingest consensus（或全波 `INGEST_ONLY` 剩余）+ valuation → 再 check；剔减写入附录 C。

- [ ] **Step 8: M6 本波页面抽查（不过不进 2b）[需连库]**

`npm run dev`（或 preview）。对本波至少 **2 个新 slug** + 各 1 个 Top 持股：

1. `/en/investors` 能搜到  
2. `/en/investors/<slug>` 持仓非空、季报可切换、Top1 → `/en/stocks/<TICKER>`  
3. 个股持有人表含该 slug；有 Related/同持则点回投资人页  
4. `holder_count≥2` → 在 `/en/stocks` 与 sitemap；`=1` → 不在 sitemap  
5. 有快照则估值卡/screener 诚实（非假有数）  
6. `managers.json` 人数 = DB managers =（可选）本地 index 人数  

任一条失败 → 修 enrich/consensus 或剔 slug，**禁止开始 Task 3**。

- [ ] **Step 9: Commit 种子 + 附录 C 更新**

```bash
git add web/config/managers.json docs/superpowers/specs/2026-07-21-13f-expansion-acceptance-wiring-design.md
git commit -m "$(cat <<'EOF'
feat(13f): Wave 2a managers through acceptance gates

EOF
)"
```

`managers.candidates.json` 可删或不提交。

---

### Task 3: Wave 2b（宽组合 5 户）全链路

仅在 Task 2 **数字门禁 + M6** 全绿后开始。名单：Donald Smith、Eagle Capital、Disciplined Growth、Lountzis、Cullen。

**Files:** 同 Task 2。

- [ ] **Step 1: CIK + validate**（同 Task 2 Steps 1–2，含 efts curl）

建议 slug：`donald-smith`、`eagle-capital`、`disciplined-growth`、`lountzis-asset`、`cullen-value`（以 SEC 名为准防撞）。

- [ ] **Step 2: 采 Bw [需连库]**

```bash
cd web && npx tsx scripts/expansion-acceptance.ts snapshot --out /tmp/expansion-bw-2b-before.json
```

注意：**不要**覆盖 `config/expansion-baseline-b0.json`。

- [ ] **Step 3: 追加种子 + INGEST_ONLY [需连库]**

```bash
cd web && INGEST_ONLY=donald-smith,eagle-capital,disciplined-growth,lountzis-asset,cullen-value npm run ingest
```

- [ ] **Step 4: SEC + valuation [需连库]**

```bash
cd web && npm run sec:ingest:holdings && npm run valuation:ingest
```

- [ ] **Step 5: 门禁（M5 仍对 B0）[需连库]**

```bash
cd web && npx tsx scripts/expansion-acceptance.ts check \
  --b0 config/expansion-baseline-b0.json \
  --bw /tmp/expansion-bw-2b-before.json
```

M4/M5 红 → 按 spec 缩名单（优先 Eagle / Donald Smith / Disciplined Growth 中独门贡献最大者），记附录 C。

- [ ] **Step 6: M6 本波页面抽查 [需连库]**

同 Task 2 Step 8（至少 2 个本波新 slug + Top 持股串联）。不过则缩名单或修数据，勿开 PR。

- [ ] **Step 7: Commit**

```bash
git add web/config/managers.json docs/superpowers/specs/2026-07-21-13f-expansion-acceptance-wiring-design.md
git commit -m "$(cat <<'EOF'
feat(13f): Wave 2b managers through acceptance gates

EOF
)"
```

---

### Task 4: M6 页面串联抽查 + PR

**Files:**
- Modify: spec 附录 C（最终实收表）
- PR via `gh`

- [ ] **Step 1: 起本地或 preview [需连库]**

```bash
cd web && npm run dev
```

- [ ] **Step 2: 最终串联回归（Task 2/3 每波 M6 已做过；此处做跨波抽查）**

| # | URL | 期望 |
|---|---|---|
| 1 | `/en/investors` | 能搜到 Wave1 + 2a/2b 新人 |
| 2 | `/en/investors/gmo` | 持仓非空；季报切换；Top1 → 个股 |
| 3 | `/en/investors/<wave2-slug>` | 同上；另抽 1 个 `/zh/investors/<slug>` |
| 4 | 上一步个股 `/en/stocks/<TICKER>` | 持有人表含该 slug；有 Related/同持则点回 |
| 5 | 若 `holder_count≥2` | 出现在 `/en/stocks`；sitemap 含该 ticker |
| 6 | 若 `holder_count=1` | **不在** sitemap 股票段 |
| 7 | 有 `valuation_snapshot` 的票 | 卡片/screener 非假有数 |
| 8 | 计数 | `managers.json` = DB managers（M1） |

- [ ] **Step 3: 最终 M5 vs B0 [需连库]**

```bash
cd web && npx tsx scripts/expansion-acceptance.ts check --b0 config/expansion-baseline-b0.json
```

（无 `--bw` 时脚本用 B0 兼作 M3/M4 对照——最终验收以 M1 + M5 为主；若刚跑完 2b 也可用 `--bw /tmp/expansion-bw-2b-before.json`。）

Expected: M5 PASS；附录 C 填完。

- [ ] **Step 4: 填附录 C 并 commit**

- [ ] **Step 5: Push + PR**

```bash
git push -u origin HEAD
gh pr create --base db-foundation --title "feat(13f): expansion with acceptance gates (GMO + Waves)" --body "$(cat <<'EOF'
## Summary
- Add GMO + concentrated Wave 1 managers; `INGEST_ONLY` partial ingest
- Wave 2a/2b Valuesider gaps under Policy A, gated by M1–M6
- Lock B0 baseline; SEC holdings + valuation after each wave
- Page wiring smoke per acceptance spec

## Test plan
- [ ] `expansion-acceptance.ts check --b0` PASS (M1/M3/M4/M5)
- [ ] Spot-check `/en/investors/gmo` → stock → holders includes GMO
- [ ] Two Wave 2 slugs: list → detail → stock → holders
- [ ] ≥2 tickers on `/en/stocks` + sitemap; lonely not in sitemap
- [ ] Appendix C in design spec filled

EOF
)"
```

合并前按仓库规则 rebase `origin/db-foundation`（若已分叉）。

---

## Execution notes

- Wave 2 CIK 以实施时 SEC 为准；plan 不锁死 CIK。
- `sec:ingest:holdings` / `valuation:ingest` 可能各需数十分钟；门禁红时优先缩经理人名单，不放宽 3pp。
- 不要改 `CONSENSUS_MIN_HOLDERS`；不要为凑 fill 手填 ADR `ads_ratio`。
