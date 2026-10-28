# 3-valuation：估值区块专业度审核（第二轮）

范围：个股详情页估值区块（价值带刻度盘、图例、结论句、假设行、低信心提示、「方法与数字」折叠、所有者盈余 DCF、Greenwald 三层、护城河、net-net、预期徽章），以及筛选器的估值列。
样本（2026-10-28 本地站 http://localhost:3217 实取，价格日期 2026-10-27）：DECK、PDD（ADS）、BRK.B（控股集团 SOTP）、JPM（银行）、SNOW（亏损）、BABA（未评估），中英各一份，`<details>` 折叠内容一并读过。
第一轮 D-valuation.md 的 F1–F65 和 C 区筛选器条目不重复报。下表只收这一轮新发现的问题：术语准确度、数字和单位格式、颜色，以及页面上数字自相矛盾的地方。

---

## 1. 区域结论

- **打分：中文 2/5，英文 3/5。** 首屏一句话结论已经达到专业水准。往下越专业的部分（折叠区）越像引擎日志：中文页有整段英文，英文页带内部代号。第一轮的 P1 基本都还在。
- **最拉低专业感的 3 件事：**
  1. **同一张卡上，几个数字的名字对不上。** DECK 一张卡里，图例写「零增长底 $64」，折叠区写「零增长基准 $87.22」，EPV 行是 $73.47–$87.22。PDD 和 JPM 的同一个数还会以两个名字连着出现两次。读过 Greenwald 的人会直接认为模型有错。
  2. **专有名词贴错了对象。** 「有形净资产」有时其实是含商誉的账面净资产。银行用的是制造业的「重置价值」，没有用 TBVPS。ADS 价格标成「/ 股」。TTM 被标成「FY 2026」。中文「净流动资产」在港股语境里指营运资本，和格雷厄姆的 NCAV 不是一回事。
  3. **没有统一的数字格式化函数。** 股价取整到美元（$3 的股票显示 $3）。同一张卡上的精度有 $254、$73.47、$458.19 三种。区间连接号有时带空格、有时不带。中文页用 `$2.27B`、`$254/ 股`、ISO 日期。表格里写「减：−$20.67」，负号用了两次。

---

## 2. 发现表

路径缩写：`EPFC` = `src/components/valuation/EarningsPowerFloorCard.tsx`，`PAGE` = `src/app/[lang]/stocks/[ticker]/page.tsx`，`SCR` = `src/app/[lang]/stocks/screener/ScreenerTable.tsx`，`SCRP` = `src/app/[lang]/stocks/screener/_screenerPage.tsx`。

### 2.1 术语准确度（对照 Greenwald / Buffett / 格雷厄姆原文和通行中译）

