/**
 * 分析口径的“谁不算”：内部浏览器与自动化浏览器的访问不进任何分析工具。
 *
 * - 内部：打开任意页面带 ?tc_internal=1，本浏览器即被标记（localStorage，长期有效）；
 *   ?tc_internal=0 取消。团队自己的电脑、调试用的浏览器都打一次即可。
 * - 自动化：navigator.webdriver 为真（Playwright / Puppeteer / Selenium / CDP 驱动的 Chrome），
 *   或 UA 带无头/爬虫特征，或是 Claude 桌面应用的内置浏览器（UA 含 Claude/x.y，开发验收与截图用）。
 *   Vercel 自带的爬虫过滤只看 UA，挡不住伪装成普通 Chrome 的无头浏览器。
 *
 * 纯函数（parseInternalParam / exclusionReason）不碰 window，便于 exclusion.check.ts 测试；
 * syncInternalFlag / isExcluded 只在浏览器里调用。
 */

export const INTERNAL_PARAM = "tc_internal";
const INTERNAL_STORAGE_KEY = "tc_internal";

const AUTOMATION_UA = /HeadlessChrome|Lighthouse|PhantomJS|Puppeteer|Playwright|\bClaude\/\d|bot\b|crawler|spider/i;

export type ExclusionReason = "internal" | "automation";

/** ?tc_internal=1 → true（标记），=0 → false（取消），其它/缺省 → null（不改动）。 */
export function parseInternalParam(search: string): boolean | null {
  const v = new URLSearchParams(search).get(INTERNAL_PARAM);
  if (v === "1") return true;
  if (v === "0") return false;
  return null;
}

export function exclusionReason(env: {
  internalFlag: string | null;
  webdriver: boolean;
  userAgent: string;
}): ExclusionReason | null {
  if (env.internalFlag === "1") return "internal";
  if (env.webdriver || AUTOMATION_UA.test(env.userAgent)) return "automation";
  return null;
}

function readFlag(): string | null {
  try {
    return window.localStorage.getItem(INTERNAL_STORAGE_KEY);
  } catch {
    return null; // 隐私模式/禁用存储：按非内部处理
  }
}

/** 把 URL 上的开关写进 localStorage。须在任何分析工具初始化前调用。 */
export function syncInternalFlag(): void {
  const next = parseInternalParam(window.location.search);
  if (next === null) return;
  try {
    if (next) window.localStorage.setItem(INTERNAL_STORAGE_KEY, "1");
    else window.localStorage.removeItem(INTERNAL_STORAGE_KEY);
  } catch {
    /* storage unavailable — ignore */
  }
}

/** 本次页面访问是否排除在分析之外。每次调用重新读，?tc_internal 切换后无需刷新缓存。 */
export function isExcluded(): boolean {
  if (typeof window === "undefined") return true;
  return (
    exclusionReason({
      internalFlag: readFlag(),
      webdriver: navigator.webdriver === true,
      userAgent: navigator.userAgent,
    }) !== null
  );
}
