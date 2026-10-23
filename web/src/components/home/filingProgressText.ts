import type { Lang } from "@/lib/nav";

/** 首页申报进度行。分母 = 应申报 M(isExpectedFiler);上季未申报的人数写在括号里。 */
export function filingProgressText(
  lang: Lang,
  q: string,
  c: { filed: number; total: number; excluded: number },
  deadline: string,
): string {
  if (lang === "zh") {
    const ex = c.excluded > 0 ? `（另有 ${c.excluded} 位上季未申报，不计入）` : "";
    return `${q} 申报进行中 · ${c.total} 位中 ${c.filed} 位已交${ex} · ${deadline}截止后切换`;
  }
  const ex =
    c.excluded > 0
      ? ` (${c.excluded} more missed last quarter and ${c.excluded === 1 ? "isn't" : "aren't"} counted)`
      : "";
  return `${q} filings arriving · ${c.filed} of ${c.total} in${ex} · switches after ${deadline}`;
}
