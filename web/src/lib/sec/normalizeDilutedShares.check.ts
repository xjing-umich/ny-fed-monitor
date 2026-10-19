import assert from "node:assert";
import { normalizeDilutedShares, deflateOverScaledShares } from "./normalize-facts";

// MCD-style: diluted shares tagged in millions (716.4), NI/EPS implies ~716.6M → ×1e6.
assert.strictEqual(normalizeDilutedShares(716.4, 8_563_000_000, 11.95), 716_400_000);
assert.strictEqual(normalizeDilutedShares(721.9, 8_223_000_000, 11.39), 721_900_000);

// Already absolute (ratio ≈ 1, only EPS-rounding noise) → unchanged.
assert.strictEqual(normalizeDilutedShares(741_300_000, 6_177_400_000, 8.33), 741_300_000);
assert.strictEqual(normalizeDilutedShares(750_100_000, 4_730_500_000, 6.31), 750_100_000);

// Thousands-scale tag (ratio ≈ 1e3) → ×1e3.
assert.strictEqual(normalizeDilutedShares(716_400, 8_563_000_000, 11.95), 716_400_000);

// No reliable cross-check → unchanged (missing/zero EPS, non-positive shares, null).
assert.strictEqual(normalizeDilutedShares(716.4, 8_563_000_000, null), 716.4);
assert.strictEqual(normalizeDilutedShares(716.4, 8_563_000_000, 0), 716.4);
assert.strictEqual(normalizeDilutedShares(716.4, null, 11.95), 716.4);
assert.strictEqual(normalizeDilutedShares(null, 1, 1), null);
assert.strictEqual(normalizeDilutedShares(0, 1, 1), 0);

// Negative earnings (loss): abs() keeps the scale detection working.
assert.strictEqual(normalizeDilutedShares(716.4, -8_563_000_000, -11.95), 716_400_000);

// --- deflateOverScaledShares: 股数标大 10^k(NI/EPS + 同公司其它期两个信号同时成立才缩) ---
{
  const row = (shares: number | null, ni: number | null, eps: number | null, is_derived = false) => ({ shares_diluted: shares, net_income: ni, eps_diluted: eps, is_derived });
  // WAT 2026:Q1/Q2 标成 821 亿/982 亿,历史约 5970 万 → 各缩 1e3
  const wat = deflateOverScaledShares([
    row(59_656_000, 147_111_000, 2.47), row(59_622_000, 148_923_000, 2.5), row(59_706_000, 642_629_000, 10.76),
    row(82_139_000_000, -72_000_000, -0.87), row(98_204_000_000, -136_000_000, -1.39),
  ]);
  assert.deepStrictEqual(wat.map((r) => r.shares_diluted), [59_656_000, 59_622_000, 59_706_000, 82_139_000, 98_204_000]);
  // TBLA 2026 Q2:2914 亿,EPS 只到分(0.01)隐含 4.3 亿也能定出 1e3
  const tbla = deflateOverScaledShares([row(313_572_282, -4_345_000, -0.01), row(288_764_244, 59_066_000, 0.2), row(291_392_907_000, 4_317_000, 0.01)]);
  assert.strictEqual(tbla[2].shares_diluted, 291_392_907);
  // HAL 型:股数对、NI 量级错(隐含 878)→ 与参照一致,不动
  const hal = deflateOverScaledShares([row(881_000_000, 881_000, 1.0), row(886_000_000, 886_000_000, 1.0), row(891_000_000, 891_000_000, 1.0)]);
  assert.deepStrictEqual(hal.map((r) => r.shares_diluted), [881_000_000, 886_000_000, 891_000_000]);
  // 无参照(只有一期)→ 不动
  assert.strictEqual(deflateOverScaledShares([row(98_204_000_000, -136_000_000, -1.39)])[0].shares_diluted, 98_204_000_000);
  // 派生行(Q4 垃圾股数)不当参照
  const withDerived = deflateOverScaledShares([row(98_204_000_000, -136_000_000, -1.39), row(-116_000, 1, 1, true)]);
  assert.strictEqual(withDerived[0].shares_diluted, 98_204_000_000);
}

console.log("normalizeDilutedShares.check.ts: OK");
