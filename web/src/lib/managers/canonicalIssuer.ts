import type { ManagerDetail, FilingData, HoldingChange, Holding } from "./types";
import type { CusipInfo } from "./securities";

// 13F 的 issuer 是各申报人自己填的,同一只股票各家写法不同且常被缩写("BANK AMER CORP"、
// "CAPITAL ONE FINL CORP"、"LAUDER ESTEE COS INC")。个股页用 security_cusips 的名字;投资人页
// 也换成同一个名字,两边对同一家公司的叫法才一致(搜索引擎和 AI 按名字归并实体)。
// 查不到 cusip 的保留申报原文。返回新对象,不改入参(getManagerDetail 有 cache())。

export function withCanonicalIssuers(d: ManagerDetail, cusipMap: Map<string, CusipInfo>): ManagerDetail {
  if (cusipMap.size === 0) return d;
  const name = (cusip: string, raw: string): string => cusipMap.get(cusip)?.name || raw;
  const holding = (h: Holding): Holding => ({ ...h, issuer: name(h.cusip, h.issuer) });
  const filing = (f: FilingData): FilingData => ({ ...f, holdings: f.holdings.map(holding) });
  const change = (c: HoldingChange): HoldingChange => ({ ...c, issuer: name(c.cusip, c.issuer) });
  return {
    ...d,
    filings: d.filings.map(filing),
    latest: filing(d.latest),
    ...(d.prior ? { prior: filing(d.prior) } : {}),
    changes: d.changes.map(change),
  };
}
