/**
 * 守 globals.css 的 v2 令牌:两套主题齐全、以 OKLCH 书写、文字配对 ≥ 4.5:1、发光关闭、无 .light 块。
 * spec: docs/superpowers/specs/2026-10-19-design-tokens-type-v2-design.md §2.2
 * 跑法:cd web && npx tsx scripts/design-tokens.check.ts
 */
import fs from "node:fs";
import path from "node:path";
import { contrastRatio, oklchToHex, parseOklch } from "./lib/color";

const CSS = fs.readFileSync(path.join(__dirname, "../src/app/globals.css"), "utf8");
const failures: string[] = [];

const V2 = [
  "canvas", "surface", "sunk", "line", "line-strong",
  "ink-1", "ink-2", "ink-3",
  "brand", "brand-soft", "on-brand",
  "val-below", "val-below-soft", "val-within", "val-within-soft",
  "val-above", "val-above-soft", "alert", "alert-soft",
] as const;

const PAIRS: Array<[string, string]> = [
  ["ink-1", "canvas"], ["ink-1", "surface"], ["ink-1", "sunk"],
  ["ink-2", "canvas"], ["ink-2", "surface"], ["ink-2", "sunk"],
  ["ink-3", "canvas"], ["ink-3", "surface"], ["ink-3", "sunk"],
  ["brand", "canvas"], ["brand", "surface"], ["brand", "brand-soft"], ["on-brand", "brand"],
  ["val-below", "canvas"], ["val-below", "surface"], ["val-below", "val-below-soft"],
  ["val-within", "canvas"], ["val-within", "surface"], ["val-within", "val-within-soft"],
  ["val-above", "canvas"], ["val-above", "surface"], ["val-above", "val-above-soft"],
  ["alert", "canvas"], ["alert", "surface"], ["alert", "alert-soft"],
  ["ink-1", "brand-soft"], ["ink-2", "brand-soft"],
  ["brand", "sunk"], ["val-above", "sunk"], ["alert", "sunk"],
];

function block(selector: string): string | null {
  const re = new RegExp(`^${selector.replace(".", "\\.")}\\s*\\{([\\s\\S]*?)^\\}`, "m");
  return CSS.match(re)?.[1] ?? null;
}

function decls(body: string): Map<string, string> {
  const out = new Map<string, string>();
  for (const m of body.matchAll(/--([\w-]+)\s*:\s*([^;]+);/g)) out.set(m[1], m[2].trim());
  return out;
}

const root = block(":root");
const dark = block(".dark");
if (!root) failures.push("找不到 :root 块");
if (!dark) failures.push("找不到 .dark 块");
if (/^\.light\s*\{/m.test(CSS)) failures.push(".light 块应已删除(:root 即浅色)");

if (root && dark) {
  const themes = { light: decls(root), dark: new Map([...decls(root), ...decls(dark)]) };
  const darkOwn = decls(dark);
  for (const name of V2) if (!darkOwn.has(name)) failures.push(`.dark 缺少 --${name}`);

  for (const [theme, d] of Object.entries(themes)) {
    const hex = new Map<string, string>();
    for (const name of V2) {
      const raw = d.get(name);
      const p = raw ? parseOklch(raw) : null;
      if (!p) { failures.push(`[${theme}] --${name} 缺失或不是 oklch(): ${raw}`); continue; }
      hex.set(name, oklchToHex(...p));
    }
    for (const [fg, bg] of PAIRS) {
      const a = hex.get(fg), b = hex.get(bg);
      if (!a || !b) continue;
      const r = contrastRatio(a, b);
      if (r < 4.5) failures.push(`[${theme}] --${fg} on --${bg} = ${r.toFixed(2)}:1 < 4.5`);
    }
    for (const g of ["glow-primary", "glow-warn"]) {
      if (d.get(g) !== "none") failures.push(`[${theme}] --${g} 应为 none, got ${d.get(g)}`);
    }
  }
}

if (failures.length) { failures.forEach((f) => console.error("FAIL:", f)); process.exit(1); }
console.log("design-tokens.check OK");
