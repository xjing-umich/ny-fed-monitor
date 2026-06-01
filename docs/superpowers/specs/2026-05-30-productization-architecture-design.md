# Smart Money Monitor 产品化架构增强 设计

- 日期: 2026-05-30
- 状态: 已与用户确认，待写实现计划
- 背景: 当前为 Next.js(Vercel) 应用，13F 用打包 JSON(仅最新+上一季)、美债实时抓取、6 位经理人、无数据库、无分析层。已上线 https://smart-money-monitor-eight.vercel.app

## 1. 目标(产品化三方向)
1. **13F 有效历史对比 + 扩充经理人**(对齐 valuesider 起步档)。
2. **经理人投资动向分析**(让用户更易观测)。
3. **美债主流功能**(用户不熟，先做收益率曲线 & 2s10s)。

## 2. 已确认的关键决策
- **规模/历史**: 精选起步(~30–50 位知名经理人) + 多季度历史回填(如近 5 年/20 季) + ticker/行业；架构按可扩展到成百上千设计，当下只跑精选集。Supabase 免费档。
- **采集托管**: GitHub Actions 定时(增量 + 历史回填)；项目纳入 Git 仓库；Vercel 改 Git 集成(push 自动部署)。
- **分析深度**: 规则指标先行(确定性、免费)；LLM 叙述解读作为后续可选增强，设计中预留接口。
- **美债优先**: 收益率曲线 & 2s10s 利差/倒挂(免费数据 Treasury.gov/FRED)。

## 3. 架构：从“打包 JSON + 实时抓取” → 三层增强

### 3.1 持久化层(Supabase Postgres)
表:
```
managers(cik PK, slug, name, person, created_at)
filings(id PK, cik FK→managers, period date, filed_at date, accession text UNIQUE,
        total_value bigint, holding_count int)            -- 每经理人每季一行 = 历史
holdings(id PK, filing_id FK→filings, cusip text, value bigint, shares numeric,
         put_call text, weight numeric)                   -- 已按 cusip(+put/call) 聚合
securities(cusip PK, ticker text, name text, sector text, updated_at)  -- CUSIP→代码/行业
```
索引: `holdings(filing_id)`、`holdings(cusip)`、`filings(cik, period)`、`securities(ticker)`。
- Web 读 DB(复用已搭的 `lib/managers/supabase.ts` 适配器)；本地无密钥时回退打包 JSON(保留 `source.ts` 的双路)。
- 容量: 50 经理人 × ~20 季 × 平均数百持仓 ≈ 数十万行 → 估算 < 200MB，在免费档 500MB 内（含 Bridgewater ~1000 持仓的极端户，需监控）。

### 3.2 采集流水线(GitHub Actions)
- 仓库根含 `.github/workflows/ingest-13f.yml`，cron 每日触发(Hobby 限制不影响 Actions)。
- 精选经理人配置 `web/config/managers.json`(~30–50 CIK + person + slug)。
- 逻辑(`scripts/ingest-13f.ts` 升级):
  - 对每位经理人，拉取 submissions 中**所有** 13F-HR(首次回填全历史；之后只补新 accession，幂等以 `accession` 唯一约束)。
  - 解析 info table → 按 `cusip|put_call` 聚合 → upsert managers/filings/holdings。
  - 用 **OpenFIGI**(免费，限速)把出现过的 CUSIP 映射 ticker/行业，写 `securities`（带缓存，仅查新 CUSIP）。OpenFIGI key 可选；无 key 时只存公司名、ticker/行业留空。
  - 礼貌限速(SEC UA 头、节流)；失败单户跳过不阻塞整批。
- 密钥: GitHub Secrets `SUPABASE_URL`、`SUPABASE_SERVICE_KEY`、`OPENFIGI_KEY`(可选)。

### 3.3 分析层(规则指标，DB 之上；SQL 视图或 TS 模块)
- 单经理人/单季: QoQ 新建/清仓/加仓/减仓、信念度(权重 + Δshares)、最大买卖。
- **多季度趋势**: (manager, cusip) 仓位随时间(shares/value/weight 序列)；组合总市值时间线。
- **跨经理人共识**: 本季“最多人买/卖”、某股被多少经理人持有、聚合持股市值。
- 行业轮动(securities.sector 权重随时间)、集中度(Top-N 权重、持仓数)。
- LLM 叙述: 预留 `manager_analysis(cik, period, text)` 表/接口，后续用 LLM 填(本期不接)。

### 3.4 美债新模块: 收益率曲线 & 2s10s
- 数据: 优先 Treasury.gov 每日 par 收益率(无需 key)；历史/2s10s 可用 FRED(DGS2/DGS10/T10Y2Y，免费 key)。实时抓取 + ISR(与现有美债模块一致，不入库)。
- 页面 `/[lang]/yield-curve`: 当前收益率曲线(3M/2/5/10/30Y 折线) + 2s10s(及 3m10y)时间序列 + 倒挂指示与解读。归入“美债市场”域。
- 若用 FRED → env `FRED_API_KEY`。

### 3.5 Web 视图增强
- 经理人详情: 增加多季度历史(组合市值时间线 + 重仓的仓位趋势小图) + 季度选择/对比。
- 新增“聪明钱共识”页 `/[lang]/consensus`: 本季最多人买/卖、集中持有标的。
- 持仓表/卡片显示 ticker + 行业(来自 securities)。
- 经理人列表扩到精选集(分页/排序)。

### 3.6 运维/部署
- 项目纳入 GitHub 仓库 → Vercel Git 集成(push→自动 preview/prod)。
- Vercel env: `SUPABASE_URL`、`SUPABASE_ANON_KEY`/`SUPABASE_SERVICE_KEY`、可选 `FRED_API_KEY`。
- 新鲜度标注: 13F 季度(标 period)、收益率曲线每日(标 as-of)。遵循数据准确性要求(标来源+日期)。

## 4. 分阶段实施(供 writing-plans 细化)
- **阶段 A — DB + 迁移**: Supabase schema 上线；ingestion 写入 Supabase(先现有 6 户、单季)；Web 数据层切 DB(JSON 回退保留)。
- **阶段 B — 历史 + 扩充 + 流水线**: 全历史回填；扩到 ~30–50 经理人;GitHub Actions 定时;OpenFIGI 富化;Git+Vercel 集成。
- **阶段 C — 分析层**: 规则指标(趋势/共识/行业/集中度)+ 相应 Web 视图。
- **阶段 D — 美债曲线**: 收益率曲线 & 2s10s 模块。

## 5. 需要用户配合的前提(不阻塞设计/计划)
1. 建 GitHub 仓库并把项目纳入版本控制。
2. `vercel integration add supabase`(或 Supabase 控制台)开通免费 Postgres，注入 env。
3. (可选) OpenFIGI 免费 key；(若用 FRED) 免费 FRED key。

## 6. 验收标准
- 13F 数据持久化于 Supabase，含多季度历史；Web 能展示某经理人/某标的的季度趋势与跨经理人共识。
- 经理人扩至 ~30–50，含 ticker/行业。
- GitHub Actions 定时采集可增量更新；push 自动部署。
- 美债新增收益率曲线 & 2s10s 页，数据实时、标注 as-of。
- 全程免费档可运行；`npm run build` 通过；无 console 报错；保留本地 JSON 回退便于无密钥开发。
