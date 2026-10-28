# D-valuation：估值模块文案审核

范围：`src/components/valuation/*`、`src/lib/valuation/*` 中渲染到页面的字符串、`src/app/[lang]/stocks/[ticker]/page.tsx` 与 `src/lib/stocks/stockCopy.ts` 的估值段。
只读审核，未改源码。行号以 2026-10-27 工作区为准。

---

## 1. 区域概况

估值模块的首屏句子（价格位置句、`moatDistorted`、`holdcoNotAssessable`、PriceBetBlock 的"价格在赌什么"）中文已经很像人话，可以当风格锚点。比如 `bandPosition.ts` 的「今天的价格 $79（截至 2026-10-24）落在价值带内，低于中枢约 $343。」：数据先行，两件事拆开说，不对冲。`stockCopy.moatDistorted`（「多年回购已把股东权益压成负数，重置价值和护城河没法从资产端算」）也是好句。问题集中在首屏下面那一层：图例、假设行、低信心提示、折叠的「方法与数字」。越往下，越是工程师写给自己看的东西。

三个主要问题模式：

1. **引擎英文 prose 直接渲染进中文页（X4），英文页也带内部代号（E3）。** `epvFloor.ts / reproductionValue.ts / ownerEarningsDcf.ts / growthValue.ts / maintenanceCapex.ts / strikeZone.ts` 里只有英文的 `label / basis / note / not_assessable_reason / simplifications`，被 `EarningsPowerFloorCard` 原样塞进 zh 页面。典型例子是中文折叠区实际渲染出的这一行：
   > 窗口 TTM 2026-06-30, FY 2024, 2023 · 贴现带 9%–11% · 正常化税率 18% (Average effective tax rate over 5 year(s), capped at the statutory 21%.) · 股数 diluted.

   英文侧同样有 `write A`、`audit #2`、`AI-hog rule`、`v1 simplification`、`AV_conservative`、`engine owner-earnings lamp` 这类内部代号。
2. **同一个估值概念有三四种叫法（X1）。** 页面一屏之内同时出现：区块标题「价值带内」，刻度盘分段「合理价值」，图例「中枢 IV」，头条「含增长中枢内在价值」，正文「中枢约 $343」。Greenwald 的三层（资产价值 / 盈利能力价值 / 增长价值）在 UI 上从没以标准名出现，而是被叫成「零增长底 / 零增长下行 / 零增长基准 / 一项保守的盈利能力估计 / 地板 / 资产底 / 资产基础」。英文侧也一样：central read / Central IV / growth-anchored intrinsic value / value band / band / range。
3. **工程口径词外露（Z2/E3）。** 例如「口径」「降级近似」「分档假设」「运行率」「被闸至零」「盈利增长旁路」「单法口径」「低估计数」，英文侧有 degraded approximation / staging / gated / lamp / matched-growth benchmark。最典型的是低信心提示 `lowConfidenceFallback`：「今年输入偏脆，不把便宜当成确认信号。」它是首屏的橙色警示，普通读者读不懂"输入偏脆"指什么。

另有一处**语义问题**要单独提：刻度盘把"现价 < 含增长内在价值"这一段整段标成「安全边际 / margin of safety」。现价只比 IV 低 1% 也会落在这个分段里，这和格雷厄姆/巴菲特所说"有足够折扣"的安全边际不是一回事。而且它和区块标题「低于内在价值」并排出现，说法互相打架（见 F2）。

---

## 2. 术语清单（核心概念）

"一致？"列：✗ 表示同一侧有多种叫法，或中英两侧不对等。

