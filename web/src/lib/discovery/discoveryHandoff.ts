// 上下文感知"下一步"出口的文案+链接。纯函数(无 "server-only", 仅 import type),
// 可被 .check.ts 裸 `npx tsx` 跑。守 [[valuation-philosophy-constraint]]: 只陈述事实, 不荐买卖。
import type { Lang } from "@/lib/nav";
import type { ValuationVerdict } from "@/lib/valuation/deriveValuationVerdict";
import { localePath } from "@/lib/urls";

export type DiscoveryCta = { eyebrow: string; line: string; href: string; ctaLabel: string };

const EYEBROW: Record<Lang, string> = { zh: "下一步 · 值不值", en: "Next · is it cheap" };

function screenerHref(lang: Lang, view?: "strike_zone" | "below"): string {
  return view ? localePath(lang, `/stocks/screener?view=${view}`) : localePath(lang, "/stocks/screener");
}

/** 个股页: 按估值档位给出延伸到 screener 的观察邀请。verdict=null / 不可信 → 兜底。 */
export function stockHandoffFor(verdict: ValuationVerdict | null, ticker: string, lang: Lang): DiscoveryCta {
  const zh = lang === "zh";
  const eyebrow = EYEBROW[lang];
  const T = ticker.toUpperCase();

  if (!verdict || !verdict.reliable) {
    return {
      eyebrow,
      href: screenerHref(lang),
      line: zh ? "想知道现在哪些股票相对保守价值带便宜？" : "Want to see which stocks look cheap against a conservative value band?",
      ctaLabel: zh ? "浏览全部可估值股票，按价值带排序" : "Browse all valued stocks, ranked by value band",
    };
  }
  if (verdict.inStrikeZone) {
    return {
      eyebrow,
      href: screenerHref(lang, "strike_zone"),
      line: zh ? `${T} 现价落在保守价值带下方。` : `${T}'s price sits below its conservative value band.`,
      ctaLabel: zh ? "看全市场还有哪些落在击球区" : "See which other stocks are in the strike zone",
    };
  }
  if (verdict.bucket === "below") {
    return {
      eyebrow,
      href: screenerHref(lang, "below"),
      line: zh ? `${T} 现价低于保守价值带。` : `${T}'s price is below its conservative value band.`,
      ctaLabel: zh ? "按安全边际浏览全部低估股" : "Browse all undervalued stocks by margin of safety",
    };
  }
  return {
    eyebrow,
    href: screenerHref(lang, "strike_zone"),
    line: zh ? `${T} 现价不低于保守价值带。` : `${T}'s price is not below its conservative value band.`,
    ctaLabel: zh ? "看看现在哪些股票落在击球区" : "See which stocks are in the strike zone right now",
  };
}

/** 投资人页: 把"这个人的击球区持仓"延伸到全市场击球区清单。 */
export function investorHandoffFor(strikeCount: number, person: string, lang: Lang): DiscoveryCta {
  const zh = lang === "zh";
  const eyebrow = EYEBROW[lang];
  if (strikeCount > 0) {
    return {
      eyebrow,
      href: screenerHref(lang, "strike_zone"),
      line: zh
        ? `${person} 有 ${strikeCount} 只持仓现价落在击球区。`
        : `${person} holds ${strikeCount} position${strikeCount === 1 ? "" : "s"} now in the strike zone.`,
      ctaLabel: zh ? "看全市场击球区清单" : "See the full strike-zone list",
    };
  }
  return {
    eyebrow,
    href: screenerHref(lang, "below"),
    line: zh ? `${person} 当前无持仓落在击球区。` : `${person} has no positions in the strike zone right now.`,
    ctaLabel: zh ? "按价值带浏览全市场" : "Browse the whole market by value band",
  };
}
