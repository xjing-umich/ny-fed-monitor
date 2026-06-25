import assert from "node:assert";
import { normalizeDilutedShares } from "./normalize-facts";

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

console.log("normalizeDilutedShares.check.ts: OK");
