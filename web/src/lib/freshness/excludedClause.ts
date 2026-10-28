// “上季未申报、不计入”的统一从句。首页进度行、报告状态条、方法说明、llms.txt 都从这里取字,避免各写各的。
/** n ≤ 0 → 空串;zh 带全角括号,en 前置一个空格(直接拼在数字短语后面)。
 *  en 用 "others" 不用 "more":报告方法说明的分母(97 位)已含这 n 位,"more" 会读成另外多出 n 位。 */
export function excludedClause(n: number, lang: "zh" | "en"): string {
  if (n <= 0) return "";
  return lang === "zh"
    ? `（另有 ${n} 位上季未申报，不计入）`
    : ` (${n} ${n === 1 ? "other" : "others"} missed last quarter and ${n === 1 ? "isn't" : "aren't"} counted)`;
}
