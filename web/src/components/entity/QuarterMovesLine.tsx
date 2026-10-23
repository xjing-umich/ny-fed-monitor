import Link from "next/link";
import React from "react";
import type { Lang } from "@/lib/nav";
import { quarterMovesCounts, splitNames, type MovesCount } from "@/lib/entity/quarterMovesText";

/** 本季动作一行:计数 + 清仓名单(带链接,最多 3 个,其余写“另 k 位/只”)。零 hydration。 */
export function QuarterMovesLine({
  q,
  moves,
  exited,
  unit,
  lang,
}: {
  q: string;
  moves: MovesCount;
  exited: { name: string; href: string }[];
  /** 清仓名单的量词:个股页列投资人(位),投资人页列股票(只)。 */
  unit: "investor" | "stock";
  lang: Lang;
}): React.ReactElement {
  const { shown, rest } = splitNames(exited);
  const restText =
    rest > 0 ? (lang === "zh" ? ` 另 ${rest} ${unit === "investor" ? "位" : "只"}` : ` +${rest} more`) : "";
  return (
    <p className="font-data text-xs text-[var(--tt-muted)]">
      {quarterMovesCounts(q, moves, lang)}
      {shown.length > 0 && (
        <>
          {lang === "zh" ? "（" : " ("}
          {shown.map((e, i) => (
            <React.Fragment key={e.href}>
              {i > 0 && (lang === "zh" ? "、" : ", ")}
              <Link href={e.href} className="text-[var(--tt-text)] no-underline transition-colors hover:text-[var(--tt-accent)]">
                {e.name}
              </Link>
            </React.Fragment>
          ))}
          {restText}
          {lang === "zh" ? "）" : ")"}
        </>
      )}
    </p>
  );
}
