import { cleanIssuer } from "@/lib/format";
import { isLikelyTicker } from "@/lib/externalLinks";

/**
 * 发行人/机构名展示原语:清洗后的名称 + 可选 ticker 徽章。
 * 名称本身不带样式(继承外层 Link/字体),仅 ticker 徽章自带弱化样式。
 * 表格里用 truncate + ticker shrink-0，避免长名换行把 ticker 甩到怪位置。
 */
export function EntityName({
  issuer,
  ticker,
}: {
  issuer: string;
  ticker?: string | null;
}) {
  return (
    <span className="inline-flex min-w-0 max-w-full items-baseline gap-1.5">
      <span className="min-w-0 truncate">{cleanIssuer(issuer)}</span>
      {ticker && isLikelyTicker(ticker) && (
        <span className="shrink-0 font-mono text-[10px] uppercase tracking-[0.06em] text-[var(--tt-faint)]">
          {ticker}
        </span>
      )}
    </span>
  );
}
