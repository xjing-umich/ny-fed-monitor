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

## 附录 A：净新增候选清单（已校验）

> 解析来源：SEC EDGAR `data.sec.gov/submissions/CIK##########.json`（官方 name + 13F-HR + reportDate）。校验日期 2026-06-22，校验脚本 `web/scripts/validate-13f-filers.ts`。全部 42 条 PASS（最近 13F-HR reportDate 均为 2026-03-31，≥ 2024-06-30）。Dataroma 仅作「哪些 filer 算价值 guru」的选择参照，未抄任何派生数据。

| # | 官方名（SEC submissions.name） | person | slug | CIK | 最近 13F reportDate | 状态 |
|---|---|---|---|---|---|---|
| 1 | TRIAN FUND MANAGEMENT, L.P. | Nelson Peltz | trian-partners | 0001345471 | 2026-03-31 | 收 |
| 2 | MAVERICK CAPITAL LTD | Lee Ainslie | maverick-capital | 0000934639 | 2026-03-31 | 收 |
| 3 | VIKING GLOBAL INVESTORS LP | Andreas Halvorsen | viking-global | 0001103804 | 2026-03-31 | 收 |
| 4 | ValueAct Holdings, L.P. | Mason Morfit | valueact-capital | 0001418814 | 2026-03-31 | 收 |
| 5 | Punch Card Management L.P. | Norbert Lou | punch-card-management | 0001631664 | 2026-03-31 | 收 |
| 6 | Durable Capital Partners LP | Henry Ellenbogen | durable-capital | 0001798849 | 2026-03-31 | 收 |
| 7 | SOUTHEASTERN ASSET MANAGEMENT INC/TN/ | Mason Hawkins | southeastern-asset | 0000807985 | 2026-03-31 | 收 |
| 8 | LONE PINE CAPITAL LLC | Stephen Mandel | lone-pine-capital | 0001061165 | 2026-03-31 | 收 |
| 9 | ATLANTIC INVESTMENT MANAGEMENT, INC. | Alex Roepers | atlantic-investment | 0001063296 | 2026-03-31 | 收 |
| 10 | WEDGEWOOD PARTNERS INC | David Rolfe | wedgewood-partners | 0000859804 | 2026-03-31 | 收 |
| 11 | TIGER GLOBAL MANAGEMENT LLC | Chase Coleman | tiger-global | 0001167483 | 2026-03-31 | 收 |
| 12 | Engaged Capital LLC | Glenn Welling | engaged-capital | 0001559771 | 2026-03-31 | 收 |
| 13 | CAS Investment Partners, LLC | Clifford Sosin | cas-investment-partners | 0001697591 | 2026-03-31 | 收 |
| 14 | Oakcliff Capital Partners, LP | Bryan Lawrence | oakcliff-capital | 0001657335 | 2026-03-31 | 收 |
| 15 | MILLER VALUE PARTNERS, LLC | Bill Miller | miller-value-partners | 0001135778 | 2026-03-31 | 收 |
| 16 | Makaira Partners LLC | Tom Bancroft | makaira-partners | 0001540866 | 2026-03-31 | 收 |
| 17 | Conifer Management, L.L.C. | Greg Alexander | conifer-management | 0001773994 | 2026-03-31 | 收 |
| 18 | ARIEL INVESTMENTS, LLC | John Rogers | ariel-investments | 0000936753 | 2026-03-31 | 收 |
| 19 | ABRAMS CAPITAL MANAGEMENT, L.P. | David Abrams | abrams-capital | 0001358706 | 2026-03-31 | 收 |
| 20 | ShawSpring Partners LLC | Dennis Hong | shawspring-partners | 0001766908 | 2026-03-31 | 收 |
| 21 | CAUSEWAY CAPITAL MANAGEMENT LLC | Sarah Ketterer | causeway-capital | 0001165797 | 2026-03-31 | 收 |
| 22 | Chou Associates Management Inc. | Francis Chou | chou-associates | 0001389403 | 2026-03-31 | 收 |
| 23 | Patient Capital Management, LLC | Samantha McLemore | patient-capital | 0001854794 | 2026-03-31 | 收 |
| 24 | Egerton Capital (UK) LLP | John Armitage | egerton-capital | 0001581811 | 2026-03-31 | 收 |
| 25 | GARDNER RUSSO & QUINN LLC | Thomas Russo | gardner-russo | 0000860643 | 2026-03-31 | 收 |
| 26 | RV Capital AG | Robert Vinall | rv-capital | 0001766596 | 2026-03-31 | 收 |
| 27 | GREENLEA LANE CAPITAL MANAGEMENT, LLC | Josh Tarasoff | greenlea-lane-capital | 0001766504 | 2026-03-31 | 收 |
| 28 | SOUND SHORE MANAGEMENT INC /CT/ | Harry Burn | sound-shore | 0000820124 | 2026-03-31 | 收 |
| 29 | CANTILLON CAPITAL MANAGEMENT LLC | William von Mueffling | cantillon-capital | 0001279936 | 2026-03-31 | 收 |
| 30 | DAVIS SELECTED ADVISERS | Christopher Davis | davis-advisors | 0001036325 | 2026-03-31 | 收 |
| 31 | PZENA INVESTMENT MANAGEMENT LLC | Richard Pzena | pzena-investment | 0001027796 | 2026-03-31 | 收 |
| 32 | MATRIX ASSET ADVISORS INC/NY | David Katz | matrix-asset-advisors | 0001016287 | 2026-03-31 | 收 |
| 33 | Olstein Capital Management, L.P. | Robert Olstein | olstein-capital | 0000947996 | 2026-03-31 | 收 |
| 34 | Aquamarine Zurich AG | Guy Spier | aquamarine-capital | 0001953324 | 2026-03-31 | 收 |
| 35 | First Pacific Advisors, LP | Steven Romick | first-pacific-advisors | 0001377581 | 2026-03-31 | 收 |
| 36 | Vulcan Value Partners, LLC | C.T. Fitzpatrick | vulcan-value-partners | 0001556785 | 2026-03-31 | 收 |
| 37 | KAHN BROTHERS GROUP INC | Thomas Kahn | kahn-brothers | 0001039565 | 2026-03-31 | 收 |
| 38 | GREENHAVEN ASSOCIATES INC | Edgar Wachenheim | greenhaven-associates | 0000846222 | 2026-03-31 | 收 |
| 39 | Lindsell Train Ltd | Nick Train | lindsell-train | 0001484150 | 2026-03-31 | 收 |
| 40 | AKO CAPITAL LLP | Nicolai Tangen | ako-capital | 0001376879 | 2026-03-31 | 收 |
| 41 | VAN DEN BERG MANAGEMENT I, INC | Arnold Van Den Berg | century-management | 0001142062 | 2026-03-31 | 收 |
| 42 | COOPERMAN LEON G | Leon Cooperman | cooperman-family-office | 0000898382 | 2026-03-31 | 收 |

