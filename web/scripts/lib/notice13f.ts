/**
 * 13F-NT(13F NOTICE)代报跟随 —— 纯解析函数,供 ingest-13f.ts 使用、.check.ts 单测。
 *
 * 为什么需要:Pershing Square Capital Management(CIK 1336528)2026Q2 起改交 13F-NT,封面写明
 * "Holdings of this reporting manager are now included in the report of its public parent company",
 * 持仓由母公司 PERSHING SQUARE INC.(CIK 2026053)的 13F-HR 代报。只认 13F-HR 的 ingest 会把这一季
 * 当成"没交",页面停在 Q1。
 *
 * 母公司报告不能整表照搬:它合并了 6 个 included manager,其中有不属于 PSCM 的仓位(2026Q2 的
 * PERSHING SQUARE USA LTD 4,000,000 股 / $149.5M 只挂在 PSUS Holdings 等名下)。13F 的 infotable 每行
 * 都有 <otherManager> 序号列表,封面 <otherManagers2Info> 给出序号 → CIK 映射,据此只保留挂了
 * 被跟随经理人序号的行。母公司封面里找不到该经理人的序号 → 无法归属,宁可不收也不整表照搬。
 */

/** NT 封面 <otherManagersInfo> 里列出的代报方 CIK(10 位补零),按出现顺序去重。 */
export function noticeOtherManagerCiks(primaryDocXml: string): string[] {
  const block = primaryDocXml.match(/<(?:\w+:)?otherManagersInfo>([\s\S]*?)<\/(?:\w+:)?otherManagersInfo>/i)?.[1] ?? "";
  const ciks = [...block.matchAll(/<(?:\w+:)?cik>\s*(\d+)\s*</gi)].map((m) => m[1].padStart(10, "0"));
  return [...new Set(ciks)];
}

/** 母公司 13F-HR 封面 <otherManagers2Info> 中某 CIK 对应的序号;没有则 null。 */
export function includedManagerSeq(parentPrimaryDocXml: string, cik: string): number | null {
  const want = cik.replace(/^0+/, "");
  for (const m of parentPrimaryDocXml.matchAll(/<(?:\w+:)?otherManager2>([\s\S]*?)<\/(?:\w+:)?otherManager2>/gi)) {
    const seq = m[1].match(/<(?:\w+:)?sequenceNumber>\s*(\d+)\s*</i)?.[1];
    const c = m[1].match(/<(?:\w+:)?cik>\s*(\d+)\s*</i)?.[1];
    if (seq && c && c.replace(/^0+/, "") === want) return Number(seq);
  }
  return null;
}

/** infotable 行的 <otherManager> 字段(如 "1, 2, 3, 4")是否含该序号。 */
export function rowHasManagerSeq(otherManagerField: unknown, seq: number): boolean {
  return String(otherManagerField ?? "")
    .split(/[^0-9]+/)
    .filter(Boolean)
    .some((n) => Number(n) === seq);
}
