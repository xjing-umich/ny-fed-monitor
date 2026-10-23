/**
 * 守字阶 v2:globals.css 无 <12px 字号、字阶覆盖齐全、font-data/font-code 已定义。
 * 并扫描 src:禁任意值字号 / font-mono / 非暂缓文件的 uppercase。
 * spec: docs/superpowers/specs/2026-10-19-design-tokens-type-v2-design.md §2.4
 * 跑法:cd web && npx tsx scripts/type-scale.check.ts
 */
import fs from "node:fs";
import path from "node:path";

const failures: string[] = [];
const CSS = fs.readFileSync(path.join(__dirname, "../src/app/globals.css"), "utf8");

// 1. globals.css 中任何 font-size 不得小于 12px / 0.75rem
for (const m of CSS.matchAll(/font-size:\s*([\d.]+)(px|rem)/g)) {
  const px = m[2] === "rem" ? Number(m[1]) * 16 : Number(m[1]);
  if (px < 12) failures.push(`globals.css font-size ${m[0]} < 12px`);
}

// 2. 字阶覆盖齐全(值与 spec §2.4 一致)
const SCALE: Record<string, string> = {
  xs: "0.75rem", sm: "0.875rem", base: "0.9375rem", lg: "1.0625rem",
  xl: "1.25rem", "2xl": "1.375rem", "3xl": "1.75rem", "4xl": "2.125rem", "5xl": "2.5rem",
};
for (const [k, v] of Object.entries(SCALE)) {
  if (!new RegExp(`--text-${k}:\\s*${v.replace(".", "\\.")};`).test(CSS)) failures.push(`缺少 --text-${k}: ${v}`);
}

// 3. 新工具类已定义,旧的 .font-mono 覆盖已移除
if (!/\.font-data\s*\{[^}]*tabular-nums/.test(CSS)) failures.push("缺少 .font-data(需含 tabular-nums)");
if (!/\.font-code\s*\{[^}]*--font-geist-mono/.test(CSS)) failures.push("缺少 .font-code(Geist Mono)");
if (/\.font-mono\s*\{/.test(CSS)) failures.push(".font-mono 覆盖应已删除");

// 4. 眉标/标签不再大写
for (const cls of ["tt-eyebrow", "tt-label", "tt-faint-label"]) {
  const body = CSS.match(new RegExp(`\\.${cls}\\s*\\{([^}]*)\\}`))?.[1];
  if (!body) failures.push(`缺少 .${cls}`);
  else if (/text-transform:\s*uppercase/.test(body)) failures.push(`.${cls} 仍是 uppercase`);
}

// 5. src 扫描:禁止任意值字号与 font-mono;uppercase 只许出现在暂缓文件
const SRC = path.join(__dirname, "../src");
const DEFERRED = new Set([
  "components/common/Badge.tsx",
  "components/shell/MoveTag.tsx",
  "components/entity/VerdictChip.tsx",
  "components/valuation/ValuationBadge.tsx",
]);
function walk(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const full = path.join(dir, e.name);
    return e.isDirectory() ? walk(full) : /\.(ts|tsx)$/.test(e.name) ? [full] : [];
  });
}
function stripComments(s: string): string {
  return s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
}
for (const abs of walk(SRC)) {
  const rel = path.relative(SRC, abs).split(path.sep).join("/");
  if (rel.startsWith("components/ui/") || rel.endsWith("opengraph-image.tsx") || rel === "lib/ogCard.tsx" || rel.endsWith(".check.ts")) continue;
  const lines = stripComments(fs.readFileSync(abs, "utf8")).split("\n");
  lines.forEach((ln, i) => {
    const at = `${rel}:${i + 1}`;
    if (/text-\[\d+(?:\.\d+)?px\]/.test(ln)) failures.push(`${at} 任意值字号: ${ln.trim()}`);
    if (!DEFERRED.has(rel) && /(?<![\w-])font-mono(?![\w-])/.test(ln)) failures.push(`${at} font-mono(用 font-data / font-code): ${ln.trim()}`);
    if (!DEFERRED.has(rel) && /(?:["'`\s:])uppercase(?=["'`\s])/.test(ln)) failures.push(`${at} uppercase: ${ln.trim()}`);
  });
}

if (failures.length) { failures.forEach((f) => console.error("FAIL:", f)); process.exit(1); }
console.log("type-scale.check OK");