> 中文补全（§6 选项 b）：长尾以英文 `person` 为主；知名 ~15 位的 `people[].zh` + 中文 `aliases` 由 Task 2/3 灌种子表时补，非本 Task 范畴。

### 解析期辨歧记录（同名机构选「有近期 13F-HR」者）

- **Trian**：取 0001345471 `TRIAN FUND MANAGEMENT, L.P.`（活跃）；弃 0001345472 `Trian Fund Management GP, LLC`（停于 2010）。
- **Maverick**：取 0000934639（活跃）；弃 0000928617 `/ADV`（停于 2002）。
- **Viking**：取 0001103804 `VIKING GLOBAL INVESTORS LP`（活跃）；弃 0001101785 `Viking Global Equities LP`（停于 2002）。
- **ValueAct**：取 0001418814 `ValueAct Holdings, L.P.`（活跃报送实体）；弃 0001351069 / 0001395267（停报）与 0001464912（无 13F）。
- **Abrams Capital**：取 0001358706 `L.P.`（活跃）；弃两个旧 `LLC`（停于 2010 / 2005）。
- **Chou**：取 0001389403 `Chou Associates Management Inc.`（活跃管理人）；弃 0001389402 `Chou Associates Fund`（停于 2011）。
- **Egerton**：取 0001581811 `Egerton Capital (UK) LLP`（活跃）；弃 0001083657 `EGERTON CAPITAL LTD`（停于 2013）。
- **Greenlea Lane**：取 0001766504 `MANAGEMENT, LLC`（活跃）；弃 0001413048 `PARTNERS LP`（停于 2021）。
- **Cantillon**：取 0001279936 `LLC`（活跃）；弃 0001352269 `LLP`（停于 2013）。
- **Pzena**：取 0001027796（活跃）；弃 0001004781 `/ADV`（停于 2001）。
- **First Pacific**：取 0001377581 `First Pacific Advisors, LP`（活跃）；弃两个旧 `INC`（停于 2006 / 2001）。
- **Punch Card**：取 0001631664 `Management L.P.`（活跃，Norbert Lou）；弃 0001419050 `Punch Card Capital, L.P.`（停于 2014）。
- **Aquamarine（Guy Spier）**：取 0001953324 `Aquamarine Zurich AG`（活跃，Spier 现驻苏黎世）；旧 0001404599 `Aquamarine Capital Management, LLC` 停于 2022。
- **Cooperman（Leon Cooperman）**：取个人 filer 0000898382 `COOPERMAN LEON G`（活跃，家族办公室）；旧机构 0000898202 `Omega Advisors Inc.` 停于 2018。
- **Century Management**：SEC 实体名为 0001142062 `VAN DEN BERG MANAGEMENT I, INC`（Arnold Van Den Berg）。