| 概念 | 当前中文 | 当前英文 | 一致？ | 建议中文 | 建议英文 |
|---|---|---|---|---|---|
| Intrinsic value | 内在价值 | intrinsic value | ✓ | 内在价值 | intrinsic value |
| 含增长的中枢 IV（头条数） | 含增长中枢内在价值 / 中枢 IV / 中枢约 $X | growth-anchored intrinsic value / Central IV / central read | ✗ | 内在价值（含增长）；句中可用"估值中枢" | intrinsic value (with growth)；句中 central estimate |
| Margin of safety | 安全边际（keyFact 正确；刻度盘分段被误用为"低于 IV"） | margin of safety（同样误用） | ✗ 语义 | 安全边际只用于"折扣幅度"这个数；分段改叫「低于内在价值」 | 同理：分段改 Below intrinsic value |
| EPV（Greenwald 零增长盈利能力价值） | 零增长底 / 零增长内在价值 / 零增长价值 / 零增长基准 / 零增长下行 / 一项保守的盈利能力估计 | Zero-growth floor / zero-growth intrinsic value / zero-growth base / downside / earnings-power estimate / "Graham earnings-power value" | ✗ | 盈利能力价值（零增长）；图例短名「零增长价值」 | earnings power value (no growth)；图例 No-growth value |
| Reproduction value / asset value | 重置价值 / 重置 / 可重置的有形资产基础 / 资产地板 / 资产底 / 资产基础 | reproduction value / asset floor / asset base | ✗ | 资产价值（按重置成本计）；短名「重置价值」 | asset value (reproduction cost)；短名 reproduction value |
| Growth value | 增长价值 | growth value | ✓ | 增长价值 | growth value |
| Owner earnings | 所有者盈利；PriceBetBlock 中文直接写 owner-earnings | owner earnings / owner-earnings | ✗（中文页混入英文） | **所有者盈余**（巴菲特股东信中译通行译法）。若不全站换，至少统一为「所有者盈利」，并去掉中文页里的英文 | owner earnings（名词不加连字符，作定语时 owner-earnings DCF） |
| Value band | 价值带 / 这个区间 / 价值估计 | value band / band / range / value estimate | ✗ | 价值区间（或保留"价值带"，首次出现解释一次） | value range（英文读者没有 "value band" 的说法） |
| Optimistic top | 乐观上沿 | Optimistic top | ✓ 但生硬 | 乐观情形 | Optimistic case |
| 档位：strike | 击球区 | Strike zone | ✓ | 击球区（可选「好球区」，巴菲特中译更常见；全站 45 处，改动成本高，非必须） | Strike zone |
| 档位：below | 低于内在价值；刻度盘写「安全边际」 | Below intrinsic value；gauge 写 margin of safety | ✗ | 低于内在价值 | Below intrinsic value |
| 档位：within | 价值带内 / 合理价值 / 处于合理价值区间 | Within band / fair value / In fair-value range | ✗ | 合理区间 | Fair-value range |
| 档位：above | 高于价值带 / 高于合理价值 | Above band / above fair value | ✗ | 高于价值区间 | Above value range |
| Pending | 待确认 | pending | ✓ 英文词不准 | 待确认 | unconfirmed |
| Single lamp | 单法口径 | Single-method basis | ✓ 但是工程词 | 仅一种估值方法 | One method only |
| Franchise | 特许经营（护城河） | Franchise (moat) | ✓ | 有护城河（特许经营权） | Franchise (moat) |
| Commodity | 商品化 | Commodity-like | ✓ 中文偏怪 | 无护城河（同质化竞争） | No moat (commodity-like) |
| Value destruction | 低于资产基础 | Below asset base | ✗ 没说出"价值毁灭" | 价值毁灭（盈利撑不起资产） | Value-destroying (earns below asset value) |
| Wide / narrow moat | 宽护城河 / **一般**护城河 | wide / narrow moat | ✗ | 宽护城河 / 窄护城河（晨星中文惯用） | wide / narrow moat |
| Competitive advantage period | 竞争优势期；假设行写「护城河 N 年」 | competitive-advantage period；假设行写 moat N yr | ✗ | 竞争优势期 / 优势期 N 年 | competitive advantage period / N-yr advantage period |
| Discount rate | 折现 / 折现率 / 贴现率 / 贴现带 | discount / discount band | ✗ | 折现率 | discount rate |
| Terminal value | 终值 | terminal value | ✓ | 终值 | terminal value |
| NCAV / net-net | 净流动资产；「格雷厄姆经典**买入线**」 | net current asset value；"classic net-net threshold" | ✗（中文多出买入含义） | 每股净流动资产（NCAV）；"格雷厄姆的经典净-净门槛" | net current asset value (NCAV); net-net |
| Maintenance capex | 维持性 CapEx / 维持性投入 | maintenance capex | ✗ | 维持性资本开支 | maintenance capex |
| Leverage premium | 风险溢价 / 降级近似 | cost-of-equity premium / degraded approximation | ✗ | 杠杆风险溢价 / 粗略近似 | leverage premium / rough approximation |
| Implied expectations | 预期 · 温和 / 隐含温和；预期 · **公允** | Expectations · modest / implies modest | ✗ | 隐含增速：温和 / 合理 / 苛刻 | Priced-in growth: modest / in line / demanding |
| TTM | 滚动十二个月 / 窗口 TTM | trailing twelve months / Window TTM | ✓ | 最近十二个月（TTM） | trailing twelve months (TTM) |
| 10Y Treasury | 10 年期美债 / 10Y / DGS10 | 10-year Treasury / 10Y / DGS10 | ✗（序列代码外露） | 10 年期美债收益率 | 10-year Treasury yield |
| ROIIC | ROIIC（未解释） | ROIIC | – | 新增投入资本回报率（ROIIC），首次出现时解释 | return on incremental invested capital (ROIIC) |
| SOTP | 分部估值 | Sum of the parts | ✓ | 分部估值 | Sum of the parts |
| 档位（SOTP 表头） | 悲观 / 基础 / 乐观 | Low / Base / High | ✗ | 悲观 / 基准 / 乐观 | Bear / Base / Bull |

---

## 3. 逐条发现

路径缩写：`EPFC` = `src/components/valuation/EarningsPowerFloorCard.tsx`，`PBB` = `src/components/valuation/PriceBetBlock.tsx`，`VB` = `src/components/valuation/ValuationBadge.tsx`，`VL` = `src/lib/valuation/valuationLabel.ts`，`BP` = `src/lib/valuation/bandPosition.ts`，`SC` = `src/lib/stocks/stockCopy.ts`，`PAGE` = `src/app/[lang]/stocks/[ticker]/page.tsx`。

### 3.1 首屏：标题、刻度盘、头条数

