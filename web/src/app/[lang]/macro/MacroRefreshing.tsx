import React from "react";
import type { Lang } from "@/lib/nav";

/**
 * 宏观快照暂不可用时的优雅降级态(首次摄取前 / DB 抖动)。
 * 关键:渲染纯静态 JSX —— 不读外部、不抛错、不 404,保证构建永远成功。
 * 快照由 scripts/macro-ingest.ts 写入后,页面下次渲染自动恢复真实数据。
 */
export function MacroRefreshing({
  lang,
  title,
}: {
  lang: Lang;
  title?: string;
}): React.ReactElement {
  const isZh = lang === "zh";
  return (
    <div className="mx-auto max-w-3xl px-4 py-20 text-center">
      <div className="text-[10px] font-medium uppercase tracking-[0.12em] text-[var(--tt-faint)]">
        {isZh ? "宏观 / 流动性" : "Macro / Liquidity"}
      </div>
      <h1 className="mt-3 font-display text-2xl font-medium leading-tight text-[var(--tt-text)] sm:text-3xl">
        {title ?? (isZh ? "美债市场监控" : "Treasury Market Monitor")}
      </h1>
      <p className="mt-4 text-sm leading-relaxed text-[var(--tt-muted)]">
        {isZh
          ? "数据正在刷新,请稍后再来。"
          : "Data is refreshing — please check back shortly."}
      </p>
    </div>
  );
}
