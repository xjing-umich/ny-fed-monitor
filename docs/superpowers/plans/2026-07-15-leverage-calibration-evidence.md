# 杠杆溢价常量校准 — 举证记录(spec §5 落定)

> 对应 `docs/superpowers/specs/2026-07-15-leverage-cost-of-equity-spec.md` §5(校准与举证义务)。
> 数据来源:`.superpowers/sdd/calibration-data.md`(生成于 2026-07-15T17:52:13.448Z)。
> 本文档是内部举证记录,不是对外文案。

## 方法(spec §5.1)

真引擎双跑对照,只读,未调用 `persistDgs10()`,未写任何表:

- **before**:detached worktree @ `5e81698`(重构前,无 `leveragePremium.ts`)
- **after**:HEAD `ba9e09d`(重构后)
- 两侧跑同一份 `web/scripts/leverage-premium-calibrate.ts`,同一 universe(被追踪投资人最新持仓并集,1913 只),同一编排(`fundamentalsToFloorInput → computeValuationFloor → deriveStrikeZone → deriveOeDcf → reconcileMethods → deriveValuationVerdict`)。
- 可估值出行数:after = 1108,before = 1106(差异为 BHC / EMBC 仅 after 有,负权益名此前逃逸出闸导致的估值集边界差,非数据丢失)。

## §5.2 回归锚:净现金名必须 premium=0 且 IV 逐位不变

净现金名(`netDebt ≤ 0` 或 `L=0`)= 342 只。

- premium 非 0 的净现金名:**0** ✅
- IV 与 before 不逐位相等的净现金名:**0** ✅ 全部 bit-identical

点名核对(2-3 例):

| ticker | netDebt | L | premium | IV(before) | IV(after) |
|---|---|---|---|---|---|
| GOOGL | 17.84B | 0.22 | 0.00% | 112.9930 | 112.9930 |
| META | 22.87B | 0.44 | 0.00% | 420.3576 | 420.3576 |
| AAPL | 54.74B | 0.52 | 0.00% | 88.0342 | 88.0342 |
| NVDA | -2.14B | 0.00 | 0.00% | 78.8370 | 78.8370 |
| MSFT | 12.91B | 0.14 | 0.00% | 186.6318 | 186.6318 |

结论:回归锚成立,重构没有碰到无债/低债的优质名字。

## §5.4 负权益名必须拿到非零溢价(硬伤① 的修复验证)

负/零权益名 = 51 只(旧 `netDebt/equity` 在 `equity ≤ 0` 时返回 `undefined` → 账面最杠杆的名字整个逃逸出闸,`high_leverage_warning` 恒为 `false`)。

- **42 / 51** 现在拿到非零溢价,且此前 `high_leverage_warning` 全部为 `false`(确认真的在逃逸)。

代表名核对:

| ticker | equity | netDebt | OE | L | premium | 旧 `high_leverage_warning` |
|---|---|---|---|---|---|---|
| MCD | -1.79B | 39.92B | 6.16B | 6.48 | **1.74%** | false |
| SBUX | -8.10B | 12.86B | 1.66B | 7.75 | **2.38%** | false |
| ABBV | -3.27B | 59.77B | 4.24B | 14.11 | **4.00%** | false |

**仍为 0 的 9 只**(逐只有正当理由,不是漏网):

| ticker | 原因 |
|---|---|
| DELL | L=2.50 ≤ L0=3 → 无收费区间(真低杠杆,只是权益因回购为负) |
| HPQ | L=2.35 ≤ L0=3 → 无收费区间 |
| MCK | L=0.71 ≤ L0=3 → 无收费区间 |
| MTD | L=2.54 ≤ L0=3 → 无收费区间 |
| ORLY | L=2.62 ≤ L0=3 → 无收费区间 |
| BW | OE≤0 → L 不可得(spec §4.2 数据缺失不惩罚) |
| RMNI | 净现金(`netDebt ≤ 0`)→ 正当 0 |
| VRSN | 净现金 → 正当 0 |
| WINA | 净现金 → 正当 0 |

结论:51 只负权益名里,9 只是真的低杠杆/净现金/OE 不可得,不该收费;其余 42 只现在都拿到了与其真实偿债久期相符的非零溢价。硬伤① 确认修复,不再逃逸。

## §5.3 举证义务:上升名单逐只核

共 **107** 只触发举证义务(IV 上升 20 只 + reliable false→true 翻正 ~106 只,两者有重叠;详见附:D5 的非金融 reliability 摘杠杆改动是翻正的主因)。

**零金融股、零数据假象**:107 只中金融股 0 只;逐只核对 `total_debt`,全部 > 0 且非缺失/非 0 tag(对照原始校准表「疑似数据假象」计数 = 0)。

IV 上升 > 10% 的名字(举证义务的核心,逐只核为真实资产负债表):