| 页面/位置 | 严重度 | 类别 | 现状 | 为什么不专业 | 建议 |
|---|---|---|---|---|---|
| /zh/stocks/DECK、/stocks/DECK 图例与折叠摘要行；EPFC:455-467（图例 `usd0(rangeLo)`）、EPFC:766-769（摘要行） | **P0** | 术语/页面感 | DECK：图例 zh「零增长底 $64」/ en「Zero-growth floor $64」；折叠 zh「Greenwald $125.53 – $239.60 (中性 $186.03) · 零增长基准 $87.22」；EPV 行「$73.47 – $87.22 / 股」；所有者盈余行「$64.24 – $78.51」。PDD：zh「Greenwald 零增长 $90.37 · 零增长基准 $90.37」，en「Greenwald zero-growth $90.37 · zero-growth base $90.37」。JPM 同样出现两次 $246.06 | 在 Greenwald 的框架里，「零增长价值」只有一个，就是 EPV。现在三个不同的数都叫"零增长"，同一个数又以两个名字重复出现，专业读者会认为模型自相矛盾。图例的 $64 实际是**所有者盈余的低端**，不是 EPV | 每个数只对应一个名字。图例下沿 zh `所有者盈余价值（零增长，低端）`，en `Owner-earnings value, no growth (low)`。摘要行删掉 `零增长基准` 这一项（它和 EPV 上沿重复）。没有 ceilings 时，不再同时输出「Greenwald 零增长 X」和「零增长基准 X」，只保留 zh `盈利能力价值（EPV）$90`、en `Earnings power value (EPV) $90` |
| /zh/stocks/SNOW 等「方法与数字」；EPFC:778-785 ← reproductionValue.ts:48-62 | P1 | 术语 | 拿不到商誉/无形资产数据时，`tangible_net_assets` 实际传的是**账面净资产总额** `equity`。UI 照样写 zh「重置价值 = 有形净资产 $X」、en「tangible net assets $X」，而同一行后面的英文 basis 写着 "Total book value…intangibles not separated" | 标签说"有形"，数字其实含商誉，同一行前后矛盾。有形净资产（tangible book）是券商研报的标准指标，读者会拿它和 10-K 对数 | 按 `intangibles_separated` 分开写标签：false 时 zh `账面净资产 $X（无法剔除商誉与无形资产）`，en `book equity $X (goodwill/intangibles not separable)`；true 时保留 zh「有形净资产」/ en "tangible net assets" |
| /zh/stocks/JPM、/stocks/JPM 折叠区；EPFC:778-785 | P1 | 术语 | 银行写成 zh「重置价值 = 有形净资产 $320.59B = $118.99 / 股」，en "Reproduction value = tangible net assets…"，护城河判断也拿 EPV 和"重置价值"比 | Greenwald 的 reproduction value（复原重置成本）是"重建这些经营资产要花多少钱"，金融机构不适用：银行资产主要是贷款和证券，按账面就是公允价的近似。中美券商的银行研报都用**每股有形净资产（TBVPS）**和 P/TBV，没有人写银行的"重置价值" | `floor.is_financial` 为真时，zh 改为 `每股有形净资产（TBVPS）$119`，en `Tangible book value per share (TBVPS) $119`；护城河行改为 zh `盈利能力价值 / 有形净资产 = 2.1 倍`（等同于 P/TBV 的思路），en 对应写法 |
| /zh/stocks/PDD、/stocks/PDD 全卡；筛选器 PDD、WB、FINV 等 ADR 行；EPFC:110,159（`perSh`）、SCR:72 | P1 | 术语/格式 | 估值引擎已经按 ADS 归一化（adsNormalization.ts：`shares_diluted / ratio`），所以数字是**每 ADS**。但页面写 zh「$346/ 股」「$43.62 / 股」，en「$346/ sh」，全页没有出现 ADS | 中概股的券商研报一律写「美元/ADS」「per ADS」。1 股 ADS 往往对应多股普通股（PDD 是 1:4），写成"每股"会让读者拿去和港股或普通股价对比，差好几倍 | 按 `security_type === "ADR"` 切换单位：zh `/ADS`（正文写「每 ADS 346 美元」），en `/ADS`（"$346 per ADS"）。首次出现时加一句：zh `1 ADS = 4 股普通股`，en `1 ADS = 4 ordinary shares` |
| /zh/stocks/DECK、/zh/stocks/SNOW 折叠区；EPFC:782（`（FY ${rd_years_used.join(", ")}）`） | P1 | 术语/格式 | DECK zh/en「资本化研发 $130.30M（FY 2026, 2024, 2023, 2022）」，SNOW 同样。年份窗口行写的却是「TTM 2026-06-30, 2024, 2023…」 | ttmBasis.ts:127 把 TTM 合成行标成 `fiscal_year = FY0+1`。`yearsUsedText()`（EPFC:277-280）已经把这一年改写成 "TTM"，但重置价值这一行没有走这个函数，内部标签就露了出来。DECK 的 FY2026（截至 2026-03-31）是一个真实存在的财年，SNOW 的 FY2026 截至 2026-01-31，两者都和"截至 6/7 月的 TTM"对不上，属于**期间标错**。另外列表从 TTM 直接跳到 2024，读者会问 2025 去哪了 | 重置价值行也走 `yearsUsedText()`。年份窗口统一写成：zh `最近十二个月（截至 2026-06-30）及 FY2021–FY2024`，en `TTM to Jun 30, 2026 plus FY2021–FY2024`；如有需要，加一句 zh `最近一个完整财年已包含在 TTM 里` / en `latest full fiscal year is folded into the TTM` |
| net-net 提示；EPFC:113-116（en）、160-163（zh）；netNet.ts:44 | P1 | 术语 | zh「现价低于每股净流动资产（$X）。格雷厄姆式深度价值信号」；en「below net current asset value (… ) — a Graham "net-net"」 | 中文财报（港股、A 股）里的「净流动资产」是**流动资产减流动负债**，也就是营运资本。格雷厄姆的 NCAV 是**流动资产减全部负债**（netNet.ts:44 的实现是对的）。中文只写"每股净流动资产"，港股读者会读成营运资本，金额差很多。英文侧用的 "net current asset value" 是格雷厄姆原词，没问题 | zh 第一次出现时写全：`每股净流动资产价值（NCAV，流动资产减去全部负债）$X`，后面再出现用 `NCAV`。en 保留 `net current asset value (NCAV)`，"net-net" 用弯引号 |
| 「价格在赌什么」；PriceBetBlock.tsx:35-37,53-55 | P1 | 术语/页面感 | zh「现价把公司未来几年的 owner-earnings 年增定在 2.0%；公司过去营收年增 16.6%。低于它自己做到过的。」 | 这是标准的**反向 DCF / 市场隐含预期**（Mauboussin《预期投资》，Price-Implied Expectations），但拿"隐含的所有者盈余增速"去比"历史营收增速"，两个指标不是同一口径。DECK 的结论"低于它自己做到过的"是跨口径比出来的。专业读者会要求同口径对比（隐含 OE 增速对历史 OE 增速，或隐含营收增速对历史营收增速） | 方法名：zh `反向 DCF：现价隐含的增速`，en `Reverse DCF: growth priced in`。对比项改为同口径：zh `现价隐含所有者盈余每年增长约 2%；过去 5 年所有者盈余年均增长 X%`。拿不到历史 OE 增速时，要明说口径不同：zh `（对比的是营收增速，口径不同，仅供参考）` |
| 「方法与数字」Greenwald 摘要；EPFC:767、EPFC:330-331 | P2 | 术语 | en「Greenwald $125.53 – $239.60 (neutral $186.03)」「(neutral $98.81)」 | 美国卖方和 Morningstar 都说 base case 或 mid，没有人用 "neutral" 指中间情形，"neutral" 在美国研报里是评级（Neutral 等于持有）。中文「中性」在券商研报里是通行写法，保留 | en 改为 `base $186`。zh 保留「中性」，或与 SOTP 表头统一为「基准」 |
| 护城河判定词（en）；EPFC:51-56 | P2 | 术语 | en 只有 franchise / commodity，没有 Greenwald 原著的另一半说法 | Greenwald 的原文是 "franchise" 对 "no competitive advantage / commodity business"。纯写 "Franchise (moat)" 时，英文读者会先想到加盟店 | en `Franchise (competitive advantage)`；zh 按第一轮的「有护城河（特许经营权）」改。注意中文必须带「权」：单写「特许经营」在中文里就是加盟连锁 |

