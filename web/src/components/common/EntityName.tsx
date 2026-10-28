import { cleanIssuer } from "@/lib/format";
import { isLikelyTicker } from "@/lib/externalLinks";
import type { Lang } from "@/lib/nav";
import { stockDisplayName } from "@/lib/stocks/zhNames";

/**
 * 发行人/机构名展示原语:清洗后的名称 + 可选 ticker 徽章。
 * 名称本身不带样式(继承外层 Link/字体),仅 ticker 徽章自带弱化样式。
 * 表格里用 truncate + ticker shrink-0，避免长名换行把 ticker 甩到怪位置。
 * 传 lang 时中文页带通行中文名("苹果 Apple Inc"),与个股页的叫法一致。
 */
export function EntityName({
  issuer,
  ticker,
  lang,
}: {
  issuer: string;
  ticker?: string | null;
  lang?: Lang;
}) {
  const name = lang ? stockDisplayName(lang, ticker ?? "", cleanIssuer(issuer)) : cleanIssuer(issuer);
  return (
    <span className="inline-flex min-w-0 max-w-full items-baseline gap-1.5">
      <span className="min-w-0 truncate">{name}</span>
      {ticker && isLikelyTicker(ticker) && (
        <span className="shrink-0 font-code text-xs text-[var(--tt-faint)]">
          {ticker}
        </span>
      )}
    </span>
  );
}
