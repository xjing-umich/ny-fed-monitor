"use client";

import { useState } from "react";

/**
 * 客户端"加载更多"分页岛。把长列表切到 pageSize,点击逐步揭示。
 * render 接收当前可见项,内部可渲染 DataTable 等(client→client,函数列可用)。
 */
export function Paginated<T>({
  items,
  pageSize,
  render,
  moreLabel = "Load more",
}: {
  items: T[];
  pageSize: number;
  render: (visible: T[]) => React.ReactNode;
  moreLabel?: string;
}) {
  const [count, setCount] = useState(pageSize);
  const visible = items.slice(0, count);
  const remaining = items.length - count;

  return (
    <>
      {render(visible)}
      {remaining > 0 && (
        <div className="mt-6 flex justify-center">
          <button
            type="button"
            onClick={() =>
              setCount((c) => Math.min(c + pageSize, items.length))
            }
            className="border border-[var(--tt-border)] px-4 py-2 font-mono text-[11px] uppercase tracking-[0.08em] text-[var(--tt-accent)] transition-colors hover:border-[var(--tt-accent)]"
          >
            {moreLabel}
            <span className="ml-1.5 text-[var(--tt-faint)]">+{remaining}</span>
          </button>
        </div>
      )}
    </>
  );
}