| 位置 | 严重度 | 标签 | 现状 | 问题 | 建议改写 |
|---|---|---|---|---|---|
| F1 VL:30,36 + EPFC:78-80,124-127 | P0 | X1 | 区块标题（VL）用「价值带内 / 高于价值带」；正下方刻度盘分段用「安全边际 / 合理价值 / 高于合理价值」。en 同理：Within band / Above band，下面却是 margin of safety / fair value / above fair value | 同一个档位在同一屏里有两套名字，读者会以为是两个结论 | 刻度盘分段改用 VL 的档名，全站只留一套。zh：`低于内在价值` / `合理区间` / `高于价值区间`；en：`Below intrinsic value` / `Fair-value range` / `Above value range`。VL 的 within/above 同步改为「合理区间 / 高于价值区间」「Fair-value range / Above value range」 |
| F2 EPFC:79,125 | P0 | X2 | 刻度盘 below 段：`安全边际` / `margin of safety` | 这一段是"现价 < 含增长 IV"。现价只低 1% 也落在这里，把它叫安全边际是概念误用；真正的安全边际（≥1/3 折扣）是击球区 | zh `低于内在价值`；en `Below intrinsic value`。"安全边际"只留给 keyFact 里那个折扣百分比 |
| F3 EPFC:159,108 | P0 | Z1/E3 | 头条数字说明：`$180 / 股 · 含增长中枢内在价值`；en `$180 / sh · growth-anchored intrinsic value` | 中文名词堆叠（含增长＋中枢＋内在价值）；"growth-anchored"不是英文金融读者的说法 | zh `每股内在价值（含增长假设）`；en `intrinsic value per share (with growth)` |
| F4 EPFC:160,109 | P1 | X1 | 无 IV 时头条：`零增长内在价值` / `zero-growth intrinsic value` | 这其实是 Greenwald 的 EPV，读过《价值投资：从格雷厄姆到巴菲特》的人认得"盈利能力价值" | zh `每股盈利能力价值（零增长）`；en `earnings power value per share (no growth)` |
| F5 EPFC:138-140,92-94 | P1 | X4/Z1 | 图例：`零增长底 / 中枢 IV / 乐观上沿`；en `Zero-growth floor / Central IV / Optimistic top` | 中文图例夹着英文缩写 IV；"上沿"是 K 线词，这里不贴切 | zh `零增长价值 / 内在价值 / 乐观情形`；en `No-growth value / Intrinsic value / Optimistic case` |
| F6 EPFC:137,91 | P1 | Z1/E5 | `中间是主读数；右侧上沿是同一套保守假设下的乐观档，不是绝对上限。` / `The middle figure is the main read. The right end is the optimistic case under the same conservative caps — not an absolute ceiling.` | "主读数""乐观档"是工程味；英文 "main read" 不自然 | zh `中间是我们的主要估计；右边是同一套保守假设下的乐观情形，不是价格天花板。`；en `The middle number is our central estimate. The right end is the optimistic case under the same conservative caps, not a ceiling.` |
| F7 EPFC:571 / 576（两法分支渲染） | P1 | Z1/E3 | 渲染：`苹果（AAPL）：两种方法为该业务估值 — 一为保守的所有者盈利 DCF，一为计入增长的 Greenwald 估计，$95–$260 / 股。` / `Two methods value the business — a conservative owner-earnings DCF and a growth-credited Greenwald estimate, $95–$260 / sh.` | "两种方法为该业务估值——一为…一为…"是英文句式直译；"growth-credited"是自造词 | zh `苹果（AAPL）：我们用两种方法估值，一是保守的所有者盈余 DCF，二是计入增长的格林沃尔德估值，合起来每股 $95–$260。`；en `Apple (AAPL): we value it two ways, a conservative owner-earnings DCF and a Greenwald estimate that credits growth. Together they put it at $95–$260 a share.` |
| F8 EPFC:573 / 578 | P1 | Z1/X1 | `保守价值带 $95–$260 / 股（零增长底到增速封顶的乐观上沿）。` / `A conservative value band $95–$260 / sh (zero-growth floor to growth-capped optimistic top).` | 括号里塞了三个内部词（零增长底 / 增速封顶 / 乐观上沿）；英文 "value band" 不是惯用说法 | zh `保守估算的价值区间是每股 $95–$260：低端假设零增长，高端是增速封顶后的乐观情形。`；en `Our conservative value range is $95–$260 a share, from no growth at the low end to a capped-growth optimistic case at the top.` |
| F9 EPFC:574 / 579（单法、无 IV 分支） | P1 | Z1 | `一项保守的盈利能力估计，$95–$120 / 股；今日价格低于它（价格 $80 截至 2026-10-24）。` | "一项…估计"是翻译腔；"低于它"指代生硬；括号里又重复了一遍价格 | zh `按保守的盈利能力估算，每股值 $95–$120；现价 $80（2026-10-24）低于这个区间。`；en `On a conservative earnings-power basis it is worth $95–$120 a share; the $80 price (Oct 24, 2026) sits below that.` |
| F10 BP:44,47 | P2 | E3 | `…sits inside the band, below the central read of about $343.` | "central read" 不是金融英语（中文版是好句，保留） | `Today’s price ($79, as of 2026-10-24) is inside the value range but below our central estimate of about $343.` |
| F11 EPFC:130,84（刻度盘字幕） | P2 | Z1 | `$95–$120 价值估计` / `$95–$120 value estimate` | 金额放在名词前，不通顺 | zh `估值区间 $95–$120`；en `Value range: $95–$120` |
| F12 EPFC:116-127（status/sub） | P2 | — | statusBelow/subBelow 等 | 唯一调用方传了 `showStatus={false}`，目前是死文案。若日后启用，"Price sits below both methods’ value estimate" 的所有格写法也要改 | 建议删除，或随 F1 一起改名 |

### 3.2 首屏：假设行、低信心提示、价格来源行

