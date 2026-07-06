// OpenFIGI v3 mapping 的纯逻辑(无网络): CUSIP 补零 + 响应行解析。
// 网络/批处理在 scripts/lib/enrichSecurities.ts。

export type FigiData = {
  ticker?: string;
  name?: string;
  exchCode?: string;
  figi?: string;
  securityType?: string;
  securityType2?: string;
};
export type MappingResultItem = { data?: FigiData[]; warning?: string; error?: string };

export type SecurityRow = {
  cusip: string;
  ticker: string | null;
  name: string | null;
  exchange: string | null;
  figi: string | null;
  securityType: string | null;
  resolved: boolean;
};

/**
 * OpenFIGI `securityType` 值中，明确的**非经营性**载体——没有营业收入/持续盈利力，
 * 用盈利法(EPV/OE-DCF)估值毫无意义。核对真 API：ETP=SIVR/GLD 那类实物商品信托/ETF；
 * 而 REIT(ABR/CPT/DLR/ESS)、Common Stock(含银行 NTRS)是经营性实体，**不**在此列。
 * 只排"显然不该估"的，其余(ADR/MLP/普通股/REIT…)一律保留，避免误杀真公司。
 */
export const NON_OPERATING_SECURITY_TYPES: ReadonlySet<string> = new Set([
  "ETP",             // Exchange-Traded Product：ETF / 实物商品信托(SIVR/GLD)
  "Mutual Fund",     // 开放/封闭式基金份额
  "Closed-End Fund",
  "Equity WRT",      // OpenFIGI 对权证的实际标签(非 "Warrant"，核对真数据得来)
  "Warrant",
  "Right",
  "Unit",            // SPAC/组合单元，非持续经营股权
  "Index",
]);

/**
 * 该 ticker 是否为可用盈利法估值的经营性证券。security_type 未知(null)→ 视为可估
 * (保守：宁可估也不静默漏掉真公司，靠上游 reliable/健壮性闸兜底)；已知在denylist→排除。
 */
export function isOperatingSecurity(securityType: string | null | undefined): boolean {
  if (!securityType) return true;
  return !NON_OPERATING_SECURITY_TYPES.has(securityType);
}

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
      securityType: first.securityType ?? null,
      resolved: true,
    };
  }
  return { cusip, ticker: null, name: issuer, exchange: null, figi: null, securityType: null, resolved: false };
}