### 2.2 数字、货币、日期格式

| 页面/位置 | 严重度 | 类别 | 现状 | 为什么不专业 | 建议 |
|---|---|---|---|---|---|
| /stocks/screener、/zh/stocks/screener「现价」「内在价值」「价值带」列；SCR:76,87,97-98；刻度盘读数 EPFC:447 `usd0(price)` | **P0** | 格式 | 股价和价值都用 `Math.round` 取整：FINV「现价 $3、价值带 $12–$14、内在价值 $12」，WB「$6」，VYX「$8」。详情页刻度盘上的股价也是整数（DECK $81），而 SNOW 未评估分支显示的是 $337.42 | 股价报价精确到美分是所有行情和数据站（Bloomberg、Morningstar、雪球、富途）的底线。低价股取整的误差可达 ±17%（$2.51 显示成 $3），而旁边的安全边际是按精确价格算的（76%），读者用表上的整数复算会对不上 | 股价一律保留 2 位小数（zh、en 都写 `$3.42`）。估值数字 ≥$10 取整，<$10 保留 2 位。收进统一函数（见 2.4） |
| /zh/stocks/DECK 等全卡；EPFC:14-41（perShare/usd0/range/usd 四个本地函数）、PAGE:866 | P1 | 格式 | 同一张卡上的精度不一：头条 `$254`，折叠 `$73.47 – $87.22`、`$315.50`，BRK.B 表 `$458.19 / $496.25`，`$130.30M`，折现率 `9.50%–12.00%` 和 `9%–11%` 并存。区间连接号也是两种：`$64–$316`（无空格）和 `$89.55 – $315.50`（有空格） | 估值是估计值，保留到美分是虚假精确。Morningstar 的 Fair Value 也只给到美元，券商研报的目标价写整数。小数尾零（`12.00%`、`$130.30M`）和不统一的 en dash 空格，在美式编辑规范（AP/Chicago：数字区间用不带空格的 en dash）里都算排版错误 | 每股估值写整数（`$74–$87`）；比率保留 1 位并去掉尾零（`9.5%–12%`）；金额 B/M 保留 1 位（`$130.3M`）；区间一律 `lo–hi`，en dash 不带空格 |
| /zh/stocks/DECK 等折叠区与结论句；EPFC:35-41 `usd()`、EPFC:159 `perSh: "/ 股"`、EPFC:629 | P1 | 格式 | zh「有形净资产 $2.27B + 资本化研发 $130.30M」「$254/ 股 · 含增长中枢内在价值」「$64–$316 / 股」 | 中文财经媒体和券商研报写美股金额用「22.7 亿美元」，每股价值写「每股 254 美元」或「254 美元/股」。`$` 加中文量词「/ 股」，再加 B/M 缩写，是中英混排。（B 区报的是 `format.ts formatUSD`，估值卡用的是 EPFC 自己的一套 `usd()`，第一轮没覆盖到） | zh 正文：`有形净资产 22.7 亿美元 + 资本化研发 1.3 亿美元`、`每股 254 美元`。刻度盘、表格这类紧凑位置可以保留 `$254`，表头注明单位 `（美元/股）`。en：`$254/share` 或 `$254 a share`，正文不写 "/ sh" |
| /zh/stocks/BRK.B、/stocks/BRK.B 分部估值表；PAGE:864-866；stockCopy.ts:99 | P1 | 格式 | zh「减：递延所得税 \| −$20.67」，en「Less: deferred tax \| −$20.67」；表头只有「悲观 / 基础 / 乐观」，没写单位 | 标签已经写了「减：/ Less:」，数值再带负号就成了"减负数"，按会计读法等于加回。美式报表写 `Less: deferred taxes (20.67)` 或标签不写 Less、数值带括号；中文报表写「减：递延所得税 20.67」。分部估值表缺单位，专业表格必须标明 | 二选一：保留「减：」，数值写 `$21`；或标签改为「递延所得税」，数值写 `($21)` / `−$21`。表头加 zh `每股，美元`、en `Per share, USD` |
| /stocks/screener、/zh/stocks/screener 页头「估值截至 2026-10-28」；SCRP:76-80,116,185 | P1 | 格式/页面感 | 页头和脚注写「估值截至 2026-10-28」，表里每一行的价格日期是 2026-10-27 | `computedAt.slice(0,10)` 取的是计算任务跑完时的 UTC 日期，不是数据日期。美东晚上跑的任务会显示成"明天"。金融数据站标的都是"数据截至哪天的收盘" | 用价格日期：zh `按 2026 年 10 月 27 日收盘价计算`，en `Based on Oct 27, 2026 closing prices`。每行重复的日期删掉，只在表头写一次 |
| /stocks/PDD 等「价格在赌什么」；PriceBetBlock.tsx:63 | P2 | 格式 | en「the price needs its historical revenue growth to run about **1 more years**」 | 单复数没处理，第一轮 F26 改了语序，但没提单复数 | `about 1 more year` / `about 7 more years`，按 n === 1 切换 |
| /zh/stocks/SNOW 折叠摘要行；EPFC:766-769 | P2 | 页面感 | zh「· 重置 $11.27」，行首多一个分隔点（缺少 OE DCF 和 EPV 时） | 拼接时没处理首项 | 把各项放进数组再 `join(" · ")` |
| /stocks/DECK 英文页；EPFC:782 | P2 | 格式 | en「capitalized R&D $130.30M（FY 2026, 2024…）」，英文页用了全角括号 | 同一处模板对 zh 和 en 都写死了全角括号 | en 用半角 `(FY2022–FY2025)`；并按 2.1 的 TTM 那一条修正年份 |

