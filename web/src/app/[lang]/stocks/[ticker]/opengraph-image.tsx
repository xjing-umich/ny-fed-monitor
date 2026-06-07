import { ogCard, OG_SIZE, OG_CONTENT_TYPE } from "@/lib/ogCard";
import { getCusipMap, tickerToCusips } from "@/lib/managers/securities";

export const alt = "Who's holding — Compounder";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

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
      issuer = info.name;
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