| 位置 | 严重度 | 标签 | 现状 | 问题 | 建议改写 |
|---|---|---|---|---|---|
| F13 EPFC:136,90 | P0 | Z2/Z4 | 橙色首屏警示：`今年输入偏脆，不把便宜当成确认信号。` / `Inputs look fragile this year — we won't mark this as confirmed cheap.` | "输入偏脆"不是中文；读者不知道是哪里不可靠 | zh `今年的财报数字波动异常，就算价格看着便宜，我们也不算它"确认低估"。`；en `This year's numbers are unusually noisy, so even if the price looks cheap, we don't count it as confirmed.` |
| F14 EPFC:132,86 | P1 | Z2 | `资本开支两年翻倍，维持性投入难分清，价值带按保守口径读。` | "口径"；"按保守口径读"是指令式工程语 | zh `资本开支两年内翻了一倍，分不清多少是维持、多少是扩张，价值区间请往低处看。`；en `Capex doubled in two years, so it's hard to tell maintenance from expansion. Lean toward the low end of the range.` |
| F15 EPFC:133,87 | P1 | Z1 | `最新盈利低于多年均值，价值带按更低的运行率计。` / `…uses the lower run-rate.` | "运行率"是 run-rate 直译 | zh `最近一年的盈利低于多年平均，价值区间按最近一年的水平算，没有用均值。`；en `Latest earnings are below the multi-year average, so the range uses the latest year, not the average.` |
| F16 EPFC:134,88 | P1 | Z2/E3 | `DCF 对分档假设敏感 — 当作区间读，不要当成一个点。` / `The DCF is sensitive to its staging assumptions…` | "分档假设"/"staging"是内部建模词 | zh `DCF 结果对高增长期设几年非常敏感，请把它当一个区间看，别当成精确值。`；en `The DCF swings a lot with how long the high-growth stage lasts. Read it as a range, not a point.` |
| F17 EPFC:135,89 | P1 | Z2/E3 | `金融股高杠杆：这里的股权价值是降级近似。` / `…a degraded approximation.` | "降级近似 / degraded approximation"是工程降级逻辑的说法 | zh `金融股杠杆高，这里的股权价值只是粗略近似。`；en `This is a highly leveraged financial, so treat the equity value as a rough approximation.` |
| F18 EPFC:189-210（渲染） | P1 | Z1/X1/E4 | zh：`营收增 8%（历史增长与基本面上限的较小值，受护城河封顶） · 护城河 10 年 · 折现 10.0% · 零增长下行 $95`；en：`Revenue growth 8% (lower of historical trend and fundamental cap, capped by moat) · moat 10 yr · discount 10.0% · Zero-growth downside $95` | 中文"营收增"缺字，"封顶"重复；"护城河 10 年"其实是竞争优势期；"零增长下行"不通；英文中段 "Zero-growth" 突然大写 | zh `增长假设：每年 8%（取历史营收增速与可持续增速中较低者）· 优势期 10 年 · 折现率 10.0% · 若零增长：$95`；en `Growth: 8% a year (lower of historical revenue trend and sustainable rate) · 10-yr advantage period · 10.0% discount rate · no-growth value $95` |
| F19 EPFC:195-196 | P2 | Z1 | `营收增 0%（历史下滑，封顶为零）` | 同上 | zh `增长假设：0%（营收历史在下滑，按零增长算）`；en `Growth: 0% (revenue has been shrinking, so we assume none)` |
| F20 EPFC:630-635（渲染） | P1 | Z2/Z5/E3 | `价格截至 2026-10-24 · yahoo · DGS10 4.1% @ 2026-10-23.` | 来源用原始小写 key "yahoo"，没有走 `priceSourceName`；FRED 序列代码 DGS10 外露；"@" 当介词用；中文句尾是半角句点 | zh `价格：2026-10-24 收盘 · Yahoo Finance · 10 年期美债收益率 4.1%（2026-10-23）`；en `Price: Oct 24, 2026 close · Yahoo Finance · 10-year Treasury yield 4.1% (Oct 23)` |

### 3.3 PriceBetBlock / 隐含预期徽章

| 位置 | 严重度 | 标签 | 现状 | 问题 | 建议改写 |
|---|---|---|---|---|---|
| F21 PBB:53-55（en 渲染，越界时） | P1 | X3 | `Today's price pencils in about over 25.0% (outside the usual range) a year in owner-earnings for the next few years.` | 拼接 bug："about over"；"a year in owner-earnings"语法不通 | 模板改成 `At today's price, the market is assuming owner earnings grow {X} a year for the next several years. Revenue has grown {Y} a year.`，其中 X = `about 12.0%` 或 `more than 25%`（越界时去掉 about） |
| F22 PBB:35-37（zh 渲染） | P1 | X4/Z1 | `现价把公司未来几年的 owner-earnings 年增定在 高于 25.0%（已超出常规区间）；公司过去营收年增 6.0%。` | 中文页出现英文 owner-earnings；"年增"缺字；"定在 高于"之间多一个空格 | `按现价倒推，市场预期公司未来几年所有者盈余每年增长 {X}；它过去的营收年均增长 {Y}。`，X = `约 12%` 或 `超过 25%` |
| F23 PBB:49 | P2 | E1 | `What the price is betting` | betting 缺宾语（中文「价格在赌什么」很好，保留） | `What the price is betting on` |
| F24 PBB:46,64 | P1 | Z1/E1 | `价值带信心不足时仍可对照：这里只说明市场在赌多快，不把它当成「确认便宜」。` / `Even when the value band is low-confidence: use this to see what the price assumes — not as a cheapness confirmation.` | 英文前半句是没有主句的碎片；"cheapness confirmation"生造 | zh `这只股票的价值区间可信度不高。这一段只说明市场押注的增速，不代表已经确认便宜。`；en `The value range is low-confidence here. Read this only as what the price assumes, not as confirmation the stock is cheap.` |
| F25 PBB:16-17 + VB:15-16 | P1 | X1/Z4/E1 | 个股 masthead：`预期 · 温和/公允/苛刻`；列表徽章：`隐含温和/隐含公允/隐含苛刻`；en `Expectations · fair` / `implies fair` | 同一指标两套说法；"预期公允""隐含温和"不成话；"implies modest"缺宾语 | 两处统一：zh `隐含增速 · 温和 / 合理 / 苛刻`；en `Priced-in growth · modest / in line / demanding` |
| F26 PBB:61-62 | P2 | E5 | `Roughly, the price needs its historical revenue growth to run about 7 more years to hold up.` | 语序绕 | `Roughly, revenue would need to keep growing at its historical pace for about 7 more years to justify today's price.`（zh 原句「才刚好撑得起」很好，保留） |

