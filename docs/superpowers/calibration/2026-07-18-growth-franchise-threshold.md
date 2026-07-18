# 成长型 franchise 阈值(moat_via_growth 旁路)全 universe 校准 provenance

日期: 2026-07-18 | 脚本: `web/scripts/growth-franchise-calibrate.ts`(只读,持仓并集全宇宙,不写库)

## 数据源与口径
- **持仓宇宙**: 被追踪投资人最新一季 13F 持仓并集 → ticker(经 `getCusipMap` 解析 + `isLikelyTicker` 过滤)。
- **基本面**: `getSecCompanyData(ticker)` 读 `company_fundamentals_periods`(`fiscal_period=FY` 行,SEC XBRL 派生),经 `fundamentalsToFloorInput` → `computeValuationFloor`。
- **过滤**: `isOperatingSecurity` + `resolveAds`(排除非营运证券/被抑制 ADS),只取 `moat_reading.signal==="commodity"` 且 `is_financial!==true` 的票。
- **computed_at**: `2026-07-18T09:12:00Z`(脚本运行时间戳,`/tmp/gfcal.log`)。
- **数据新鲜度**: 依赖上一次 `valuation`/`sec` ingest 落表的 FY 基本面;本校准为只读快照,未触发新 ingest。

## Universe 规模
- 全宇宙: **1910** 票 → 扫描后落 `commodity` 信号且非金融: **149** 票(校准样本 = 这 149 行 NDJSON,`/tmp/gfcal.ndjson`)。

## 判别器算法(与 Task 3 将落地的 `operatingIncomeLogGrowth` 逐字一致)
- `opIncLogGrowth`: 取各 FY 年 `operating_income`,**过滤 >0 且有限**的点,对 `ln(operating_income)` 做 FY log-线性回归(最小二乘),年化 `g = exp(slope) - 1`;有效正点数 `< 3` 返回不可得。**回归口径,非端点 CAGR**(CAGR 准确性硬门),与 `src/lib/valuation/growthBaseRate.ts::historicalGrowthBaseRate` 同写法,仅 revenue→operating_income。
- `years`: 参与回归的有效正 FY 点数。
- `allOpIncPositive`: **全部** FY 年 operating_income 均 >0(关键甄别闸,见下)。
- 命中规则: `allOpIncPositive && opIncLogGrowth >= MIN_CAGR && years >= MIN_YEARS`;strong 分档: 再叠加 `opIncLogGrowth >= STRONG_CAGR && years >= STRONG_MIN_YEARS`。

## 候选阈值网格
- `MIN_CAGR ∈ {0.04, 0.05, 0.06, 0.07, 0.08}`
- `MIN_YEARS ∈ {4, 5, 6}`
- `STRONG_CAGR ∈ {0.12, 0.15, 0.18, 0.20}`

## 关键发现:`allOpIncPositive` 是甄别真假的决定性闸,不是 CAGR 高度
仅用 `opIncLogGrowth>=MIN_CAGR && years>=MIN_YEARS`(无 allPos 闸)时,**ATI(g=51.3%,y5)与 CELH(g=86.7%,y4)会假阳命中** —— 它们是周期低谷回补/未证实高增长,回归斜率被谷底抬得很高。加上 `allOpIncPositive` 闸后:ATI/CELH/EMN/AGCO/DINO/CEG(全含亏损 FY 年)一次性出局,而真 franchise(全年营业利润为正)不受影响。**结论:命中规则必须含 allOpIncPositive,单靠 CAGR 高度无法分开真成长与周期回补。**

## MIN_CAGR × MIN_YEARS 命中集大小(已含 allOpIncPositive 闸)
| years≥ | c0.04 | c0.05 | c0.06 | c0.07 | c0.08 |
|---|---|---|---|---|---|
| 4 | 44 | 43 | 41 | 39 | 39 |
| 5 | 44 | 43 | 41 | 39 | 39 |
| 6 | 42✗ | 41✗ | 39✗ | 37✗ | 37✗ |

✗ = `years≥6` 下 **ARM 落空**(ARM 营业利润记录恰为 5 个正 FY 年),违反"必须命中 ARM"。故 `MIN_YEARS` 上界被 ARM 钉死在 5。

各候选下 must-not 命中情况(含 allPos 闸): **EMN/AGCO/DINO/ARW/ATI/CELH 在全部候选均不命中**(bad hits 恒为空)。must-not 的排除完全由 allPos 闸 + 正增长要求承担,与 MIN_CAGR 的具体高度无关。

