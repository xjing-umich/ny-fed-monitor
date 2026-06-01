# 13F 顶级经理人持仓模块 设计（类 valuesider）

- 日期: 2026-05-30
- 状态: 自主执行中（用户授权"制定计划直接开干，下午验收"）

## 目标
在现有 NY Fed 美债看板基础上，新增一个 13F 机构持仓追踪模块：展示知名基金经理的季度持仓、组合市值、前十大持仓、季度环比变化（新增/清仓/加仓/减仓），风格沿用 Treasury Terminal。

## 数据源
SEC EDGAR 13F-HR 季度申报（免费公开，需 User-Agent 头）。
- 提交列表: `https://data.sec.gov/submissions/CIK{cik10}.json` → `filings.recent`（form/accessionNumber/filingDate/reportDate）。筛 `13F-HR`(+`13F-HR/A`)。
- 信息表 XML: `https://www.sec.gov/Archives/edgar/data/{cik}/{accNoDashless}/` 目录的 information table（含 `<infoTable>`：nameOfIssuer/cusip/titleOfClass/value/shrsOrPrnAmt.sshPrnamt/putCall）。
- 注意: 2023 起 `value` 为整美元（此前为千美元）；最新申报按整美元处理。
- 种子经理人(CIK): Berkshire(1067983)、Scion/Burry(1649339)、Pershing/Ackman(1336528)、Bridgewater/Dalio(1350694)、Appaloosa/Tepper(1006438)、Baupost/Klarman(1061768)。以 submissions 返回的 name 为准。

## 存储（关键决策）
13F 为季度历史数据，宜持久化；但 Supabase 需用户账号授权，当前无法替其开通。处理：
- **MVP = 打包 JSON 快照**：ingestion 脚本抓取+解析→写 `web/src/data/13f/{slug}.json` + `index.json`。随构建打包，Vercel 免费档零密钥可跑。季度更新→重跑脚本+重部署即可。
- **Supabase 升级路径**：数据访问层 `lib/managers/source.ts` 抽象——`env 有 SUPABASE_URL/SERVICE_KEY 则读 Supabase，否则读 JSON`；附 `supabase/schema.sql`（managers/filings/holdings）+ `@supabase/supabase-js` 适配器 + 接入说明。用户回来 `vercel integration add supabase` + 填 env + `npm run ingest` 即切持久化。

## 数据形状
- `Manager`: { cik, slug, name, manager_person, latest_period, total_value, holding_count, top_holding }
- `Holding`: { cusip, issuer, class, value, shares, putCall, weight }
- `HoldingChange`: { cusip, issuer, kind: "new"|"exited"|"increased"|"decreased", prev_shares, shares, value, delta_shares_pct }
- 每经理人 JSON: { manager, latest: {period, filed_at, accession, holdings[] }, prior: {period, holdings[]}, changes[] }（changes 可由 latest/prior 在展示层算，或 ingestion 预算）。

## 展示（Treasury Terminal 风格）
- 侧栏新增分组 **「13F 机构持仓 / 13F Managers」**，列出经理人。
- `/[lang]/managers`: 经理人列表卡片（名称/人名、组合市值(mono)、持仓数、第一大持仓、最新报告期）。
- `/[lang]/managers/[cik]`: 详情——头部(名称/报告期/总市值/持仓数)；前十大持仓(占比条)；季度环比变化分组(新增/清仓/加仓/减仓)；完整持仓表(可折叠，单语言表头，mono 数字)。
- 中英双语沿用 `/[lang]` 路由 + 单语言渲染。

## 验收
1. `npm run build` 通过；`/[lang]/managers`、`/[lang]/managers/[cik]` 返回 200。
2. 至少 4–6 位经理人有真实 13F 持仓数据与前十大、环比变化。
3. 风格与现有 Treasury Terminal 一致；无 console 报错；Vercel 免费档可部署（无需密钥即跑）。
4. 提供 Supabase schema + 接入说明作为升级路径。
