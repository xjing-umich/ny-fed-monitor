import React from "react";

/**
 * 可复用渐进披露折叠块(纯 RSC, 零 hydration)。原生 <details>/<summary>:
 * 键盘/读屏可达、无 JS、内容始终在服务端 HTML 中(SEO/GEO 可爬)。
 * 视觉对齐 SectionHeading：可选绿眉标 → Sans 标题 → 开合符；
 * 与父级用间距分开，不再画 border-t（避免与持有人表/上一节叠线）。
 * title 必须是可独立阅读的完整短语(非 "Details")。
 */
export function FoldedSection({
  title,
  eyebrow,
  children,
  defaultOpen = false,
}: {
  title: string;
  /** Optional green mono eyebrow above the title (same rhythm as SectionHeading). */
  eyebrow?: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
}): React.ReactElement {
  return (
    <details open={defaultOpen} className="group mt-6">
      <summary className="cursor-pointer list-none pb-3 [&::-webkit-details-marker]:hidden max-sm:min-h-[44px]">
        {eyebrow ? (
          <p className="mb-1.5 tt-eyebrow">
            {eyebrow}
          </p>
        ) : null}
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
          <h2 className="text-lg font-semibold leading-tight tracking-tight text-[var(--tt-text)]">
            {title}
          </h2>
          <span
            aria-hidden
            className="font-mono text-[11px] text-[var(--tt-muted)] group-open:hidden"
          >
            ▸
          </span>
          <span
            aria-hidden
            className="hidden font-mono text-[11px] text-[var(--tt-muted)] group-open:inline"
          >
            ▾
          </span>
        </div>
      </summary>
      <div className="pb-1">{children}</div>
    </details>
  );
}
