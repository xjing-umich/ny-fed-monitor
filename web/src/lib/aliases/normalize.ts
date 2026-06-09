// web/src/lib/aliases/normalize.ts
// 别名归一化:查询侧与存储侧共用,保证两端对齐(spec §3.2)。
// trim → 小写 → 去掉所有非「字母/数字」字符(标点、空格、点、斜杠)。
// 中日韩文字属于 \p{L}(字母),原样保留,不拆分、不转拼音(v1)。
//   "BRK.B"        → "brkb"
//   "BRK/B"        → "brkb"
//   "Warren Buffett" → "warrenbuffett"
//   "苹果公司"      → "苹果公司"
export function normalize(s: string): string {
  return s.trim().toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");
}
