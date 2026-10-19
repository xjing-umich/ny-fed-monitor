/**
 * 字阶 v2 codemod(一次性):把 class 串中的任意值字号、font-mono、装饰性 uppercase 换成 v2 用法。
 * spec: docs/superpowers/specs/2026-10-19-design-tokens-type-v2-design.md §2.4 / §3
 *
 * 跑法(在 web/ 下):
 *   npx tsx scripts/codemods/type-v2.ts           # dry-run,打印每条变更
 *   npx tsx scripts/codemods/type-v2.ts --write   # 写回文件
 */
import fs from "node:fs";
import path from "node:path";

export type Mode = "full" | "size-only";
export type Change = { line: number; before: string; after: string; child: string };

const SIZE_MAP: Array<[string, string]> = [
  ["text-[10px]", "text-xs"],
  ["text-[11px]", "text-xs"],
  ["text-[12px]", "text-xs"],
  ["text-[13px]", "text-sm"],
  ["text-[15px]", "text-base"],
];

/** 元素的第一个子节点是 ticker/titleMeta 表达式 → 该元素用 font-code。 */
const TICKER_CHILD = /^[^<>{}]*>\s*\{[\w.?]*(?:[tT]icker|titleMeta)\}/;
/** 看起来像 Tailwind class 串(避免误伤普通文案里的 "uppercase" 一词)。 */
const CLASSY = /(?:^|\s)(?:\S*:)?(?:text|font|tracking|px|py|rounded|border|bg|inline|flex|leading)-/;
const HAS_UPPERCASE = /(?:^|\s|:)uppercase(?=\s|$)/;
const STRIP_TOKEN = /^(?:\S*:)?(?:uppercase|tracking-(?:wide|wider|widest|\[0?\.\d+em\]))$/;
const FONT_MONO = /(?<![\w-])font-mono(?![\w-])/g;

/** 跳过平衡的 ${ … },返回闭合 } 之后的位置;内部的双引号/反引号字面量整体跳过。 */
function skipExpr(src: string, i: number): number {
  let depth = 1;
  while (i < src.length && depth > 0) {
    const ch = src[i];
    if (ch === '"') { i = skipQuoted(src, i); continue; }
    if (ch === "`") { i = skipTemplate(src, i); continue; }
    if (ch === "{") depth++;
    else if (ch === "}") depth--;
    i++;
  }
  return i;
}

/** i 指向开头的 `;返回闭合 ` 之后的位置。 */
function skipTemplate(src: string, i: number): number {
  i++;
  while (i < src.length) {
    const ch = src[i];
    if (ch === "\\") { i += 2; continue; }
    if (ch === "`") return i + 1;
    if (ch === "$" && src[i + 1] === "{") { i = skipExpr(src, i + 2); continue; }
    i++;
  }
  return i;
}

/** i 指向开头的 ";返回闭合 " 之后的位置;遇换行视为未闭合,返回 i+1。 */
function skipQuoted(src: string, i: number): number {
  let j = i + 1;
  while (j < src.length) {
    const ch = src[j];
    if (ch === "\\") { j += 2; continue; }
    if (ch === "\n") return i + 1;
    if (ch === '"') return j + 1;
    j++;
  }
  return i + 1;
}

export function findLiterals(src: string): Array<{ start: number; end: number }> {
  const out: Array<{ start: number; end: number }> = [];
  let i = 0;
  while (i < src.length) {
    const ch = src[i];
    if (ch === "/" && src[i + 1] === "/") {
      const nl = src.indexOf("\n", i);
      i = nl === -1 ? src.length : nl;
      continue;
    }
    if (ch === "/" && src[i + 1] === "*") {
      const e = src.indexOf("*/", i + 2);
      i = e === -1 ? src.length : e + 2;
      continue;
    }
    if (ch === '"') {
      const next = skipQuoted(src, i);
      if (src[next - 1] === '"' && next - 1 > i) out.push({ start: i + 1, end: next - 1 });
      i = next;
      continue;
    }
    if (ch === "`") {
      const next = skipTemplate(src, i);
      out.push({ start: i + 1, end: next - 1 });
      i = next;
      continue;
    }
    i++;
  }
  return out;
}

export function transformClassString(s: string, mode: Mode, child: string): string {
  let out = s;
  for (const [from, to] of SIZE_MAP) out = out.split(from).join(to);
  if (mode === "size-only") return out;

  FONT_MONO.lastIndex = 0;
  if (FONT_MONO.test(out)) {
    FONT_MONO.lastIndex = 0;
    out = out.replace(FONT_MONO, TICKER_CHILD.test(child) ? "font-code" : "font-data");
  }

  if (CLASSY.test(out) || /^\s*uppercase\b/.test(out)) {
    if (HAS_UPPERCASE.test(out)) {
      const lead = out.match(/^\s*/)![0];
      const trail = out.match(/\s*$/)![0];
      const kept = out.trim().split(/\s+/).filter((t) => !STRIP_TOKEN.test(t));
      out = kept.length ? lead + kept.join(" ") + trail : "";
    }
  }
  return out;
}

export function transformSource(src: string, mode: Mode): { out: string; changes: Change[] } {
  const changes: Change[] = [];
  let out = "";
  let last = 0;
  for (const { start, end } of findLiterals(src)) {
    const before = src.slice(start, end);
    const child = src.slice(end + 1, end + 201);
    const after = transformClassString(before, mode, child);
    out += src.slice(last, start) + after;
    last = end;
    if (after !== before) {
      changes.push({ line: src.slice(0, start).split("\n").length, before, after, child: child.slice(0, 60) });
    }
  }
  out += src.slice(last);
  return { out, changes };
}

// ── CLI ──────────────────────────────────────────────────────────────────────

const SIZE_ONLY_FILES = new Set([
  "src/components/common/Badge.tsx",
  "src/components/shell/MoveTag.tsx",
  "src/components/entity/VerdictChip.tsx",
  "src/components/valuation/ValuationBadge.tsx",
  "src/components/entity/QuarterMovesPill.tsx",
]);

function excluded(rel: string): boolean {
  return (
    rel.startsWith("src/components/ui/") ||
    rel.endsWith("opengraph-image.tsx") ||
    rel === "src/lib/ogCard.tsx" ||
    rel.endsWith(".check.ts")
  );
}

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...walk(full));
    else if (/\.(ts|tsx)$/.test(e.name)) out.push(full);
  }
  return out;
}

if (require.main === module) {
  const root = path.join(__dirname, "../..");
  const write = process.argv.includes("--write");
  let files = 0, total = 0;
  for (const abs of walk(path.join(root, "src"))) {
    const rel = path.relative(root, abs).split(path.sep).join("/");
    if (excluded(rel)) continue;
    const mode: Mode = SIZE_ONLY_FILES.has(rel) ? "size-only" : "full";
    const src = fs.readFileSync(abs, "utf8");
    const { out, changes } = transformSource(src, mode);
    if (!changes.length) continue;
    files++;
    total += changes.length;
    for (const c of changes) {
      const flag = /uppercase/.test(c.before) && !/uppercase/.test(c.after) ? " [-UPPER]" : "";
      console.log(`${rel}:${c.line}${flag}\n  - ${c.before.trim()}\n  + ${c.after.trim()}\n  child: ${JSON.stringify(c.child)}`);
    }
    if (write) fs.writeFileSync(abs, out);
  }
  console.log(`\n${write ? "WROTE" : "DRY-RUN"}: ${total} changes in ${files} files`);
}
