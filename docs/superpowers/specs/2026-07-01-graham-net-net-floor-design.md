# Graham Net-Net 资产底 — 设计文档

**日期:** 2026-07-01
**分支(建议):** `feat/valuation-net-net`
**目标基:** `db-foundation`

## 背景

估值方案审计发现:现有引擎(Greenwald 资产重置 / EPV / 增长价值 + Buffett 所有者收益 DCF)对**资产型、困境型**公司缺少一条最硬的 Graham 底——**净流动资产价值(NCAV / net-net)**。Graham 本人最看重的清算式底线,现有 Reproduction Value 用的是"有形账面 + R&D 资本化",并非纯清算口径。

数据支撑已实测(占 12,354 份年报):`total_liabilities` 98%、`shares_diluted` 96%、`current_assets` 83%(缺的 17% 集中在银行/保险/外国股——net-net 本就不适用)。**对 net-net 真正适用的对象(工业/零售/消费),字段覆盖接近满。**

## 设计原则

**保持简单易懂。** net-net 平时完全隐形,只在真正罕见的深度价值情形冒出一行人话。不改现有 6 档价值带、不改 verdict、不加任何可调参数、不加假设。

## 功能范围

### 做

1. **计算(纯函数)**——新文件 `web/src/lib/valuation/netNet.ts`(~30 行):
   ```
   每股 NCAV = (current_assets − total_liabilities) / shares_diluted
   ```
   - 三字段齐备才计算;缺任一 → 返回不可评估(assessable=false)。
   - 金融/外国股天然无 `current_assets` → 自动不触发。
   - 零参数、零假设、零外部输入。

2. **归属与数据流**:
   - 作为一个小 lamp 挂进现有 `ValuationFloor`(与 Reproduction Value 并列),**不进 6 档价值带、不改 `verdict_bucket`**。
   - 触发判定在 verdict/strikeZone 阶段:`triggered = price != null && price > 0 && perShareNcav > 0 && price < perShareNcav`。
   - 存储:结果写入 valuation_snapshot 现有的 `payload` jsonb —— `net_net: { per_share, triggered }`。**无需 migration。**

3. **露面(唯一 UI 变化)**:个股页价值带下方,仅当 `triggered` 为真时,多一行中性注脚(zh/en):
   > ⚑ 现价低于每股净流动资产($X)。格雷厄姆式"净 net"深度价值,历史极罕见——常伴随经营困境,须警惕价值陷阱。
   >
   > (金额币种随财报,当前 universe 全为 USD,故用 $。)
   >
   > ⚑ Price is below net current asset value ($X/share). A Graham "net-net" — historically rare and usually a sign of business distress; beware the value trap.
   - 平时(约 99% 的股票)完全不显示。措辞中性、带风险提示,守"只观察不荐股"约束。

4. **护栏 / 边界**:
   - 三字段任一缺 → 不计算、不触发。
   - `shares_diluted ≤ 0` 或 `perShareNcav ≤ 0` → 不触发(负净流动资产无意义)。
   - 独立于 EPV/OE 的 `>80%` 边际熔断闸(isImplausibleBand)——net-net 是另一条底,不受其抑制、也不触发它。
   - 不进 `reliable` 判定(它本身就是"数据齐才算"的确定量)。

5. **测试**——新增 `web/src/lib/valuation/netNet.check.ts`(tsx assert,沿用现有 `*.check.ts` 风格),覆盖:
   - 正常触发(price < NCAV)。
   - 字段缺失 → assessable=false。
   - 负 NCAV → 不触发。
   - 金融股(无 current_assets)→ 不触发。

### 不做(守简单)

- ❌ net-net 独立筛选视图 / 页面。
- ❌ 改 6 档价值带档位或 `verdict_bucket`。
- ❌ 碰徽章(ValuationBadge)/ 首页榜 / screener。
- ❌ 加 Graham 折扣系数(如 2/3 NCAV)等可调参数。
- ❌ 减优先股 / 精修清算系数(纯 NCAV 即可)。

## 架构与数据流

```
FundamentalPeriod(最新 FY)
  → fundamentalsToFloorInput  → ValuationFloorInput(已含 current_assets/total_liabilities/shares_diluted)
  → computeValuationFloor      → ValuationFloor { ..., net_net: NetNetLamp }   ← 新增 lamp
  → deriveValuationVerdict     → payload.net_net = { per_share, triggered }    ← 触发判定(用 price)
  → 个股页读 payload.net_net.triggered  → 条件渲染一行注脚
```

`NetNetLamp` 类型(加入 `types.ts`):
```ts
type NetNetLamp =
  | { assessable: true; per_share: number }
  | { assessable: false; reason: string };
```
触发状态 `triggered` 不存进 lamp(lamp 是价格无关的纯基本面量),而在 verdict 阶段结合 price 计算后写入 payload。

## 错误处理

- 任何字段缺失/非法 → lamp `assessable=false`,verdict 阶段 `net_net.triggered=false`,UI 不渲染。绝不抛异常、绝不阻断既有 floor 计算(遵循现有"诚实降级"约定)。

## 测试策略

- 纯函数 `computeNetNet(input)` 单测(netNet.check.ts,4 case 如上)。
- verdict 层触发判定复用现有 `deriveValuationVerdict.check.ts` 加一个 case(price < NCAV → payload.net_net.triggered=true)。
- 本地门:`npx tsx src/lib/valuation/netNet.check.ts` + `tsc --noEmit`(本项目不跑测试套件,tsc + check 脚本为准)。

## 落地后验证

- 跑一次 `valuation:ingest`(或等每日 cron)使 payload 带上 net_net。
- 抽查历史著名 net-net(如深度破净的小盘工业股)确认注脚正确出现;抽查正常股确认完全不显示。
