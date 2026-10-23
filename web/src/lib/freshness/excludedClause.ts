// “上季未申报、不计入”的统一从句。首页进度行、报告状态条、方法说明、llms.txt 都从这里取字,避免各写各的。
/** n ≤ 0 → 空串;zh 带全角括号,en 前置一个空格(直接拼在数字短语后面)。 */
export function excludedClause(n: number, lang: "zh" | "en"): string {
  if (n <= 0) return "";
  return lang === "zh"
    ? `（另有 ${n} 位上季未申报，不计入）`
    : ` (${n} more missed last quarter and ${n === 1 ? "isn't" : "aren't"} counted)`;
}
