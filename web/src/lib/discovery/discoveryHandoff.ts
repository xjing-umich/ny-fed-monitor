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
      line: zh ? "看哪些股票现价低于内在价值。" : "See which stocks trade below intrinsic value.",
      ctaLabel: zh ? "浏览全部可估值股票" : "Browse all valued stocks",
    };
  }
  if (verdict.inStrikeZone) {
    return {
      eyebrow,
      href: screenerHref(lang, "strike_zone"),
      line: zh ? `${T} 现价低于买入线（内在价值扣除安全边际）。` : `${T}'s price is below the buy line (intrinsic value minus a margin of safety).`,
      ctaLabel: zh ? "看全市场击球区" : "See the full strike-zone list",
    };
  }
  if (verdict.bucket === "below") {
    return {
      eyebrow,
      href: screenerHref(lang, "below"),
      line: zh ? `${T} 现价低于内在价值。` : `${T}'s price is below its intrinsic value.`,
      ctaLabel: zh ? "按安全边际浏览全部低估股" : "Browse all undervalued stocks by margin of safety",
    };
  }
  return {
    eyebrow,
    href: screenerHref(lang, "strike_zone"),
    line: zh ? `${T} 现价不低于内在价值。` : `${T}'s price is not below its intrinsic value.`,
    ctaLabel: zh ? "看当前击球区股票" : "See current strike-zone stocks",
  };
}

/** 投资人页: 把"这个人的击球区持仓"延伸到全市场击球区清单。pendingNames=便宜但待确认的持仓名(不计入 strikeCount)。 */
export function investorHandoffFor(strikeCount: number, person: string, lang: Lang, pendingNames: string[] = []): DiscoveryCta {
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
  // 零已确认:不说"没有",照实写明还有几只待确认(最多列 3 个名字)
  const n = pendingNames.length;
  const shown = pendingNames.slice(0, 3);
  const rest = n - shown.length;
  const tailZh = n > 0 ? `，另有 ${n} 只待确认（${shown.join("、")}${rest > 0 ? ` 等 ${n} 只` : ""}）` : "";
  const tailEn =
    n > 0
      ? `; ${n} more ${n === 1 ? "is" : "are"} pending (${
          rest > 0
            ? `${shown.join(", ")} and ${rest} more`
            : shown.length > 1
              ? `${shown.slice(0, -1).join(", ")} and ${shown[shown.length - 1]}`
              : shown[0]
        })`
      : "";
  return {
    eyebrow,
    href: screenerHref(lang, "below"),
    line: zh
      ? `${person} 目前没有已确认的击球区持仓${tailZh}。`
      : `${person} has no confirmed strike-zone positions right now${tailEn}.`,
    ctaLabel: zh ? "按安全边际浏览低于内在价值的股票" : "Browse stocks below intrinsic value by margin of safety",
  };
}
