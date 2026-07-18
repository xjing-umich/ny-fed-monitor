// fundamentalsIntegrity.ts — 基本面口径完整性谓词(纯函数,单一真相)。
// operating_income > revenue 或 gross_profit > revenue 是物理不变量违反(营业费用/COGS 为负,
// 不可能)——通常是 SEC XBRL 营收概念被 ingest 取错单条/分部行(MGRC/多数 REIT 的老年份)。
// 命中即判该公司基本面口径损坏,估值判定整条抑制(语义同拆股口径陈旧,见 deriveValuationVerdict)。
// 只做物理不变量,不含"营收跳变/加速"这类会误伤真收购的软判据。修 XBRL 源头标签是独立数据层待办。
import type { ValuationFloorYear } from "./types";

export function fundamentalsIntegrityViolated(years: ValuationFloorYear[]): boolean {
  for (const y of years) {
    if (y.revenue == null || !(y.revenue > 0)) continue;
    if (y.operating_income != null && y.operating_income > y.revenue) return true;
    if (y.gross_profit != null && y.gross_profit > y.revenue) return true;
  }
  return false;
}
