import React from "react";
import { FileText } from "lucide-react";
import { GoogleIcon } from "@/components/icons/GoogleIcon";
import { YahooIcon } from "@/components/icons/YahooIcon";
import { buildExternalFinanceLinks } from "@/lib/externalLinks";
import type { Lang } from "@/lib/nav";
import { cn } from "@/lib/utils";

type Variant = "table" | "detail";

const LABELS = {
  zh: { yahoo: "在 Yahoo Finance 查看", google: "在 Google Finance 查看", sec: "在 SEC EDGAR 查看" },
  en: { yahoo: "View on Yahoo Finance", google: "View on Google Finance", sec: "View on SEC EDGAR" },
} as const;

export function ExternalFinanceLinks({
  ticker,
  variant,
  lang,
  exchange,
}: {
  ticker: string;
  variant: Variant;
  lang: Lang;
  /** Google Finance 交易所代码(如 NASDAQ/NYSE)；缺省则 Google 回退搜索。 */
  exchange?: string | null;
}): React.ReactElement {
  const links = buildExternalFinanceLinks(ticker, exchange);
  const t = LABELS[lang];
  const iconSize = variant === "detail" ? 18 : 15;

  // 第三方链接常驻显示(table 与 detail 一致), 不再 hover 才出现。
  const wrapper = "inline-flex items-center gap-3";

  const linkBase = "inline-flex items-center text-[var(--tt-faint)] transition-colors";

  return (
    <span className={wrapper}>
      <a
        href={links.yahoo}
        target="_blank"
        rel="noopener noreferrer"
        title={`${t.yahoo} (${ticker})`}
        aria-label={`${t.yahoo} (${ticker})`}
        className={cn(linkBase, "hover:text-[#6001D2]")}
      >
        <YahooIcon size={iconSize} />
      </a>
      <a
        href={links.google}
        target="_blank"
        rel="noopener noreferrer"
        title={`${t.google} (${ticker})`}
        aria-label={`${t.google} (${ticker})`}
        className={cn(linkBase, "hover:text-[#4285F4]")}
      >
        <GoogleIcon size={iconSize} />
      </a>
      <a
        href={links.sec}
        target="_blank"
        rel="noopener noreferrer"
        title={`${t.sec} (${ticker})`}
        aria-label={`${t.sec} (${ticker})`}
        className={cn(linkBase, "hover:text-[var(--tt-text)]")}
      >
        <FileText size={iconSize} strokeWidth={1.75} />
      </a>
    </span>
  );
}
