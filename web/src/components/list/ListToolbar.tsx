"use client";

import React from "react";

type Chip = { key: string; label: string };

type Props = {
  searchLabel: string;
  searchPlaceholder: string;
  q: string;
  onQChange: (v: string) => void;
  onQSubmit: () => void;
  countText: string;
  chips?: Chip[];
  activeChip?: string;
  onChip?: (key: string) => void;
};

const chipClass = (active: boolean) =>
  [
    "max-sm:min-h-[44px] px-2.5 py-1.5 font-mono text-[11px] uppercase tracking-[0.08em] transition-colors",
    "max-sm:border sm:border-0 sm:border-b",
    active
      ? "text-[var(--tt-accent)] max-sm:border-[var(--tt-accent)] max-sm:bg-[var(--tt-accent)]/10 sm:border-[var(--tt-accent)]"
      : "text-[var(--tt-muted)] max-sm:border-[var(--tt-border)] hover:text-[var(--tt-text)] sm:border-transparent hover:sm:border-[var(--tt-border)]",
  ].join(" ");

export const ListToolbar: React.FC<Props> = ({
  searchLabel,
  searchPlaceholder,
  q,
  onQChange,
  onQSubmit,
  countText,
  chips,
  activeChip,
  onChip,
}) => {
  const hasChips = chips != null && chips.length > 0;

  return (
    <div className="space-y-2 md:space-y-0">
      <div className="md:flex md:flex-row md:items-center md:gap-4">
        <form
          className="w-full md:flex-1 md:min-w-0"
          onSubmit={(e) => {
            e.preventDefault();
            onQSubmit();
          }}
        >
          <input
            type="search"
            value={q}
            onChange={(e) => onQChange(e.target.value)}
            placeholder={searchPlaceholder}
            aria-label={searchLabel}
            className="w-full min-w-[200px] border-0 border-b border-[var(--tt-border)] bg-transparent px-0 py-1.5 text-sm text-[var(--tt-text)] placeholder:text-[var(--tt-faint)] focus:outline-none focus:border-[var(--tt-accent)]"
          />
        </form>

        <div className="flex flex-wrap items-center justify-between gap-2 md:contents">
          {hasChips && (
            <div className="flex flex-wrap gap-1">
              {chips.map(({ key, label }) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => onChip?.(key)}
                  aria-pressed={activeChip === key}
                  className={chipClass(activeChip === key)}
                >
                  {label}
                </button>
              ))}
            </div>
          )}

          <span className="shrink-0 font-mono text-[11px] uppercase tracking-[0.08em] text-[var(--tt-faint)]">
            {countText}
          </span>
        </div>
      </div>
    </div>
  );
};
