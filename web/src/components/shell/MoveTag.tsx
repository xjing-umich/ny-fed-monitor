import type { MoveKind } from "@/lib/aggregations";
import type { Lang } from "@/lib/nav";
import { MOVE_GLYPH, MOVE_LABEL } from "@/lib/entity/quarterMovesText";

/** 动作使用共享字形与完整词,正文色;与持有人表同口径。 */
export default function MoveTag({ kind, lang }: { kind: MoveKind; lang: Lang }) {
  return (
    <span className="inline-block shrink-0 whitespace-nowrap rounded-sm border border-[var(--tt-border)] px-1.5 py-0.5 font-data text-xs font-medium leading-none text-[var(--tt-text)]">
      {`${MOVE_GLYPH[kind]} ${MOVE_LABEL[lang][kind]}`}
    </span>
  );
}
