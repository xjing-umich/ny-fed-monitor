import type { Holding } from "../../src/lib/managers/types";

/**
 * 13F 修正申报(13F-HR/A)合并。
 *
 * 为什么需要:此前每季只取一份申报(实际总是原始 13F-HR),之后的修正全部被忽略。
 * 2026-10 审计:EDGAR 上 22 份修正无一入库 —— Oaktree 2026Q1 重述后 147 仓/$6.56B,
 * 库里仍是原始 137 仓/$5.63B;Kahn Brothers 2026Q2 重述后估值口径变化,导致 RFL/OGN
 * 的 13F 隐含价与市价对不上。
 *
 * 合并规则(按申报日、再按 accession 升序逐份应用):
 *  - 13F-HR 原始申报:整季替换(同季重复提交原始件时以后者为准)。
 *  - /A RESTATEMENT:整季替换。表为空(只改封面)则跳过,不清空持仓。
 *  - /A NEW HOLDINGS 或未标类型:按 cusip+期权类型逐键「覆盖已有、追加新增」。
 *    不能照字面"追加":实测 Check Capital、Arbiter 的 NEW HOLDINGS 修正其实是带少量改动的
 *    全表重述(键与原件 100% 重合),照字面追加会把持仓翻倍。真正的新增仓位(新键)照常加入。
 *    已知取舍:若真·新增仓位恰与原件同一证券,会覆盖而非累加 —— 实测未见,宁可少算不重复算。
 *  - 其它(13F NOTICE 等无持仓表的修正):跳过。
 *  - 零持仓申报(zeroReport:原始件或 RESTATEMENT 的 infotable 只有一行全 0 占位,如 Olstein 2026Q2、
 *    Makaira 2026Q1):这是申报人明确报告"本季无 13F 持仓",整季替换为空表,而不是当成解析失败跳过。
 *    否则该季被丢掉,页面继续把上一季持仓当成最新一季展示。
 *
 * 身份:该季在库里的 accession / filedAt 取原始申报(没有原始件时取第一份被采用的修正),
 * 保证「一户一季一行」且修正不会把「刚申报」信号重新点亮。
 */

export type AmendmentType = "RESTATEMENT" | "NEW HOLDINGS" | null;

export type FilingVersion = {
  accession: string;
  filedAt: string;
  form: "13F-HR" | "13F-HR/A";
  /** 仅 /A 有意义;取自 primary_doc.xml 的 <amendmentType>。 */
  amendmentType: AmendmentType;
  /** 已归一(美元口径)且按键聚合后的持仓。 */
  holdings: Holding[];
  /** infotable 只有全 0 占位行:申报人报告本季持仓为零(holdings 为空)。 */
  zeroReport?: boolean;
};

export type ResolvedPeriod = {
  accession: string;
  filedAt: string;
  holdings: Holding[];
  /** 实际被采用的申报 accession(含原始件),用于日志。 */
  applied: string[];
  /** 被跳过的申报及原因,用于日志。 */
  skipped: { accession: string; reason: string }[];
  /** 最终结果是申报人报告的零持仓(holdings 为空)。 */
  zeroReport: boolean;
};

/** 持仓键:CUSIP 不分大小写(申报人常写小写),期权类型不分大小写。 */
export function holdingKey(h: Pick<Holding, "cusip" | "putCall">): string {
  return `${h.cusip.toUpperCase()}|${(h.putCall ?? "").toUpperCase()}`;
}

export function resolvePeriodHoldings(versions: FilingVersion[]): ResolvedPeriod | null {
  const ordered = [...versions].sort((a, b) =>
    a.filedAt !== b.filedAt ? (a.filedAt < b.filedAt ? -1 : 1) : a.accession < b.accession ? -1 : 1
  );
  let current: Map<string, Holding> | null = null;
  let identity: { accession: string; filedAt: string } | null = null;
  let identityIsOriginal = false;
  const applied: string[] = [];
  const skipped: ResolvedPeriod["skipped"] = [];
  const toMap = (hs: Holding[]) => new Map(hs.map((h) => [holdingKey(h), { ...h }]));

  for (const v of ordered) {
    const isOriginal = v.form === "13F-HR";
    if (isOriginal || v.amendmentType === "RESTATEMENT") {
      if (v.holdings.length === 0 && !v.zeroReport) {
        skipped.push({ accession: v.accession, reason: isOriginal ? "original with empty table" : "restatement with empty table" });
        continue;
      }
      current = toMap(v.holdings);
    } else if (v.amendmentType === "NEW HOLDINGS" || v.amendmentType === null) {
      if (v.holdings.length === 0) {
        skipped.push({ accession: v.accession, reason: "amendment with empty table" });
        continue;
      }
      current = current ?? new Map();
      for (const h of v.holdings) current.set(holdingKey(h), { ...h });
    } else {
      skipped.push({ accession: v.accession, reason: `unsupported amendment type ${v.amendmentType}` });
      continue;
    }
    applied.push(v.accession);
    // 原始件一旦出现就锁定身份;此前若只有修正件占位,原始件到来时接管身份。
    if (!identity || (isOriginal && !identityIsOriginal)) {
      identity = { accession: v.accession, filedAt: v.filedAt };
      identityIsOriginal = isOriginal;
    }
  }

  if (!current || !identity) return null;
  const holdings = [...current.values()];
  return { ...identity, holdings, applied, skipped, zeroReport: holdings.length === 0 };
}
