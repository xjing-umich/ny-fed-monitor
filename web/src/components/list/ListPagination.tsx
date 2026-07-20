"use client";

import React from "react";

type Props = {
  page: number;
  pageCount: number;
  onPage: (page: number) => void;
  moreLabel: string;
  remaining: number;
  prevLabel: string;
  nextLabel: string;
  pageLabel: (page: number, pageCount: number) => string;
};

const navBtnClass = (disabled: boolean) =>
  [
    "border-0 border-b bg-transparent px-0 py-1 font-mono text-[11px] uppercase tracking-[0.08em] transition-colors",
    disabled
      ? "cursor-not-allowed border-transparent text-[var(--tt-faint)]"
      : "border-[var(--tt-border)] text-[var(--tt-accent)] hover:border-[var(--tt-accent)]",
  ].join(" ");

export const ListPagination: React.FC<Props> = ({
  page,
  pageCount,
  onPage,
  moreLabel,
  remaining,
  prevLabel,
  nextLabel,
  pageLabel,
}) => {
  if (pageCount <= 1 && remaining <= 0) {
    return null;
  }

  const atStart = page <= 1;
  const atEnd = page >= pageCount;

  return (
    <>
      <div className="mt-6 hidden items-center justify-center gap-6 md:flex">
        <button
          type="button"
          disabled={atStart}
          onClick={() => onPage(page - 1)}
          aria-label={prevLabel}
          className={navBtnClass(atStart)}
        >
          {prevLabel}
        </button>

        <span className="font-mono text-[11px] uppercase tracking-[0.08em] text-[var(--tt-muted)]">
          {pageLabel(page, pageCount)}
        </span>

        <button
          type="button"
          disabled={atEnd}
          onClick={() => onPage(page + 1)}
          aria-label={nextLabel}
          className={navBtnClass(atEnd)}
        >
          {nextLabel}
        </button>
      </div>

      {remaining > 0 && (
        <div className="mt-6 flex justify-center md:hidden">
          <button
            type="button"
            onClick={() => onPage(page + 1)}
            className="inline-flex min-h-[44px] items-center border-0 border-b border-[var(--tt-border)] bg-transparent px-0 font-mono text-[11px] uppercase tracking-[0.08em] text-[var(--tt-accent)] transition-colors hover:border-[var(--tt-accent)] active:scale-[0.98]"
          >
            {moreLabel}
            <span className="ml-1.5 text-[var(--tt-faint)]">+{remaining}</span>
          </button>
        </div>
      )}
    </>
  );
};
