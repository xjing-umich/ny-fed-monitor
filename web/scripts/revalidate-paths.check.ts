/**
 * 守 DATA_DRIVEN_PATHS 的双向不变量。
 *
 * 存在的理由:revalidatePath 对**不存在或拼错**的路径静默无操作 —— 不抛错、不告警。
 * 路由改名(或新增数据页忘了登记)只会表现为"那一页再也不刷新了",而且要等用户发现
 * 页面数据自相矛盾才暴露。这正是 2026-08 申报季那个 bug 的形状,不能靠人肉记。
 *
 * 不变量:清单里的每条路径 ⟺ 一个带 `export const revalidate` 的 page.tsx。
 * (纯静态页 about/terms/learn 无 revalidate;managers/* 只做 301 重定向、不渲染数据,
 * 两者都不该进清单。)
 *
 * 跑法:cd web && npx tsx scripts/revalidate-paths.check.ts
 */
import fs from "node:fs";
import path from "node:path";
import { DATA_DRIVEN_PATHS } from "../src/lib/revalidate/paths";

const APP_DIR = path.join(__dirname, "../src/app");
const failures: string[] = [];

/** 递归找出所有 page.tsx,返回其路由模式(如 "/[lang]/stocks/[ticker]")。 */
function findPages(dir: string, route = ""): Array<{ route: string; file: string }> {
  const out: Array<{ route: string; file: string }> = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      // 路由组 (foo) 不进 URL;api 目录不是页面。
      if (entry.name === "api") continue;
      const seg = entry.name.startsWith("(") && entry.name.endsWith(")") ? "" : `/${entry.name}`;
      out.push(...findPages(full, route + seg));
    } else if (entry.name === "page.tsx") {
      out.push({ route: route || "/", file: full });
    }
  }
  return out;
}

const pages = findPages(APP_DIR);
const withRevalidate = new Set(
  pages
    .filter((p) => /^export const revalidate\s*=/m.test(fs.readFileSync(p.file, "utf8")))
    .map((p) => p.route)
);
const declared = new Set<string>(DATA_DRIVEN_PATHS);

// 方向一:清单里的路径必须真实存在,且确实是数据页(带 revalidate)。
// 捕获"路由改名/拼错 → revalidatePath 静默失效"。
for (const p of declared) {
  if (!pages.some((page) => page.route === p)) {
    failures.push(`清单中的 ${p} 找不到对应 page.tsx —— revalidatePath 会静默无操作`);
  } else if (!withRevalidate.has(p)) {
    failures.push(`清单中的 ${p} 没有 export const revalidate —— 它要么不是数据页(该移出清单),要么漏了 ISR 兜底`);
  }
}

// 方向二:每个带 revalidate 的数据页都必须登记。
// 捕获"新增数据页忘了登记 → ingest 后它一直发旧数据"。
for (const route of withRevalidate) {
  if (!declared.has(route)) {
    failures.push(`${route} 有 revalidate 但不在 DATA_DRIVEN_PATHS —— ingest 后不会被刷新,会与其它页数据矛盾`);
  }
}

if (failures.length) {
  console.error("FAIL: revalidate-paths.check");
  for (const f of failures) console.error("  - " + f);
  process.exit(1);
}

console.log(`revalidate-paths.check OK (${declared.size} 个数据驱动页,双向一致)`);
