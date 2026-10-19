/**
 * scripts/lib/color.ts 的单元断言。跑法:cd web && npx tsx scripts/color.check.ts
 */
import { contrastRatio, oklchToHex, parseOklch } from "./lib/color";

function assert(c: boolean, m: string) { if (!c) { console.error("FAIL:", m); process.exit(1); } }

assert(oklchToHex(1, 0, 0) === "#ffffff", `白, got ${oklchToHex(1, 0, 0)}`);
assert(oklchToHex(0, 0, 0) === "#000000", `黑, got ${oklchToHex(0, 0, 0)}`);
// spec 2.2 表中的换算值
assert(oklchToHex(0.47, 0.105, 158) === "#0e6c43", `brand light, got ${oklchToHex(0.47, 0.105, 158)}`);
assert(oklchToHex(0.175, 0.01, 165) === "#0c120f", `canvas dark, got ${oklchToHex(0.175, 0.01, 165)}`);
assert(oklchToHex(0.54, 0.13, 65) === "#a15b00", `val-above light, got ${oklchToHex(0.54, 0.13, 65)}`);

assert(Math.abs(contrastRatio("#000000", "#ffffff") - 21) < 1e-9, "黑白 21:1");
assert(Math.abs(contrastRatio("#ffffff", "#000000") - 21) < 1e-9, "顺序无关");
assert(contrastRatio("#777777", "#ffffff").toFixed(2) === "4.48", `#777 on white, got ${contrastRatio("#777777", "#ffffff")}`);

const p = parseOklch("oklch(0.985 0.004 165)");
assert(p !== null && p[0] === 0.985 && p[1] === 0.004 && p[2] === 165, "parse 三元");
assert(JSON.stringify(parseOklch("oklch(1 0 0)")) === "[1,0,0]", "parse 整数");
assert(parseOklch("#ffffff") === null, "非 oklch 返回 null");
assert(parseOklch("var(--canvas)") === null, "var() 返回 null");

console.log("color.check OK");