### 3.4 档位标签与红旗说明（valuationLabel，全站共用）

| 位置 | 严重度 | 标签 | 现状 | 问题 | 建议改写 |
|---|---|---|---|---|---|
| F27 VL:31 | P1 | Z2/Z4 | tooltip：`估值带红旗（盈利下滑 / 高杠杆 / 模型不稳 / 每股口径疑错），安全边际不可信，未计入击球区与低估计数。` | "估值带红旗"容易读成"价值带的红旗"；"每股口径疑错""低估计数"是内部词 | `这只股票的估值有警示（盈利下滑、杠杆高、模型不稳，或每股数据存疑），算出的安全边际不可靠，所以不计入击球区和低估名单。` |
| F28 VL:37 | P1 | E1/E3 | `Valuation flagged (declining earnings / high leverage / model instability / per-share doubt); the margin isn't trustworthy and isn't counted as cheap.` | "per-share doubt"生造；斜杠列举不像英文写法 | `Flagged for falling earnings, high leverage, an unstable model, or questionable per-share data. The margin of safety isn't reliable, so we don't count this stock as cheap.` |
| F29 VL:22 | P1 | E3 | `PENDING_WORD.en = "pending"` → 徽章 `Below intrinsic value · pending` | 英文 pending 让人以为在等某件事完成，这里的意思是"未确认" | `unconfirmed`（zh「待确认」保留） |
| F30 VL:33,39 | P2 | Z2 | `单法口径（无所有者盈利 DCF）` / `Single-method basis (no owner-earnings DCF)` | "口径" | zh `只用了一种估值方法（缺所有者盈余 DCF）`；en `One method only (no owner-earnings DCF)` |
| F31 VL:30,36 | P2 | — | `击球区` / `Strike zone` | 可用。巴菲特语境的中译更常见「好球区」，属可选优化，全站 45 处 | 可选：`好球区`；不改也行 |

### 3.5 折叠区「方法与数字」（引擎 prose 外露）

