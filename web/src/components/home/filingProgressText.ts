import type { Lang } from "@/lib/nav";
import { excludedClause } from "@/lib/freshness/excludedClause";

/** 首页申报进度行。分母 = 应申报 M(isExpectedFiler);上季未申报的人数写在括号里。 */
export function filingProgressText(
  lang: Lang,
  q: string,
  c: { filed: number; total: number; excluded: number },
  deadline: string,
): string {
  if (lang === "zh") {
    return `${q} 申报进行中 · ${c.total} 位中 ${c.filed} 位已交${excludedClause(c.excluded, "zh")} · ${deadline}截止后切换`;
  }
  return `${q} filings arriving · ${c.filed} of ${c.total} in${excludedClause(c.excluded, "en")} · switches after ${deadline}`;
}
