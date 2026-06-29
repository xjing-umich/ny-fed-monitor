// OpenFIGI v3 mapping 的纯逻辑(无网络): CUSIP 补零 + 响应行解析。
// 网络/批处理在 scripts/lib/enrichSecurities.ts。

export type FigiData = {
  ticker?: string;
  name?: string;
  exchCode?: string;
  figi?: string;
  securityType?: string;
};
export type MappingResultItem = { data?: FigiData[]; warning?: string; error?: string };

export type SecurityRow = {
  cusip: string;
  ticker: string | null;
  name: string | null;
  exchange: string | null;
  figi: string | null;
  resolved: boolean;
};

/** SEC 13F CUSIP 常缺前导零；OpenFIGI 要求标准 9 位。 */
export function padCusip(cusip: string): string {
  return cusip.trim().padStart(9, "0");
}

/**
 * 选对 OpenFIGI 的 idType。字母开头的 9 位标识符是 **CINS**(国际证券, 国家码前缀,
 * 如 G0403H108=AON、N07059210=ASML), 必须用 ID_CINS;纯数字/数字开头的才是标准 US CUSIP,
 * 用 ID_CUSIP。用错类型 OpenFIGI 一律回 "No identifier found" —— 这正是大量在美上市外国
 * 注册股(AON/ASML/ACCENTURE/LINDE/MEDTRONIC…)迟迟解析不出 ticker 的根因。
 */
export function openfigiIdType(idValue: string): "ID_CUSIP" | "ID_CINS" {
  return /^[A-Za-z]/.test(idValue) ? "ID_CINS" : "ID_CUSIP";
}

/**
 * OpenFIGI 双类别股/权证 ticker 用斜杠(如 BRK/B)，会破坏路径路由(/stocks/BRK/B)。
 * 规范化为点号(BRK.B，业界通用)，使 ticker 可安全作 URL 段与主键。
 */
export function normalizeTicker(ticker: string): string {
  return ticker.replace(/\//g, ".");
}

/** 把一条 OpenFIGI 结果解析为待写库的行。无匹配/报错 → resolved=false 并保留 issuer 名。 */
export function parseMappingResult(
  cusip: string,
  issuer: string,
  item: MappingResultItem
): SecurityRow {
  const first = item?.data?.[0];
  if (first?.ticker) {
    return {
      cusip,
      ticker: normalizeTicker(first.ticker),
      name: first.name ?? issuer,
      exchange: first.exchCode ?? null,
      figi: first.figi ?? null,
      resolved: true,
    };
  }
  return { cusip, ticker: null, name: issuer, exchange: null, figi: null, resolved: false };
}
