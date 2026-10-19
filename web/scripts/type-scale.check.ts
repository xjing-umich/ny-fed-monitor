/**
 * 守字阶 v2:globals.css 无 <12px 字号、字阶覆盖齐全、font-data/font-code 已定义。
 * Task 6 会在本文件追加对 src 的扫描。
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

if (failures.length) { failures.forEach((f) => console.error("FAIL:", f)); process.exit(1); }
console.log("type-scale.check OK");
