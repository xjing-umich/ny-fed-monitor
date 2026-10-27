import { ogCard, OG_SIZE, OG_CONTENT_TYPE } from "@/lib/ogCard";
import { getCusipMap, tickerToCusips } from "@/lib/managers/securities";
import { cleanIssuer } from "@/lib/format";
import { stockDisplayName } from "@/lib/stocks/zhNames";

export const alt = "Who's holding — Compounder";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;
// 静态缓存:否则 [lang] 段下的 OG 图每次被抓取都在函数里重绘 PNG(计入 Vercel Fluid Active CPU)。
export const dynamic = "force-static";
export const revalidate = 604800;

export default async function Image({
  params,
}: {
  params: Promise<{ lang: string; ticker: string }>;
}) {
  const { lang, ticker } = await params;
  const isEn = lang !== "zh";

  const cusips = await tickerToCusips(ticker);
  const cusipMap = await getCusipMap();
  let issuer = ticker;
  for (const c of cusips) {
    const info = cusipMap.get(c);
    if (info?.name) {
      issuer = stockDisplayName(isEn ? "en" : "zh", ticker, cleanIssuer(info.name));
      break;
    }
  }

  return ogCard({
    eyebrow: `Stocks · ${ticker}`,
    title: isEn ? `Who's holding ${issuer}?` : `谁在持有 ${issuer}？`,
    subtitle: isEn
      ? "Superinvestor 13F holders & position sizes"
      : "超级投资者持仓与仓位分布",
  });
}
