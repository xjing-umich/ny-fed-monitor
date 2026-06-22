# 投资人覆盖扩圈 — 映射 Dataroma 全集（34 → ~80）设计 spec

**日期**：2026-06-22
**分支**：`feat/investor-coverage-dataroma`（off `db-foundation` e3b4c6a）
**定位**：把「超级投资者」这条腿**做宽广**——投资人覆盖从 34 位策展扩到 ~80 位，全部为带人脸名字的价值/长线投资者，守 [[product-direction]] 复利品牌与 [[valuation-philosophy-constraint]]。
**约束**：守数据准确性铁律（数据从 SEC EDGAR 权威源解析，标源标日期）；零测试套件按 [[no-tests-solo-dev]]（验证用 tsc + build + 抽查页面 + 计数对账）；worktree 跑 build 需 `npm ci` 真包见 [[worktree-build-needs-real-node-modules]]。

---

## 1. 背景与差距

竞品盘点（2026-06）：与本产品最像的 Dataroma 策展 ~80 位价值投资 guru（免费、无业绩榜/无回测，正是本产品同赛道）。本产品当前仅 34 位（`web/config/managers.json` 手工种子表）。**广度是投资人这条腿的最大短板**——现有 34 位里大半本就是 Dataroma guru（巴菲特 / Burry / Ackman / Klarman / Pabrai / Icahn / Einhorn …），净缺口约 45-50 位同类名家。

关键发现：**扩圈不是工程缺口，是数据策展**。摄取管线 `web/scripts/ingest-13f.ts` 已能处理任意数量管理人（读种子表 → 抓 EDGAR 8 季 13F → 写 JSON + `index.json` + Supabase upsert + 证券富化 + 共识重算），`generateStaticParams` 直接遍历 index。瓶颈纯粹是种子表手工停在 34。

## 2. 数据源与策展准则

- **选谁（选择参照）**：以 Dataroma guru 全集（~80）为「哪些 SEC filer 算价值投资 guru」的选择参照。
- **数据从哪来（权威源）**：CIK、人名核对、13F、持仓**一律从 SEC EDGAR 解析**；Dataroma 仅作选择参照，不抄其任何派生内容。每条新增记录在 spec 附表标注解析来源(SEC submissions API)+解析日期。
- **准入硬条件**：该 CIK 必须存在可解析的近期 `13F-HR` 申报（停报 / 关闭 / 转私基金剔除，见 §4）。
- **品牌准则**：每位必须能赋一个公认的 `person`（principal 人名）。无法归到具体名家的纯机构 filer **不收**——这是与 WhaleWisdom 式全量大基金的分界线。

## 3. 种子条目 schema（沿用现有结构，不改 schema）

写入 `web/config/managers.json`，数组元素 `Omit<Manager,"name">` + 可选富化字段（现有 berkshire 条目已示范）：

```jsonc
{
  "cik": "0001234567",            // 必填，SEC 10 位补零 CIK，唯一键
  "slug": "<kebab-基金名>",        // 必填，URL slug，全表唯一
  "person": "<principal 英文名>",  // 必填，品牌人脸
  "people": [                      // 可选，多主理人 + 中文名/角色
    { "name": "...", "zh": "<中文名>", "role": "..." }
  ],
  "aliases": ["<基金简称>", "<中文别名>"]  // 可选，喂中文/简称搜索
}
```

- `name`（基金法定名）由 ingest 期从 EDGAR `submissions.name` 回填，**不手填**（避免与官方名漂移）。
- `slug` 命名：基金通用名 kebab（如 `oakmark`、`gardner-russo`），与现有风格一致；撞名加辨识词。

## 4. CIK 解析 + 预校验流程（实施期，纯数据labor）

对每个 Dataroma guru 候选：

1. **解析 CIK**：基金法定名 → `https://data.sec.gov/cgi-bin/browse-edgar` 公司检索 / `efts.sec.gov` 全文检索，定位 13F filer 的 CIK。同名机构多个时，以「有 13F-HR 申报历史」者为准。
2. **校验 13F-HR 存在**：拉 `https://data.sec.gov/submissions/CIK##########.json`，确认 `filings.recent.form` 含 `13F-HR`，且最近一期 `reportDate` 不早于 **2024-06-30**（≤ ~2 年内仍活跃；停更基金剔除）。
3. **赋 person / slug**：principal 英文名 + kebab slug。
4. **通过 → 入候选种子表**；**未通过 → 落 spec 附录「剔除清单」并记原因**（解析不到 CIK / 无 13F-HR / 已停更 / 无法归人名），便于复核。