| 位置 | 严重度 | 标签 | 现状 | 问题 | 建议改写 |
|---|---|---|---|---|---|
| F32 EPFC:278-293 ← epvFloor.ts:457-460,475,503-506,565-570,588 | P1 | X4/E3 | zh 页渲染 `Graham earnings-power value (normalized NOPAT)`、`Normalized NOPAT = … (write A).`、`Enterprise → equity bridge applied: + cash − total debt.` 等整段英文 | 中文页出现整段英文；英文侧有 "write A" 等代号；EPV 在价值投资圈归在 Greenwald 名下，标成 "Graham" 会让 VIC 读者疑惑 | 引擎改为输出结构化字段（method code + 数字），文案放到组件 COPY 里按 locale 拼，和 `leveragePremiumDisclosure`、`capDisclosure` 的做法一致。灯名：zh `格林沃尔德盈利能力价值（EPV）` / `巴菲特所有者盈余价值`；en `Greenwald earnings power value (EPV)` / `Buffett owner-earnings value` |
| F33 EPFC:291 ← epvFloor.ts:446-454,546-562; maintenanceCapex.ts:84-108 | P1 | Z2/E3/X4 | `v1 简化：Maintenance capex unavailable → degraded to the v1 simplification … (audit #2) … AI-hog rule …` | "v1""audit #2""AI-hog""scheme C"都是开发代号，中英两侧都不该出现 | 标签 zh `简化处理：` / en `Simplifications:`；每条改成读者语言，例如 zh `缺少维持性资本开支数据，按折旧摊销代替。` / en `No maintenance-capex data, so D&A stands in for it.`；AI-hog 统一写成 zh `资本开支两年翻倍` / en `capex doubled in two years` |
| F34 EPFC:743-750（渲染） | P1 | X4/Z5/X3 | zh：`窗口 TTM 2026-06-30, FY 2024, 2023 · 贴现带 9%–11% · 正常化税率 18% (Average effective tax rate over 5 year(s), capped at the statutory 21%.) · 股数 diluted.` | 中文页混英文；"year(s)" 是偷懒的复数写法；"股数 diluted"；"贴现带"与他处"折现"不统一；句尾半角句点 | zh `数据年份：最近十二个月（截至 2026-06-30）、FY2024、FY2023 · 折现率 9%–11% · 常态税率 18%（近 5 年平均实际税率，上限 21%）· 摊薄股数`；en `Years: TTM to 2026-06-30, FY2024, FY2023 · discount rate 9%–11% · normalized tax rate 18% (5-year average effective rate, capped at 21%) · diluted shares` |
| F35 EPFC:723-725（渲染） | P1 | Z1/X4/Z5 | zh：`护城河 特许经营（护城河） · 终值占现值 78%（>70% — 依赖遥远未来） · 所有者盈利收益率 4% 对 10Y 4.1%.`；en：`Moat Franchise (moat) · terminal value 78% of present value …` | 标签和值都含"护城河"；缺冒号；"对 10Y"；句尾半角句点 | zh `护城河：有（特许经营权）· 终值占现值 78%（超过七成，估值主要靠远期）· 所有者盈余收益率 4%，10 年期美债 4.1%。`；en `Moat: franchise · terminal value is 78% of present value (over 70%, so the estimate leans on the distant future) · owner-earnings yield 4% vs. 4.1% on the 10-year Treasury.` |
| F36 EPFC:51-60 | P1 | X2/Z4 | `MOAT_SHORT`：`商品化 / 低于资产基础`；en `Commodity-like / Below asset base` | "低于资产基础"没说出 Greenwald 的"价值毁灭"含义；"商品化"在中文里一般指商品流通 | zh `无护城河（同质化竞争）` / `价值毁灭（盈利撑不起资产）`；en `No moat (commodity-like)` / `Value-destroying (earns below asset value)` |
| F37 EPFC:740 ← epvFloor.ts:613-617,349 | P1 | X4/E3 | `护城河读数：Franchise test compares earnings power (EPV) against reproduction value on both AV_conservative … and AV_reproduction (conservative + acquired-reset proxy)…` | 中文页英文；`AV_conservative` 是变量名 | zh `护城河怎么判断：比较盈利能力价值（EPV）和资产重置价值。EPV 明显高于重置价值，说明有护城河；接近，属同质化竞争；更低，是价值毁灭。这是方向性判断，不是结论。`；en `How we read the moat: compare earnings power value with what it would cost to reproduce the assets. Well above means a moat, near it means a commodity business, below it means value destruction. Directional, not a verdict.` |
| F38 EPFC:729-738 ← reproductionValue.ts:50-93 | P1 | X4/Z5 | `重置价值 = 有形净资产 $12.30B + 资本化研发 $4.50B（FY 2021, 2022, 2023） = $25.10 / 股. Reproduction value = tangible net assets (equity − goodwill − intangibles) + capitalized R&D (5y straight-line), ÷ diluted shares.` | 中文算式后面紧接一整句英文，而且是同一公式说了两遍；中间是半角句点 | zh 只留算式：`重置价值 = 有形净资产 $12.30B + 资本化研发 $4.50B（研发按 5 年直线摊销，FY2021–2023）= 每股 $25.10。`；`asset_floor.basis` 不渲染，或本地化后再渲染 |
| F39 EPFC:302-304 ← growthValue.ts:105-163 | P1 | X4 | `增长价值无法评估 — Insufficient operating-income history (fewer than 3 years in window), so ROIIC / growth value cannot be computed.` | 一句话前半中文、后半英文 | zh `增长价值无法评估：营业利润数据不足 3 年。`；en `Growth value not assessable: fewer than 3 years of operating income.` |
| F40 EPFC:309-319 | P1 | Z2/E3 | `增长价值被闸至零 — 资本开支两年翻倍（AI-hog）…`；`护城河来自盈利增长旁路…`；`无护城河或 ROIIC ≤ WACC` | "被闸至零""旁路""AI-hog"是内部词；ROIIC/WACC 未解释 | zh ①`增长价值记为零：资本开支两年翻倍，增长只在所有者盈余 DCF 里算一次，避免重复计入。` ②`增长价值记为零：护城河来自已经兑现的利润增长，这部分增长已计入所有者盈余 DCF。` ③`增长价值记为零：没有护城河，或新增投资的回报率不高于资本成本，增长并不创造价值。`；en 对应 `Growth value set to zero: …`，把 gated / bypass / AI-hog 换成普通说法 |
| F41 EPFC:324-325 | P2 | Z1/Z5 | `增长价值：若护城河在 10 年 内维持于 ROIIC ≈ 25%，则 $12.00–$30.00 / 股（中性 $20.00）。保守估计，非预测。` | "10 年 内"多一个空格；"维持于 ROIIC"不通 | zh `增长价值：如果护城河还能守 10 年、新增投入的回报率保持在约 25%，每股约值 $12–$30（中性 $20）。这是保守测算，不是预测。`；en `Growth value: $12–$30 a share (base $20), if the moat holds for 10 years and new investment keeps earning about 25%. A conservative sketch, not a forecast.` |
| F42 EPFC:335-340 | P1 | X2 | `假设一般护城河 · 竞争优势期约 10 年。` vs en `Assumes a narrow moat` | 中文"一般"和英文 narrow 不对等，中文读者熟悉的是晨星的"窄护城河" | zh `假设窄护城河，竞争优势期约 10 年。`；宽档 `假设宽护城河，竞争优势期约 20 年（盈利没有衰退，ROIC 长期稳定）。` |
| F43 EPFC:754-759 ← ownerEarningsDcf.ts:35,161,185-186 | P1 | X4/E3 | zh：`所有者盈利 DCF：增长 g₁ 8% · OE FY 2025, 2024 · Discount band: 9.10%–12.00% (DGS10 +4.5% to a 12% strict end, as of 2026-10-23). No enterprise→equity bridge: … matching the engine owner-earnings lamp. 两法中值差 15%。` | 中英夹杂；"g₁""OE""strict end""engine lamp"都是内部记号 | zh `所有者盈余 DCF：增长 8%/年（FY2024–2025 数据）· 折现率 9.1%–12.0%（10 年期美债 +4.5 个百分点，上限 12%，2026-10-23）· 所有者盈余已是付息后的股东现金流，不再加现金、减债务 · 两种方法的中值相差 15%。`；en `Owner-earnings DCF: 8% growth (FY2024–25) · 9.1%–12.0% discount rate (10-year Treasury +4.5 pts, capped at 12%, as of Oct 23, 2026) · owner earnings are already after interest, so no cash is added and no debt subtracted · the two methods' midpoints are 15% apart.` |
| F44 EPFC:250-251 | P1 | Z5/Z1 | `基线 9%–11%，净债务约 2.3 年所有者盈利 → 加 1.5 个百分点风险溢价 → 实际 10.5%–12.5%。` | 用箭头当标点；没说明这是在调整什么数 | zh `折现率：基准 9%–11%；净债务约等于 2.3 年的所有者盈余，因此加 1.5 个百分点的杠杆溢价，实际用 10.5%–12.5%。`；en `Discount rate: 9%–11% base. Net debt is about 2.3 years of owner earnings, so we add a 1.5-point leverage premium, for 10.5%–12.5%.` |
| F45 EPFC:224-228 / 219 | P2 | Z1/E3 | `DCF 结果与同增长基准显著背离（超过 50%）— 模型对分档假设敏感。` / `…matched-growth benchmark…staging.`；`两种方法的中值差异显著 — 增长假设值得复核（超过 20%）。` | "同增长基准""分档"是内部词；括号里的阈值放错了位置 | zh `DCF 结果和按同一增速做的简单估算相差 50% 以上，说明结果很依赖高增长期设几年。`；`两种方法的中值相差 20% 以上，增长假设值得再看一遍。`；en `The DCF lands more than 50% away from a simple same-growth cross-check, so it hinges on how long the high-growth stage runs.`；`The two methods' midpoints are more than 20% apart. Worth a second look at the growth assumptions.` |
| F46 EPFC:228 vs 131/207 | P2 | X1 | `增长率几乎等于贴现率`（他处用"折现"） | 同一页面里"贴现""折现"混用 | 统一为「折现率」：`增长率几乎等于折现率，估值对假设极其敏感。` |
| F47 EPFC:141,95 | P2 | Z3/E2 | `现价已等于或低于可重置的有形资产基础（$45 / 股）— 一道更罕见、更硬的地板。` / `…— a rarer, harder floor.` | 修辞装饰（"更硬的地板"） | zh `现价已不高于有形资产的重置价值（每股 $45）。这种情况少见：光资产就能托住价格。`；en `Price is at or below the reproduction value of tangible assets ($45/sh). That's rare: the assets alone backstop the price.` |
| F48 EPFC:156-157 | P1 | X2 | `⚑ 现价已跌至每股净流动资产的三分之二以下（$5.20）— 格雷厄姆经典买入线，安全边际充分。` | "买入线"是买入信号措辞，和本卡免责声明「非买卖信号」相冲突；英文版用的是 threshold，没有这层意思 | `⚑ 现价已不到每股净流动资产（$5.20）的三分之二，达到格雷厄姆经典的"净-净"门槛。这种情况历史上极少见，往往伴随经营困境，要警惕价值陷阱。` |
| F49 EPFC:158,114 | P2 | Z1/E1 | `所示年度的回购大体只抵消了股权激励（SBC）造成的稀释 — 应视为维持股本、而非净额回馈股东。` / `Buybacks over the years shown roughly only offset…` | "所示年度""净额回馈"是翻译腔；"roughly only"别扭 | zh `这几年的回购基本只抵掉了股权激励带来的稀释，作用是让股本不膨胀，不算真正把钱还给股东。`；en `Over these years, buybacks did little more than offset stock-comp dilution. They kept the share count flat rather than returning capital.` |
| F50 EPFC:143,97 | P2 | Z1 | `保守内在价值带（零增长底到增速封顶的 DCF）加一道有形资产地板 — 非投资建议…` | 术语堆叠（价值带 / 零增长底 / 地板） | zh `保守的内在价值区间（从零增长价值到增速封顶的 DCF），另附有形资产价值作参考下限。不是投资建议、买卖信号或目标价。`；en `A conservative intrinsic-value range (no-growth value to a growth-capped DCF), plus tangible asset value as a reference floor. Not investment advice, a buy/sell signal, or a price target.` |
| F51 EPFC:152,106 | P2 | E4 | `方法与数字` / `Method & numbers` | 折叠标题太抽象 | zh `怎么算的`；en `How we got these numbers` |
| F52 EPFC:155,157 vs 141,158 等 | P2 | Z5 | 中文破折号同时有 `——` 和 ` — `（半角空格 + em dash） | 中文规范是不加空格的「——」，最好整体少用破折号 | 中文统一用「——」或改成逗号、句号；英文 net-net 的直引号 `"net-net"` 改成弯引号 |

