import React from "react";

/**
 * 列表枢纽页(/investors、/stocks)客户端表格的 Suspense 占位。
 *
 * 表格读 useSearchParams,预渲染时整块落到这里;水合后换成 25 行的表格,远高于一屏。
 * 占位若只有一行高,下方的目录和页脚先出现在首屏、再被整块推出视口,手机上 CLS 达 0.4–0.6。
 * 占位撑满一屏高,目录和页脚从一开始就在视口之外,替换时不产生可见位移。
 */
export function ListFallback(): React.ReactElement {
  return (
    <p className="min-h-[100svh] font-data text-xs text-[var(--tt-faint)]">
      …
    </p>
  );
}
