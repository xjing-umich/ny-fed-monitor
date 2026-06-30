"use client";

import { useState } from "react";

/**
 * 客户端"加载更多"分页岛。所有项始终交给 render 全量渲染(SSR 即含全部 <a>,
 * 利于抓取),仅 visibleCount 之后的行用 CSS 视觉隐藏,点击逐步揭示。
 * render 接收全量项与当前可见数,内部按 visibleCount 把溢出行标 hidden。
 */
export function Paginated<T>({
  items,
  pageSize,
  render,
  moreLabel = "Load more",
}: {
  items: T[];
  pageSize: number;
  render: (items: T[], visibleCount: number) => React.ReactNode;
  moreLabel?: string;
}) {
  const [count, setCount] = useState(pageSize);
  const remaining = items.length - count;

  return (
    <>
      {render(items, count)}
      {remaining > 0 && (
        <div className="mt-6 flex justify-center">
          <button
            type="button"
            onClick={() =>
              setCount((c) => Math.min(c + pageSize, items.length))
            }
            className="rounded-md border border-[var(--tt-border)] px-4 py-2 font-mono text-[11px] uppercase tracking-[0.08em] text-[var(--tt-accent)] transition hover:border-[var(--tt-accent)] hover:bg-[var(--tt-surface)] active:scale-[0.98]"
          >
            {moreLabel}
            <span className="ml-1.5 text-[var(--tt-faint)]">+{remaining}</span>
          </button>
        </div>
      )}
    </>
  );
}
