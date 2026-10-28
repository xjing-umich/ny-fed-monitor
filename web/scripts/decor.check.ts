/**
 * 守"不承载信息的装饰不保留"(首期路线图·产品原则"精简")：
 * - HUD 角标 .ticks 不再挂到任何组件上
 * - 彩色左/右侧色条(border-l-2 以上 / border-r-2 以上)不做卡片、提示、引文的强调
 * - 渐变字(bg-clip-text)
 * 例外：MobileDrawer 当前项的左边线是导航状态指示，不是装饰。
 * spec: reports/六页全面提升方案 2026-10-28.md §2.9
 * 跑法:cd web && npx tsx scripts/decor.check.ts
 */
import fs from "node:fs";
import path from "node:path";

const failures: string[] = [];
const SRC = path.join(__dirname, "../src");
const ALLOW_SIDE_RULE = new Set(["components/shell/MobileDrawer.tsx"]);

function walk(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const full = path.join(dir, e.name);
    return e.isDirectory() ? walk(full) : /\.tsx?$/.test(e.name) ? [full] : [];
  });
}

for (const abs of walk(SRC)) {
  const rel = path.relative(SRC, abs).split(path.sep).join("/");
  if (rel.startsWith("components/ui/") || rel.endsWith(".check.ts") || rel.endsWith(".check.tsx")) continue;
  fs.readFileSync(abs, "utf8").split("\n").forEach((ln, i) => {
    const at = `${rel}:${i + 1}`;
    if (/className=[^>]*["'`\s]ticks["'`\s]/.test(ln)) failures.push(`${at} HUD 角标 .ticks: ${ln.trim()}`);
    if (!ALLOW_SIDE_RULE.has(rel) && /(?<![\w-])border-[lr]-(?:[2-9]|\[\d+px\])(?![\w-])/.test(ln))
      failures.push(`${at} 彩色侧条(改用整框、底色或不加): ${ln.trim()}`);
    if (/(?<![\w-])bg-clip-text(?![\w-])/.test(ln)) failures.push(`${at} 渐变字: ${ln.trim()}`);
  });
}

if (failures.length) { failures.forEach((f) => console.error("FAIL:", f)); process.exit(1); }
console.log("decor.check OK");
