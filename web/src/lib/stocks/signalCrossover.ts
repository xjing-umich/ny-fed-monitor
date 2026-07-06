import type { Lang } from "@/lib/nav";

export type CrossoverInput = {
  /** 长仓持有人数。 */
  n: number;
  /** 本季动作(长仓 only)。 */
  moves: { opened: number; added: number; trimmed: number; exited: number };
  /** 估值位置; null=缺价/不可估值/坏数据被闸 → 省估值段。 */
  verdict: "below" | "within" | "above" | null;
  /** 数据 as-of(period)。 */
  period: string;
};

// 纯事实并置: 三段客观事实用 ` · ` 并列, 不加连接/转折词, 不解读张力。合规: 非建议、非信号。
export function buildSignalCrossover(input: CrossoverInput, lang: Lang): string {
  const { n, moves, verdict, period } = input;
  const zh = lang === "zh";
  const segs: string[] = [];

  // 段1: 持有人数
  segs.push(zh ? `${n} 位超级投资者持有` : `Held by ${n} superinvestor${n === 1 ? "" : "s"}`);

  // 段2: 本季动作(仅非零)
  const acts: string[] = [];
  if (moves.opened > 0) acts.push(zh ? `${moves.opened} 家新建` : `${moves.opened} opened`);
  if (moves.added > 0) acts.push(zh ? `${moves.added} 家加仓` : `${moves.added} added`);
  if (moves.trimmed > 0) acts.push(zh ? `${moves.trimmed} 家减仓` : `${moves.trimmed} trimmed`);
  if (moves.exited > 0) acts.push(zh ? `${moves.exited} 家清仓` : `${moves.exited} exited`);
  if (acts.length > 0) segs.push((zh ? "本季" : "this quarter ") + acts.join(zh ? "、" : ", "));

  // 段3: 估值位置(verdict=null 省略)
  if (verdict) {
    const band = zh
      ? { below: "现价低于保守价值带", within: "现价落在保守价值带内", above: "现价高于保守价值带" }
      : { below: "price below the conservative value band", within: "price within the conservative value band", above: "price above the conservative value band" };
    segs.push(band[verdict]);
  }

  const asOf = period ? (zh ? `（截至 ${period}）` : ` (as of ${period})`) : "";
  return segs.join(" · ") + asOf;
}