> 礼貌限速：所有 SEC 请求带 `User-Agent: NYFedMonitor research junlinzhu@jobright.ai` 且 ≥250ms 间隔（沿用 ingest 脚本既有规范）。

## 5. 去重 + 两波次落地

- **去重键 = CIK**（人名 / 基金名易撞，CIK 唯一）。候选与现有 34 条按 CIK 取差集 → 净新增清单。
- **第 1 波（验证波，~10 位）**：先加约 10 位最有名的净新增（如 Oakmark/Nygren、Gardner Russo、Lou Simpson 类）→ 跑全链路 → 确认管线、页面、`generateStaticParams`、sitemap、`npm run build` 全部无碍。
- **第 2 波（全量波）**：第 1 波绿灯后，灌入剩余全部净新增。
- 两波各自一个 commit，便于回滚定位。

## 6. 跑管线（无运行时代码改动）

```bash
cd web && npm run ingest    # = tsx scripts/ingest-13f.ts，需 SUPABASE_URL / SUPABASE_SERVICE_KEY
```

脚本对种子表每位：抓 8 季 13F → 写 `src/data/13f/<slug>.json` → 写 `index.json` + `former-names.json` → Supabase upsert → 证券富化(OpenFIGI，非致命) → 共识重算。

**护栏处理**：脚本有 `MIN_SUCCESS_RATIO = 0.9`（成功管理人占比 < 90% 则 exit 1）。§4 第 2 步预校验保证入表的 CIK 都有可解析 13F-HR，使护栏不被死基金误触发。若某位仍在跑时失败，按其反馈回到剔除清单。

**中文补全程度（本 spec 决策 = 选项 b）**：仅给净新增里**最知名的 ~15 位**补 `people[].zh` + 中文 `aliases`，长尾以英文 `person` 为主——契合 [[seo-english-first]] 英文优先，省冷门基金中文名考据。

## 7. SEO / 构建规模

- ~80 位 × 2 语言 = ~160 投资人静态页（`generateStaticParams` 自动；构建时间增量可接受）。
- 投资人页是**内容厚页**（持仓表 + 8 季趋势 + 确定性正文 prose + QoQ），**非** stock 长尾薄页——对 [[seo-indexing-404-rootcause]] 是净增益，不放大 404。
- 新页自动进 `sitemap.ts`（从 `index.json` 派生，无需手改）。

## 8. 验证（无测试套件）

1. `web/config/managers.json` 计数 ≈ 80；与净新增清单逐 CIK 对账。
2. `npm run ingest` 跑通：日志末尾「Total managers processed」≈ 80，无护栏 exit 1，共识行数非空。
3. 抽查 3-5 个新投资人页 `/en/investors/<slug>` 与 `/zh/investors/<slug>`：名字 / 持仓表 / 趋势 / QoQ / 正文渲染正常。
4. `npx tsc --noEmit` + `npm run build` 全绿（worktree 需先 `npm ci`）。
5. sitemap 计数对账：投资人 URL 数 ≈ 80 × 2。

## 9. 不做（YAGNI / 留后续）

- 自动 Dataroma 同步爬虫（脆、且绕过人名策展把关，伤品牌）。
- AUM 排序 / 分层 / 非价值投资者大基金（赛道分界线，本 spec 明确不收）。
- investor↔macro 互链、板块浏览页、tertiary 互链（另条线，见三腿互链审计）。
- 全员中文补全（按 §6 选项 b 只补知名 ~15 位）。

## 附录 A：净新增候选清单（实施期填充）

| # | 基金法定名 | person | slug | CIK | 最近 13F reportDate | 中文(b) | 状态 |
|---|---|---|---|---|---|---|---|
| _实施 §4 时逐行填充_ | | | | | | | 收/剔 |

## 附录 B：剔除清单（实施期填充）

| 基金 | 原因（无CIK/无13F-HR/已停更/无法归人名） |
|---|---|
| _实施 §4 时逐行填充_ | |

相关：[[product-direction]] [[valuation-philosophy-constraint]] [[seo-english-first]] [[seo-indexing-404-rootcause]] [[data-layer-state]] [[no-tests-solo-dev]] [[prd-roadmap]]
