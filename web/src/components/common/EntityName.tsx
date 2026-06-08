import { cleanIssuer } from "@/lib/format";
import { isLikelyTicker } from "@/lib/externalLinks";

/**
 * 发行人/机构名展示原语:清洗后的名称 + 可选 ticker 徽章。
 * 名称本身不带样式(继承外层 Link/字体),仅 ticker 徽章自带弱化样式。
 * 用于全站表格/卡片,统一 cleanIssuer + ticker 判定逻辑。
 */
export function EntityName({
  issuer,
  ticker,
}: {
  issuer: string;
  ticker?: string | null;
}) {
  return (
    <>
      {cleanIssuer(issuer)}
      {ticker && isLikelyTicker(ticker) && (
        <span className="ml-2 font-mono text-[10px] uppercase tracking-[0.06em] text-[var(--tt-faint)]">
          {ticker}
        </span>
      )}
    </>
  );
}