## 最终锁定四值
| 常量 | 值 | 选择依据 |
|---|---|---|
| `GROWTH_FRANCHISE_MIN_CAGR` | **0.05** | must-not 排除已由 allPos 闸完成,MIN_CAGR 是"多少增长才算成长"的经济下限。5% 年化实营业利润增长 ≈ 稳超通胀/GDP,是"成长"的合理门槛;距最弱 must-hit(ARM 9.6%)有近 2× 余量;比网格低边缘 0.04 高一档,不贴边。0.06 会砍掉 AMD(5.5%,真设计周期成长)而无收益。 |
| `GROWTH_FRANCHISE_MIN_YEARS` | **5** | 上界被 ARM(恰 5 正 FY 年)钉死——取 6 会误伤真 franchise。5 年连续正营业利润是有意义的业绩长度,且与代码库既有 strong 分档"≥5 连续盈利 FY 闸"口径一致;网格 {4,5,6} 的中间值,不贴 4 的低边。 |
| `GROWTH_FRANCHISE_STRONG_CAGR` | **0.15** | 网格 {0.12,0.15,0.18,0.20} 里 0.12 过松(把 12% 温和成长者也判 strong,29 只),0.18/0.20 命中集相同(16 只,18–20% 间无票=天然断档)偏严。0.15(≈5 年翻倍)是经典强复利门槛,非边缘;AMZN(34.6%)舒适落 strong。 |
| `GROWTH_FRANCHISE_STRONG_MIN_YEARS` | **5** | strong 不应比基档要求更长的历史;两档同用 5 年连续正记录。strong 票均已先过基档 MIN_YEARS=5 闸,故此值不额外收紧,AMZN(y6)满足。 |

最终配置(0.05 / 5 / 0.15 / 5)命中 **43** 票:strong **22** / moderate **21**。

## 标杆分离验证表(最终四值下实算)
| ticker | opIncLogGrowth | years | allPos | 命中 | 档位 | 判读 |
|---|---|---|---|---|---|---|
| AMZN | 34.6% | 6 | true | YES | **strong** | 真 franchise,必须命中且 strong ✓ |
| ARM | 9.6% | 5 | true | YES | moderate | 真 franchise,恰 5 年记录钉死 MIN_YEARS 上界 ✓ |
| EQIX | 10.6% | 6 | true | YES | moderate | 真 franchise(数据中心 REIT)✓ |
| EW | 2.8% | 6 | true | no | — | 增长 <5% 下限,正确落空 |
| AMD | 5.5% | 6 | true | YES | moderate | 设计周期成长者,0.05 下勉强命中(0.06 会砍掉) |
| CEG | 80.2% | 5 | **false** | no | — | 含亏损 FY 年,allPos 闸排除(能源周期,非稳定成长) |
| EMN | NA | 0 | false | no | — | 无有效正营业利润点,自然出局(真大宗) |
| AGCO | 0.3% | 5 | false | no | — | 含亏损年 + 近零增长,排除(真大宗) |
| DINO | -20.7% | 5 | false | no | — | 含亏损年 + 负增长,排除(真大宗炼油) |
| ARW | -7.9% | 6 | true | no | — | 全年为正但负增长,被 MIN_CAGR 排除(真大宗分销) |
| ATI | 51.3% | 5 | **false** | no | — | 周期低谷回补假高增速,allPos 闸排除(真大宗金属) |
| CELH | 86.7% | 4 | false | no | — | 含亏损年 + 记录仅 4 年,双重排除(未证实) |

判读结论: **必须命中 AMZN/ARM/EQIX 全部满足,AMZN 落 strong;必须不命中 EMN/AGCO/DINO/ARW/ATI/CELH 全部满足**,各以正确理由被排除(负增长 / 含亏损年 / 记录过短 / 无正点)。

## 命中集全清单(最终四值)
- **strong(22)**: MTSI(66%) NOW(62%) HOG(59%) PODD(56%) VSEC(48%) ACMR(44%) EXEL(43%) CR(42%) NPO(35%) AMZN(35%) RBC(33%) TTMI(31%) BHE(25%) ONTO(25%) DT(24%) IOSP(24%) AAON(18%) OTTR(17%) GPK(17%) ACA(17%) ACLS(16%) COO(15%)
- **moderate(21)**: EE(15%) EXR(15%) SAIA(13%) VMC(13%) ADI(12%) LW(12%) ICLR(12%) LEA(12%) ESS(12%) LAD(12%) EQIX(11%) AWR(10%) FDX(10%) AVA(10%) ARM(10%) XPO(9%) GLPI(9%) AVB(6%) DTE(6%) PLPC(6%) AMD(5%)

## 遗留观测(留 final review / 后续 spec)
- **HOG(哈雷,strong 59%)** 全年营业利润为正但高度周期,回归斜率含 COVID 谷底回补成分——allPos 闸放行但增速可能被低基数抬高。半导体设备簇(ACMR/ONTO/ACLS/NPO/RBC/MTSI)同理为"成长中的周期股"。这类"全年为正但波动大"的名单是 allPos 闸的已知盲点,建议 Task 3 落地后在 final review 抽查其 CAP 分档是否恰当。
- moderate 档含若干公用/REIT(EE/EXR/ESS/AVA/AWR/DTE/AVB/GLPI),增长稳但franchise属性弱;命中为良性(仅得温和 CAP),暂不额外收紧。
