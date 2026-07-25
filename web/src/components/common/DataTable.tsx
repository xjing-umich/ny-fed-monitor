import Link from "next/link";
import { cn } from "@/lib/utils";

/**
 * 列定义。`role` 只影响移动端卡片的摆放,不影响桌面表格(桌面按数组顺序渲染所有列):
 *   - "lead"    卡片标题前的徽章(如 MoveTag 买/卖标签)
 *   - "primary" 卡片标题(通常是名称 + ticker),占满整行
 *   - "trail"   卡片标题右侧的徽章(如净买入/净卖出)
 *   - "metric"  卡片下方的"标签: 数值"指标块(默认)
 * `hideOnMobile` 的列只在桌面表格出现,不进卡片(如 链接 / 报告期 / 股数)。
 */
export type Column<T> = {
  key: string;
  header?: React.ReactNode;
  cell: (row: T, index: number) => React.ReactNode;
  align?: "left" | "right";
  role?: "lead" | "primary" | "trail" | "metric";
  /** 桌面 th/td 宽度类,如 "w-28" */
  width?: string;
  /** 桌面单元格额外类 */
  cellClassName?: string;
  /** 移动卡片里指标块的标签(默认用 header) */
  mobileLabel?: React.ReactNode;
  /** 仅桌面显示,不进卡片 */
  hideOnMobile?: boolean;
  /** When set, header is a sort control; value is the URL sort key passed to onSort. */
  sortKey?: string;
};

export type DataTableProps<T> = {
  columns: Column<T>[];
  rows: T[];
  getKey: (row: T, index: number) => string;
  /** 提供则整行/整卡可点击跳转 */
  rowHref?: (row: T) => string;
  /** 显示序号列(从 1 起) */
  showRank?: boolean;
  /** 隐藏桌面表头(用于首页紧凑 teaser) */
  hideHeader?: boolean;
  /**
   * 表格/卡片切换断点(此宽度以下显示卡片)。列越多越密的表应取更大值,
   * 否则在平板/大屏手机(640–1024px)区间表格仍会挤。默认 "md"。
   */
  breakpoint?: "sm" | "md" | "lg";
  sortKey?: string;
  sortDir?: "asc" | "desc";
  onSort?: (sortKey: string) => void;
  /** Rank display offset (filtered global index). Default 0 → ranks start at 1. */
  rankStart?: number;
  emptyText?: string;
  /** sr-only labels for the active sort state (screen readers can't hear arrows). */
  sortAscLabel?: string;
  sortDescLabel?: string;
  /** aria-label for the mobile sort chip group. */
  sortGroupLabel?: string;
};

// 静态类对(Tailwind JIT 需字面量,不能拼接)。
const BP: Record<NonNullable<DataTableProps<unknown>["breakpoint"]>, { card: string; table: string }> = {
  sm: { card: "sm:hidden", table: "hidden sm:block" },
  md: { card: "md:hidden", table: "hidden md:block" },
  lg: { card: "lg:hidden", table: "hidden lg:block" },
};

const alignClass = (a?: "left" | "right") =>
  a === "right" ? "text-right" : "text-left";