### 3.6 降级与不可评估说明（首屏代替整张卡）

| 位置 | 严重度 | 标签 | 现状 | 问题 | 建议改写 |
|---|---|---|---|---|---|
| F53 EPFC:799 ← epvFloor.ts:36-37 | P1（多股权类大票会命中，曝光高） | X4/E5 | zh 页估值区块首屏只显示：`This issuer has a multi-share-class structure; a blended per-share count is not available from the current data source, so a per-share floor is not computed here.` | 中文页整段英文，而且是该区块唯一的一句话 | zh `这家公司有多类股票，我们的数据源拿不到合并后的每股股数，所以暂不给每股估值。`；en `This company has multiple share classes and our data source doesn't give a combined share count, so we don't compute a per-share value.` |
| F54 EPFC:646 ← strikeZone.ts:63 | P1 | X4 | `Latest price is in CNY; the per-share floors are USD, so a margin-of-safety comparison would be meaningless.` | 中文页出现英文 | zh `最新股价以人民币计，估值以美元计，两者没法直接比，所以不显示安全边际。`；en `The latest price is in CNY but the valuation is in USD, so we can't compare them.`（币种名本地化） |
| F55 EPFC:98,144 | P2 | Z1 | `缺少可用市场价格，因此不把现价放进价值带位置条。` | "价值带位置条"是组件名 | zh `暂时没有可用的股价，所以无法标出现价落在哪个区间。`；en `No usable price yet, so we can't place it on the value range.` |
| F56 SC:89 | P1 | Z2 | `该公司近期拆股，每股估值口径待下一份财报对齐后恢复。` | "口径""对齐" | `公司最近拆过股，财报里的股数还没更新。每股估值等下一份财报出来后恢复。`（en 原句好，保留） |
| F57 SC:107 | P1 | Z2 | `这家公司的财报数据存在口径问题（如营业利润高于营收）…` | "口径问题"其实就是数据错误 | `这家公司的财报数据有明显错误（比如营业利润比营收还高），暂不给估值结论，等数据修正后恢复。` |
| F58 SC:109 + PAGE:687-691,844-848 | P1 | Z2/Z7 | `估值口径：截至 2026-06-30 的滚动十二个月（最新 10-K 叠加未审计 10-Q）。`，并且同一句在"生意质量"和"估值"两节各渲染一次 | "口径"；同页重复出现 | zh `估值用的是截至 2026-06-30 的最近十二个月数据（最新年报加上未经审计的季报）。`；只在估值节保留一处，或生意质量节改成短标签 `数据：最近十二个月（TTM）` |
| F59 SC:91,94-100 | P2 | Z2/Z7 | `合并层面的单一口径对它没有经济含义`；`把整体盈利力和资产重置价值放在一起比` | "口径"；"盈利力"和他处"盈利能力"不一致 | `这是一家以投资组合为主的控股集团，把它当成一家公司整体来估值说明不了什么。下面按巴菲特自己在股东信里的拆法来算：……` |
| F60 SC:93 / 153 | P2 | X2 | `每股中枢 · 基础档` / `central estimate · per share` | 中文多了"基础档"，英文没有对应 | zh `每股中枢（基准情形）`；en `per share · base case` |
| F61 SC:103-105 / 163-165 | P2 | X2/E3 | `悲观 / 基础 / 乐观` vs `Low / Base / High` | 中文"基础"一般说"基准"；美式读者习惯 Bear/Base/Bull | zh `悲观 / 基准 / 乐观`；en `Bear / Base / Bull` |
| F62 SC:154-156 | P2 | E1 | `Below it is broken out the way Buffett himself presented it: …` | 倒装被动句很别扭 | `So we break it out the way Buffett does in his letters: investments at market value, operating businesses at a multiple of earnings, minus the deferred tax on unrealized gains.` |
| F63 SC:88 / PAGE:545 | P2 | Z7 | eyebrow `估值 · 价值带` + verdict 为 null 时标题回退成 `估值` | 眉题和标题重复"估值" | 回退标题改为 `暂无估值结论` / `No valuation verdict` |

