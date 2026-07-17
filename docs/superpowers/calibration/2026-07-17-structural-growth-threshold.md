# S_STRUCTURAL_GROWTH 门槛校准 provenance

日期: 2026-07-17 | 脚本: web/scripts/structural-growth-calibrate.ts (只读,持仓并集全宇宙)

宇宙: 1910 票 → franchise 548 (非金融 505) → gFund 压低 g1 的 movers 190

## 门槛敏感性 (movers 中放行数 / 中位 delta / delta>10pp 数)
- thr=0.4: 放行 87, 中位 +4.6pp, >10pp 7
- thr=0.5: 放行 63, 中位 +4.7pp, >10pp 6
- thr=0.6: 放行 53, 中位 +4.6pp, >10pp 5
- thr=0.7: 放行 26, 中位 +4.3pp, >10pp 2

## 选定 0.5 的依据
- 目标结构性 franchise: MA s=0.59 / SPGI s=0.60 / NFLX s=0.69 / ADBE s=1.00 全部放行;提到 0.6 会误伤 MA → 0.5 是保住目标票的刚性上界。
- 顺周期/低置信被挡: CAT s=0.35, KO s=0.45 不动(峰值增长不计入)。
- 克制: 63 movers 放行, 中位 +4.7pp; 仅 6 个 >10pp, 均为真高增长或封在既有 20% strong cap 内。

## thr=0.5 大幅上抬(>10pp)watch-list (final review 复核 moat 分档是否恰当)
- ABNB: s=0.60 grade=strong g1 2.7→20.0% (cagr=NA, gRaw=27%)
- INTU: s=0.59 grade=strong g1 2.1→17.0% (cagr=17%, gRaw=19%)
- MGRC: s=0.60 grade=strong g1 0.0→14.9% (cagr=15%, gRaw=65%)
- PCTY: s=0.80 grade=strong g1 6.0→20.0% (cagr=34%, gRaw=23%)
- ENSG: s=0.60 grade=strong g1 1.4→15.3% (cagr=15%, gRaw=17%)
- ROL: s=1.00 grade=strong g1 0.0→10.7% (cagr=11%, gRaw=12%)
