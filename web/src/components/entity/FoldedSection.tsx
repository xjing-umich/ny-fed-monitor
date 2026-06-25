import React from "react";

/**
 * 可复用渐进披露折叠块(纯 RSC, 零 hydration)。原生 <details>/<summary>:
 * 键盘/读屏可达、无 JS、内容始终在服务端 HTML 中(SEO/GEO 可爬)。
 * summary 为 <h2> 级语义标题(文档大纲不跳级); 视觉沿用 eyebrow + border-t 分隔。
 * title 必须是可独立阅读的完整短语(非 "Details")。
 */
export function FoldedSection({
  title,
  children,
  defaultOpen = false,
}: {
  title: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
}): React.ReactElement {
  return (
    <details open={defaultOpen} className="group border-t border-[var(--tt-border)] pt-4">
      <summary className="flex cursor-pointer list-none items-center gap-2 pb-3 [&::-webkit-details-marker]:hidden">
        <h2 className="font-display text-[10px] font-medium uppercase tracking-[0.12em] text-[var(--tt-faint)]">
          {title}
        </h2>
        <span aria-hidden className="text-[var(--tt-faint)] transition-transform group-open:rotate-90">
          ›
        </span>
      </summary>
      <div className="pb-1">{children}</div>
    </details>
  );
}
