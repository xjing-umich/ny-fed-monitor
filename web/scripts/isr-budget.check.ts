/**
 * 守 Vercel Hobby 额度:防止 ISR 周期被改短、OG 图变动态、中间件回归。
 *
 * 存在的理由:2026-10 超额(ISR Writes 874K/200K、Fluid CPU 8.5h/4h、Origin Transfer
 * 10.9GB/10GB),根因是 FRED fetch 的 `next: { revalidate: 3600 }` 把整页 revalidate
 * 压成 1 小时 —— 约 2000 个个股页每小时重生成。Next 取页面树里**最小**的 revalidate,
 * 任何一处(page / layout / OG 图 / 某个 fetch)调短都会拖垮全站,且构建时不报错。
 * 修复见 PR #201,这里把它钉住。
 *
 * 规则:
 *   1. src/app/** 里 `export const revalidate` 不得低于 MIN_SECONDS(3 天);`false` 视为不过期。
 *   2. src/app/** 和 src/lib/** 里的 `revalidate: N`(fetch 的 next 选项、unstable_cache 等)同上。
 *   3. 每个 opengraph-image / twitter-image 必须 `export const dynamic = "force-static"`。
 *   4. 不得出现 proxy / middleware(每个请求都会跑函数,吃 Fluid CPU)。
 *   例外只能进 ALLOWLIST,且值必须精确匹配 —— 改了值要回来重新评估。
 *
 * 跑法:cd web && npx tsx scripts/isr-budget.check.ts
 */
import fs from "node:fs";
import path from "node:path";

const WEB = path.join(__dirname, "..");
const SRC = path.join(WEB, "src");
const MIN_SECONDS = 259200; // 3 天,列表页的节奏;详情页 7 天

/** 低于 MIN_SECONDS 的例外。key 为相对 web/ 的路径,value 必须与文件中的值完全一致。 */
const ALLOWLIST: Record<string, { value: number; reason: string }> = {
  "src/app/sitemap.ts": {
    value: 86400,
    reason:
      "单个 URL(/sitemap.xml),日级重验每月约 30 次写入,对额度可忽略;" +
      "爬虫需要及时看到新报告/新个股,不值得拉到 3 天",
  },
};

const failures: string[] = [];
const seenAllowed = new Set<string>();

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full));
    else if (/\.(ts|tsx|js|jsx|mjs)$/.test(entry.name)) out.push(full);
  }
  return out;
}

/** 去注释,避免注释里的示例误报。`(^|[^:])//` 避开字符串里的 https://。 */
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
}

/** 解析数字字面量或只含数字和 + * 的常量表达式(如 60 * 60 * 24 * 3);其它返回 null。 */
function evalSeconds(expr: string): number | "false" | null {
  const e = expr.trim();
  if (e === "false") return "false";
  if (!/^[\d_\s+*()]+$/.test(e)) return null;
  return Function(`"use strict"; return (${e.replace(/_/g, "")});`)() as number;
}

const rel = (f: string) => path.relative(WEB, f);

function checkValue(file: string, line: number, raw: string, what: string) {
  const loc = `${rel(file)}:${line}`;
  const v = evalSeconds(raw);
  if (v === "false") return;
  if (v === null) {
    failures.push(`${loc} ${what} ${raw.trim()} 无法静态解析 —— 请写成数字字面量,便于本检查把关`);
    return;
  }
  if (v >= MIN_SECONDS) return;
  const allowed = ALLOWLIST[rel(file)];
  if (allowed) {
    seenAllowed.add(rel(file));
    if (allowed.value === v) return;
    failures.push(`${loc} ${what} ${v}s 与 ALLOWLIST 登记的 ${allowed.value}s 不符 —— 请重新评估后更新白名单`);
    return;
  }
  failures.push(
    `${loc} ${what} ${v}s < ${MIN_SECONDS}s(3 天)—— 会把整页 ISR 周期压短、吃 Hobby 额度;` +
      `确需例外请加进 ALLOWLIST 并写明理由`
  );
}

const lineOf = (src: string, idx: number) => src.slice(0, idx).split("\n").length;

// 规则 1 + 2
const appFiles = walk(path.join(SRC, "app"));
for (const file of [...appFiles, ...walk(path.join(SRC, "lib"))]) {
  const src = stripComments(fs.readFileSync(file, "utf8"));
  for (const m of src.matchAll(/export\s+const\s+revalidate\s*(?::[^=]+)?=\s*([^;\n]+)/g)) {
    checkValue(file, lineOf(src, m.index!), m[1], "export const revalidate =");
  }
  for (const m of src.matchAll(/\brevalidate\s*:\s*([^,}\n]+)/g)) {
    checkValue(file, lineOf(src, m.index!), m[1], "fetch/cache 选项 revalidate:");
  }
}

// 规则 3
for (const file of appFiles) {
  if (!/(opengraph|twitter)-image\.(tsx?|jsx?)$/.test(file)) continue;
  const src = stripComments(fs.readFileSync(file, "utf8"));
  if (!/export\s+const\s+dynamic\s*=\s*["']force-static["']/.test(src)) {
    failures.push(`${rel(file)} 缺少 export const dynamic = "force-static" —— OG 图会按请求动态生成`);
  }
}

// 规则 4:Next 16 叫 proxy,旧名 middleware;可放在 web/ 根或 src/ 下。
for (const dir of [WEB, SRC]) {
  for (const name of ["proxy", "middleware"]) {
    for (const ext of ["ts", "tsx", "js", "mjs"]) {
      const f = path.join(dir, `${name}.${ext}`);
      if (fs.existsSync(f)) {
        failures.push(`${rel(f)} 不应存在 —— 每个请求都会跑函数;重定向/重写请放 next.config 的 redirects/rewrites`);
      }
    }
  }
}

// 白名单不能过期:文件没了或值已合规,就该删掉那条。
for (const key of Object.keys(ALLOWLIST)) {
  if (!seenAllowed.has(key)) {
    failures.push(`ALLOWLIST 中的 ${key} 已无对应的低周期值 —— 请从白名单移除`);
  }
}

if (failures.length) {
  console.error("FAIL: isr-budget.check");
  for (const f of failures) console.error("  - " + f);
  process.exit(1);
}

console.log(`isr-budget.check OK (revalidate ≥ ${MIN_SECONDS}s,OG 图均 force-static,无 proxy/middleware)`);
