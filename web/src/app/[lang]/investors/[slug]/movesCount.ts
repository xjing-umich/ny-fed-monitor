import type { MovesCount } from "@/lib/entity/quarterMovesText";
import type { HoldingChange } from "@/lib/managers/types";

/** 投资人页本季四项动作计数(长仓 changes)。 */
export function countMoves(changes: Array<Pick<HoldingChange, "kind">>): MovesCount {
  return {
    opened: changes.filter((c) => c.kind === "new").length,
    added: changes.filter((c) => c.kind === "increased").length,
    trimmed: changes.filter((c) => c.kind === "decreased").length,
    exited: changes.filter((c) => c.kind === "exited").length,
  };
}