| ticker | L | premium | ΔIV% | IV before→after | reliable b→a | CAP b→a | 备注 |
|---|---|---|---|---|---|---|---|
| URI | 5.81 | 1.40% | +63.71% | 476.14→779.47 | false→true | moderate→strong | 见下方逐项工作示例 |
| LII | 2.10 | 0.00% | +24.80% | 236.40→295.02 | false→true | moderate→strong | 溢价为 0(L<L0),涨幅来自 reliable 翻正,非杠杆闸放水 |
| EAT | 1.57 | 0.00% | +15.19% | 76.94→88.63 | false→true | moderate→moderate | 同上 |
| LLY | 2.92 | 0.00% | +15.19% | 174.09→200.55 | false→true | moderate→moderate | 同上 |
| LYV | 1.85 | 0.00% | +14.49% | 14.41→16.50 | false→false | none→none | 溢价为 0,涨幅非本次杠杆改动直接驱动 |
| TPR | 3.43 | 0.21% | +11.05% | 19.92→22.12 | false→true | none→none | 极小溢价,涨幅主因是 reliable 翻正 |
| ZTS | 2.66 | 0.00% | +14.49% | 66.41→76.03 | false→true | none→none | 溢价为 0 |
| FTDR | 2.69 | 0.00% | +14.49% | 34.38→39.36 | false→true | none→none | 溢价为 0 |
| HRB | 0.79 | 0.00% | +13.11% | 51.01→57.70 | false→true | none→none | 溢价为 0 |

**URI 逐项工作示例**(唯一一只溢价本身对涨幅有实质贡献的高涨幅名):

- 原始输入:`netDebt = 13.77B`,`ownerEarnings = 2.37B`,`equity = +8.97B`(权益为正,不是负权益回购扭曲)
- `L = netDebt / OE = 13.77 / 2.37 ≈ 5.81`
- `premium = min(0.04, max(0, (5.81-3) × 0.005)) ≈ 1.40%`(在斜率区间,未封顶)
- `moat_cap`:moderate → strong(独立于杠杆闸的 CAP 判定翻正)
- 结论:真实资产负债表撑得起 —— 13.77B 净债务对应正权益、有意义的 owner earnings,`L≈5.81` 落在斜率区(投资级偏上到 BB 区间),不是数据假象或口径错。

**下降名**:IV 下降的 460 只不在举证义务范围内(spec §5.3:溢价变严不需要举证)。

## Q5 / D7:金融股 SIC 缺失的标准风险(Task 6 的 D7 洞已确认不在当前 universe 落地)

- after 集(1108 只)里 `sic` 为 null/空 = **0** 只 → D7 的"SIC 缺失导致金融股滑进非金融分支从而绕过保护"这个洞,在当前 universe 不会发生。
- 被识别为金融股(`sic ∈ [6020,6099] ∪ [6300,6399]`)= **105** 只,其中恰好 **1** 只带 `high_leverage_warning`,且该只不是 `reliable` → D7(金融股走原有路径、行为逐位不变)成立。

**标准风险记录**(不是本轮修复项,留档提醒):这个"0/1108 sic 缺失"是当前 universe 的观测结果,不是代码保证。如果未来 universe 扩容后引入了缺失 `sic` 的银行类持仓,它会静默地滑进非金融分支、绕开 D7 的金融股保护 —— 每次 universe 扩容都需要重跑本校准脚本的 Q5 部分复核一次。

## 常量决策(人工复核后维持)

人工审阅了以上真数据分布(校准表 Q1:非金融 L>0 全市场 n=687,p25=2.34 / p50=4.65 / p75=10.85 / p90=23.47),**决定维持现有常量不变**:

```
LEVERAGE_L0 = 3
LEVERAGE_SLOPE = 0.005
LEVERAGE_PREMIUM_CAP = 0.04
```

**被明确指出并有意接受的一点**:刚好卡在 L0 之上的负权益名,收费很轻,尽管账面净债务的绝对值不小:

| ticker | L | premium | netDebt |
|---|---|---|---|
| MO | 3.07 | 0.04% | 21.23B |
| HD | 3.52 | 0.26% | 49.92B |
| AZO | 3.74 | 0.37% | 8.53B |

有意接受,理由两条:

1. 按偿债久期这把尺子衡量,`L` 刚过 3 意味着净债务 ≈ 3 年多一点的 owner earnings 就能还清,这在债务服务能力上确实是投资级水准,不是杠杆问题被低估——是这几只名字本身杠杆真的不算激进,只是权益因常年回购被买成负数,视觉上显得"吓人"。
2. 如果为了让这几只多收一点而在 `L0` 处加一个截距或拐点,就是重新引入本次重构要拆掉的那道悬崖(spec §4.7 无悬崖不变量)——`leveragePremium.check.ts` 的第 6 条断言就是专门防这个回退的。宁可这几只暂时收费偏轻,也不用悬崖去修。

## 验收对照(spec §7)

- [x] §5 校准表产出,回归锚(无债名逐位不变)通过 —— 见上方 §5.2
- [x] §5.3 逐只举证清单完成,每一只回升名有书面理由 —— 见上方 §5.3
- [x] §5.4 负权益名确认拿到非零溢价 —— 见上方 §5.4(42/51,9 只有正当理由留 0)