### 2.3 第一轮 P0 在本区的状态（仍存在，不展开）

| 第一轮编号 | 状态 |
|---|---|
| F1 刻度盘与标题两套档名 | **仍存在**。批次 0 把刻度盘的「安全边际」改成了「低于合理价值 / 合理价值 / 高于合理价值」（EPFC:79-81,128-130），但标题徽章还是「价值带内 / 高于价值带」，结论句还是「落在价值带内」。DECK 刻度盘亮的是「低于合理价值」，下一句却说「落在价值带内」，仍然是两套名字 |
| F2 安全边际误用 | 已修（刻度盘不再出现「安全边际」） |
| F3 头条「含增长中枢内在价值 / growth-anchored intrinsic value」 | **仍存在**（EPFC:111,165） |
| F13 首屏低信心提示「今年输入偏脆」 | **仍存在**（EPFC:89,136） |
| F32–F43 折叠区引擎英文 prose 和内部代号（write A、v1、AV_conservative、engine lamp、DGS10 @） | **仍存在**，6 只样本股全部命中。这是中文专业度打不到 3 分的主要原因 |

### 2.4 格式化函数现状与建议

现状：`src/lib/format.ts` 只有 `formatUSD`（不分语言，B 位 2 位小数、M 位 1 位）、`fmtMarginPct` 和 `fmtValueBand`。估值卡在 EPFC:14-41 另写了 `perShare / usd0 / usd / range / pct / pct1` 六个函数，规则和 format.ts 不一致（M 位 2 位小数）。筛选器又在 SCR:76,87,98 内联写了 `Math.round(n).toLocaleString()`（不指定 locale，服务端和客户端的输出可能不同）。全站没有日期格式化函数。

