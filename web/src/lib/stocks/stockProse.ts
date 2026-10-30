import { date as formatDate, weight } from "@/lib/i18n/format";
// 纯确定性正文生成器(无 AI / 无 IO): 从个股页已聚合的 13F 持有人数据派生服务端可见正文。
// 与投资人页正文同思路 —— 数字直接从 13F 精确算出, 每只股票因持有人/权重/本季动向不同而彼此独一无二,
// 回答个股页相对 Yahoo/MarketBeat 的差异化问题:"哪些超级投资者持有本票、本季怎么动的"(SEO_INDEXING_PLAN 任务 2)。
// 纯教育/数据描述, 无买卖建议/目标价/估值判断。

import { snapshotLabel } from "@/lib/datasetTime";
import { investorPath } from "@/lib/urls";
import { formatUSD } from "@/lib/format";
import type { Lang } from "@/lib/nav";

// 段落 segment: 纯字符串, 或一个已解析好 href 的内链(指向投资人页)。
export type LinkedSegment = string | { label: string; href: string };
export type ProseParagraph = LinkedSegment[];

export type StockProseHolder = {
  person: string;
  slug: string;
  value: number;
  weight: number | undefined;
  period?: string;
};

export type StockProseInput = {
  issuer: string;
  ticker: string;
  holders: StockProseHolder[];
  totalValue: number;
  latestPeriod: string;
  /** 已交下一季(latestPeriod 之后)的早申报持有人数与其季度;无 → 不提。 */
  ahead?: { count: number; period: string };
  /** 本季对本票的动作计数(按持有人计, 每人一次): 新进/增持/减持/清仓。 */
  moves: { opened: number; added: number; trimmed: number; exited: number };
};

const pct1 = (w: number | undefined): string | null => (w != null ? weight(w) : null);

/**
 * 生成 2~4 段个股页服务端正文。缺数据的段优雅跳过。holders 为空 → []。
 */
export function buildStockProse(d: StockProseInput, lang: Lang): ProseParagraph[] {
  const en = lang === "en";
  const paras: ProseParagraph[] = [];
  const { issuer, ticker, holders, totalValue, latestPeriod, ahead, moves } = d;
  const n = holders.length;
  if (n === 0) return paras;

  const link = (h: StockProseHolder): LinkedSegment => ({ label: h.person, href: investorPath(lang, h.slug) });
  const byValue = [...holders].sort((a, b) => b.value - a.value);
  const top = byValue[0];
  const topW = pct1(top.weight);

  // ── 段 1: 谁持有 + 规模 + 最大持有人 ───────────────────────────────────────────
  {
    const p: ProseParagraph = [];
    if (en) {
      p.push(
        `${issuer} (${ticker}) is held by ${n} of the superinvestors tracked on Compounder, with a combined ${formatUSD(totalValue, lang)} in reported 13F value. The largest position belongs to `,
        link(top),
        topW ? `, where it makes up ${topW} of the portfolio.` : ".",
      );
    } else {
      p.push(
        `${issuer}（${ticker}）被 Compounder 追踪的 ${n} 位超级投资者持有，合计申报市值 ${formatUSD(totalValue, lang)}。仓位最大的是 `,
        link(top),
        topW ? `，占其组合 ${topW}。` : "。",
      );
    }
    paras.push(p);
  }

  // ── 段 2: 其余主要持有人(按市值, 第 2~4 位) + 各自组合权重 ──────────────────────
  const others = byValue.slice(1, 4);
  if (others.length > 0) {
    const p: ProseParagraph = [];
    p.push(en ? "Other notable holders by value include " : "按市值，其他主要持有人包括 ");
    others.forEach((h, i) => {
      if (i > 0) p.push(i === others.length - 1 ? (en ? " and " : " 和 ") : (en ? ", " : "，"));
      const w = pct1(h.weight);
      p.push(link(h), w ? (en ? ` (${w} of its book)` : `（占其组合 ${w}）`) : "");
    });
    p.push(en ? "." : "。");
    paras.push(p);
  }

  // ── 段 3: 本季动向(任一计数非零才渲染) ─────────────────────────────────────────
  if (moves.opened + moves.added + moves.trimmed + moves.exited > 0) {
    const p: ProseParagraph = [];
    if (en) {
      p.push(
        `In the quarter ended ${formatDate(latestPeriod, lang)}, ${moves.opened} of the tracked filers opened a new position in ${ticker}, ${moves.added} added to existing ones, ${moves.trimmed} trimmed, and ${moves.exited} sold out entirely.`,
      );
    } else {
      p.push(
        `截至 ${formatDate(latestPeriod, lang)} 的这一季，追踪范围内有 ${moves.opened} 位新进 ${ticker}，${moves.added} 位增持，${moves.trimmed} 位减持，${moves.exited} 位清仓。`,
      );
    }
    paras.push(p);
  }

  // ── 段 4: 出处与口径 ──────────────────────────────────────────────────────────
  paras.push(
    en
      ? [
          `Holder counts and values reflect the most recent SEC Form 13F filings, ${snapshotLabel(lang, holders.map((h) => h.period))}.${
            ahead
              ? ` ${ahead.count} investor${ahead.count === 1 ? " has" : "s have"} already filed for the quarter ended ${formatDate(ahead.period, lang)}. Their positions in the table reflect those newer filings, and the move counts on this page cover only ${formatDate(latestPeriod, lang)} filings.`
              : ""
          } Source: SEC EDGAR. A 13F shows only long US-listed positions and can lag the real portfolio by up to 45 days, so this is disclosed long ownership, not a complete picture.`,
        ]
      : [
          `以上持有人数与市值来自最新的 SEC Form 13F 申报，${snapshotLabel(lang, holders.map((h) => h.period))}。${
            ahead
              ? `另有 ${ahead.count} 位投资人已提前提交截至 ${formatDate(ahead.period, lang)} 的申报，表中他们的持仓按这份更新的申报列出；本页的动向统计只计 ${formatDate(latestPeriod, lang)} 季度的申报。`
              : ""
          }来源：SEC EDGAR。13F 仅涵盖美股多头持仓，且可能滞后实际组合最多 45 天，因此这是已披露的多头持有情况，并非完整全貌。`,
        ],
  );

  return paras;
}