### 3.7 小项

| 位置 | 严重度 | 标签 | 现状 | 问题 | 建议改写 |
|---|---|---|---|---|---|
| F64 VB:47-49 | P2 | — | 单法徽章只挂一个 `*`，说明全靠 title tooltip | 移动端看不到 tooltip，`*` 等于没有解释 | 列表脚注已经写了「带 * 的为单法口径」，记得随 F30 同步改成「带 * 的只用了一种估值方法」 |
| F65 VL:25-28 | P2 | — | `BAND_FLOOR_NOTE` | 好句，可读 | 保留；若术语按 F4 改，把"零增长价值"写成「零增长的盈利能力价值」，与 F4 对齐 |

---

## 4. 优先改的 Top 5

1. **把引擎英文 prose 从 UI 里拿掉，改为按 locale 拼句（F32–F39、F43、F53、F54）。** 中文页现在有整段英文，英文页有 write A / audit #2 / AI-hog / v1 / AV_conservative。做法照搬现有的 `leveragePremiumDisclosure` 和 `capDisclosure`：引擎只给结构化码和数字，文案放在组件 COPY 里。F53（多股权类公司的首屏）先修，它是那个区块唯一的一句话。
2. **统一档位名，并纠正"安全边际"的误用（F1、F2、F27–F29）。** 刻度盘分段改用 valuationLabel 的档名：低于内在价值 / 合理区间 / 高于价值区间。安全边际只指那个折扣百分比。en 的 pending 改成 unconfirmed。
3. **头条数字和图例用 Greenwald / Buffett 的标准名（F3–F5、F18）。** 用"内在价值（含增长）""盈利能力价值（零增长）""所有者盈余""竞争优势期""折现率"，去掉"中枢 IV""零增长下行""乐观上沿""护城河 10 年"。
4. **改写首屏橙色低信心提示（F13–F17），去掉工程口径。** "输入偏脆""降级近似""分档假设""运行率"都要改成读者能照着做的话。
5. **修 PriceBetBlock 的拼接 bug 和中英混写（F21、F22、F25）。** 英文越界时会渲染出 "about over 25.0%"；中文页有 owner-earnings；"预期 · 公允"和"隐含温和"是同一指标的两套说法，统一为「隐含增速 · 温和 / 合理 / 苛刻」。