建议在 `src/lib/format.ts` 加一套按语言输出的函数，估值区全部改用它：

| 函数 | zh 目标格式 | en 目标格式 |
|---|---|---|
| `fmtPrice(v, lang)` 股价 | `$80.73`（紧凑位置）/ 正文 `80.73 美元` | `$80.73` |
| `fmtValuePerShare(v, lang, unit)` 每股估值 | ≥$10 取整：`每股 254 美元`；ADS：`每 ADS 346 美元`；紧凑：`$254` | `$254/share`、`$346/ADS` |
| `fmtUsdAmount(v, lang)` 大额 | `22.7 亿美元`、`1.3 亿美元`、`8,400 万美元` | `$2.3B`、`$130.3M` |
| `fmtRange(lo, hi, f)` | `$64–$316`（en dash 不带空格） | 同 |
| `fmtRate(r)` 比率 | `9.5%`、`12%`（去尾零） | 同 |
| `fmtDate(iso, lang, style)` | 正文 `2026 年 10 月 27 日`；表格和来源 `2026-10-27` | 正文 `Oct 27, 2026`；表格 `2026-10-27` |
| `fmtFiscalPeriod(p, lang)` | `FY2025`、`最近十二个月（截至 2026-06-30）` | `FY2025`、`TTM to Jun 30, 2026` |
| 负数 / 扣减项 | `−21` 或标签写「减：」，二选一 | `(21)` 或 `−$21`，二选一 |

---

## 3. 需要产品拍板的问题

### 3.1 估值配色要不要跟着"红涨绿跌"切换（待决策）

**现状**：估值区的配色是「便宜 = 绿，高于价值 = 琥珀，价值带内 = 中性灰蓝」，**没有用红色**（红色 `--alert` 只用于数据异常）。具体用到这套颜色的地方：