export function DataTable<T>({
  columns,
  rows,
  getKey,
  rowHref,
  showRank,
  hideHeader,
  breakpoint = "md",
  sortKey,
  sortDir,
  onSort,
  rankStart,
  emptyText,
  sortAscLabel = "sorted ascending",
  sortDescLabel = "sorted descending",
  sortGroupLabel = "Sort",
}: DataTableProps<T>) {
  const bp = BP[breakpoint];
  if (rows.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-[var(--tt-muted)]">
        {emptyText ?? "No data available"}
      </p>
    );
  }

  const leadCols = columns.filter((c) => c.role === "lead");
  const primaryCol = columns.find((c) => c.role === "primary") ?? columns[0];
  const trailCols = columns.filter((c) => c.role === "trail");
  const sortableCols = onSort ? columns.filter((c) => c.sortKey) : [];
  const metricCols = columns.filter(
    (c) =>
      !c.hideOnMobile &&
      c.role !== "lead" &&
      c.role !== "trail" &&
      c !== primaryCol
  );

  return (
    <div className="w-full">
      {/* Desktop: editorial table */}
      <div className={cn("w-full overflow-x-auto", bp.table)}>
        <table className="w-full border-collapse text-sm">
          {/* No sticky header: the responsive wrapper needs `overflow-x-auto`, which
              becomes the sticky containing block — a viewport `top-[60px]` then offsets
              the header 60px DOWN into the table (floating between row 1 and row 2)
              instead of pinning under the nav. Plain editorial header instead. */}
          <thead className={cn(hideHeader && "sr-only")}>
            <tr className="border-b border-[var(--tt-border)]">
              {showRank && (
                <th className="w-8 pb-2 text-left font-mono text-[10px] font-medium uppercase tracking-[0.1em] text-[var(--tt-muted)]">
                  #
                </th>
              )}
              {columns.map((c) => {
                const isSortable = Boolean(c.sortKey && onSort);
                const isActive = isSortable && sortKey === c.sortKey;
                const ariaSort = isSortable
                  ? isActive
                    ? sortDir === "asc"
                      ? "ascending"
                      : "descending"
                    : "none"
                  : undefined;

                return (
                  <th
                    key={c.key}
                    aria-sort={ariaSort}
                    className={cn(
                      "pb-2 font-mono text-[10px] font-medium uppercase tracking-[0.1em] text-[var(--tt-muted)]",
                      alignClass(c.align),
                      c.width
                    )}
                  >
                    {isSortable ? (
                      <button
                        type="button"
                        onClick={() => onSort!(c.sortKey!)}
                        className={cn(
                          "group/sort font-mono text-[10px] font-medium uppercase tracking-[0.1em] transition-colors",
                          isActive
                            ? "text-[var(--tt-accent)]"
                            : "text-[var(--tt-muted)] hover:text-[var(--tt-text)]"
                        )}
                      >
                        {c.header}
                        {isActive ? (
                          <>
                            <span aria-hidden>{sortDir === "asc" ? " ↑" : " ↓"}</span>
                            <span className="sr-only">
                              {sortDir === "asc" ? sortAscLabel : sortDescLabel}
                            </span>
                          </>
                        ) : (
                          <span
                            aria-hidden
                            className="opacity-0 transition-opacity group-hover/sort:opacity-60 group-focus-visible/sort:opacity-60"
                          >
                            {" "}↕
                          </span>
                        )}
                      </button>
                    ) : (
                      c.header
                    )}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => {
              const href = rowHref?.(row);
              return (
                <tr
                  key={getKey(row, i)}
                  className="group transition-colors hover:bg-[var(--tt-surface)]"
                >
                  {showRank && (
                    <td className="py-2.5 pr-3 font-mono text-[11px] tabular-nums text-[var(--tt-faint)]">
                      {(rankStart ?? 0) + i + 1}
                    </td>
                  )}
                  {columns.map((c, ci) => {
                    const content =
                      c === primaryCol && href ? (
                        <Link
                          href={href}
                          className="font-medium text-[var(--tt-text)] no-underline transition-colors hover:text-[var(--tt-accent)]"
                        >
                          {c.cell(row, i)}
                        </Link>
                      ) : (
                        c.cell(row, i)
                      );
                    return (
                      <td
                        key={c.key}
                        className={cn(
                          "py-2.5",
                          ci < columns.length - 1 && "pr-4",
                          alignClass(c.align),
                          c === primaryCol && "min-w-0 max-w-[14rem] sm:max-w-[18rem]",
                          c.align === "right" &&
                            "font-mono tabular-nums text-[var(--tt-muted)]",
                          c.cellClassName
                        )}
                      >
                        {content}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Mobile/tablet: stacked cards (+ compact sort chips — the table headers
          with sort buttons are hidden in card mode, so cards need their own) */}
      {sortableCols.length > 0 && (
        <div
          role="group"
          aria-label={sortGroupLabel}
          className={cn("flex flex-wrap items-center gap-1 pb-2", bp.card)}
        >
          {sortableCols.map((c) => {
            const isActive = sortKey === c.sortKey;
            return (
              <button
                key={c.key}
                type="button"
                aria-pressed={isActive}
                onClick={() => onSort!(c.sortKey!)}
                className={cn(
                  "inline-flex min-h-[44px] items-center border px-2.5 font-mono text-[10px] uppercase tracking-[0.08em] transition-colors",
                  isActive
                    ? "border-[var(--tt-accent)] bg-[var(--tt-accent)]/10 text-[var(--tt-accent)]"
                    : "border-[var(--tt-border)] text-[var(--tt-muted)] hover:text-[var(--tt-text)]"
                )}
              >
                {c.header}
                {isActive && <span aria-hidden>{sortDir === "asc" ? " ↑" : " ↓"}</span>}
              </button>
            );
          })}
        </div>
      )}
      <ul className={cn("m-0 list-none divide-y divide-[var(--tt-border)] p-0", bp.card)}>
        {rows.map((row, i) => {
          const href = rowHref?.(row);
          const title = (
            <span className="flex min-w-0 flex-1 items-center gap-2">
              {showRank && (
                <span className="shrink-0 font-mono text-[11px] tabular-nums text-[var(--tt-faint)]">
                  {(rankStart ?? 0) + i + 1}
                </span>
              )}
              {leadCols.map((c) => (
                <span key={c.key} className="shrink-0">
                  {c.cell(row, i)}
                </span>
              ))}
              <span className="min-w-0 font-medium text-[var(--tt-text)]">
                {primaryCol.cell(row, i)}
              </span>
            </span>
          );
          return (
            <li key={getKey(row, i)} className="py-3">
              <div className="flex items-start justify-between gap-3">
                {href ? (
                  <Link href={href} className="min-w-0 flex-1 no-underline">
                    {title}
                  </Link>
                ) : (
                  title
                )}
                {trailCols.length > 0 && (
                  <span className="flex shrink-0 items-center gap-1.5">
                    {trailCols.map((c) => (
                      <span key={c.key}>{c.cell(row, i)}</span>
                    ))}
                  </span>
                )}
              </div>
              {metricCols.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 pl-0">
                  {metricCols.map((c) => (
                    <span
                      key={c.key}
                      className="flex items-baseline gap-1.5 text-xs"
                    >
                      <span className="font-mono text-[10px] uppercase tracking-[0.08em] text-[var(--tt-faint)]">
                        {c.mobileLabel ?? c.header}
                      </span>
                      <span className="font-mono tabular-nums text-[var(--tt-muted)]">
                        {c.cell(row, i)}
                      </span>
                    </span>
                  ))}
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