## 附录 B：剔除清单

> Dataroma 全集 82 条；其中 ~32 条按主理人/基金身份已在现有 34 种子表内（见正文 §1 去重清单，不重复列出）。下表为「净新增池里被剔除」者，原因明确。

| 基金（Dataroma 名） | 原因（无CIK/无13F-HR/已停更/无法归人名） |
|---|---|
| Abrams Bison Investments | 无法归人名：Dataroma 未列主理人，与已收的 Abrams Capital/David Abrams 非同一实体，无公认人脸 → 不收（守品牌人名准则） |
| AltaRock Partners | 无法归人名：Dataroma 未列主理人；无公认 principal 人脸，避免臆测 → 不收 |
| Triple Frond Partners | 无法归人名：Dataroma 未列主理人；无公认 principal 人脸 → 不收 |
| Hillman Capital Management | 无法归人名：Dataroma 未列主理人；纯机构 filer 无公认人脸 → 不收 |
| First Eagle Investment Management | 无法归人名：Dataroma 未列主理人；大型机构无单一公认人脸（与 WhaleWisdom 式分界线）→ 不收 |
| Mairs & Power Funds | 无法归人名：Dataroma 未列主理人；机构基金无单一公认人脸 → 不收 |
| Third Avenue Management | 无法归人名：创始人 Marty Whitman 已故，现为机构化基金，无在世公认人脸 → 不收 |
| Jensen Investment Management | 无法归人名：Dataroma 未列主理人；委员会制机构无单一公认人脸 → 不收 |
| Torray Funds | 无法归人名：创始人 Robert Torray 已故，机构化基金，无公认在世人脸 → 不收 |

相关：[[product-direction]] [[valuation-philosophy-constraint]] [[seo-english-first]] [[seo-indexing-404-rootcause]] [[data-layer-state]] [[no-tests-solo-dev]] [[prd-roadmap]]