- 刻度盘击球区段：EPFC:397-413，用 `--tt-positive`
- 估值徽章「击球区 / 低于内在价值」：ValuationBadge.tsx:40-42，用 `--tt-positive`
- 筛选器安全边际数字和置顶左边线：SCR:32,57,145，用 `--tt-positive`
- 首屏「安全边际 68%」：StockConclusionBand.tsx:35，用 `--val-below`
- 「高于价值带」徽章：tone `warn`，用 `--val-above`（琥珀）

**风险**：13F 的加仓/减仓标签 `MoveTag.tsx:14` 也用 `--tt-positive`（绿）和 `--tt-negative`（红）。如果中文站以后改成红涨绿跌，最直接的做法是对调这两个 token，这样估值的"便宜"会跟着变红，在中文读者眼里会被读成"高估/危险"。

**选项**：
- A. 估值配色两种语言都不变（便宜绿、贵琥珀），和涨跌色解耦。
- B. 估值配色随语言切换。

**推荐 A**。估值档位描述的是价格贵不贵，不是涨还是跌，不需要跟涨跌约定走。国内基金平台的指数估值页常用"低估绿、高估红/橙"，现有配色本身就不会让中文读者误读。

**要做的工程动作**：把上面 4 处 `--tt-positive` 改成 `--val-below`（色值几乎一样，hue 152 对 158），让估值配色和涨跌色彻底分开。之后中文站无论是否切成红涨绿跌，估值区都不受影响。

### 3.2 ADR 的单位标注

**选项**：
- A. 一律改成 `/ADS`，首次出现时注明换算比例。
- B. 换算成普通股口径再标 `/股`。

**推荐 A**。和券商研报、Yahoo 报价一致，股价本来就是按 ADS 报的。

### 3.3 金融股的资产锚

**选项**：
- A. 金融股改用每股有形净资产（TBVPS），护城河按 EPV/TBV 来判断。
- B. 保留"重置价值"的名字，加一句注释。

**推荐 A**。银行读者认的就是这个指标。

---

## 4. 中英标准译法核对（供术语表定稿参考）

第一轮术语表的大方向是对的（盈利能力价值、所有者盈余、维持性资本开支、窄护城河、价值毁灭），这里只补充需要修正或细化的地方：

| 英文原词（出处） | 推荐中文 | 说明 |
|---|---|---|
| Earnings power value, EPV（Greenwald） | 盈利能力价值（EPV） | 按定义就是零增长，图例可以写「零增长价值」，但全卡只能对应**一个**数（见 2.1 P0） |
| Reproduction value / reproduction cost（Greenwald） | 资产价值（按重置成本计）；严格说是「复原重置成本」 | 中国资产评估教材区分**复原重置成本**（reproduction）和**更新重置成本**（replacement），Greenwald 用的是前者。本站实际算的是「有形净资产 + 资本化研发」，是账面近似，首次出现建议注明 `（账面近似）`；英文 `asset value (book-based proxy for reproduction cost)` |
| Franchise（Greenwald） | 特许经营权 / 有护城河 | 不能省掉「权」，单写「特许经营」就是加盟连锁 |
| Owner earnings（Buffett 1986 年致股东信） | 所有者盈余（台湾译本多作「業主盈餘」） | Buffett 原定义的 (c) 项包括维持竞争地位所需的**营运资本增量**，本站标注 "no ΔNWC" 是简化处理，中英文都应如实写成「未计营运资本变动」 |
| Net current asset value, NCAV / net-net（Graham） | 净流动资产价值（NCAV，流动资产减全部负债）；净-净股 | 避免和中文财报里的「净流动资产 = 营运资本」混淆 |
| Tangible book value per share（银行） | 每股有形净资产（TBVPS） | 金融股替代"重置价值" |
| Reverse DCF / price-implied expectations（Mauboussin） | 反向 DCF / 市场隐含预期 | 「价格在赌什么」的方法名 |
| Base case | 基准情形（研报也写「中性情形」） | en 不用 neutral |
