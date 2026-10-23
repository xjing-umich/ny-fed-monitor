// 季度共识报告的数据形状。payload 只存数据(数字/ticker/issuer/slug/姓名),不存成句文案:
// 文案由 copy.ts 在渲染时按语言生成,所以中英天然同值。
// schemaVersion 只增不改:已定稿的旧报告必须永远能被渲染(见 fixtures/v1-final.json)。

export type ReportLang = "en" | "zh";
export type MoveKind = "new" | "increased" | "decreased" | "exited";
export type EmptyReason = "no_filers" | "no_qualifying" | "no_valuation";

/** ticker 为 null = CUSIP 未解析;此时只显示 issuer,不生成个股页链接。key 恒为非空(ticker ?? cusip)。 */
export type ReportStock = { key: string; ticker: string | null; issuer: string };

export type ConsensusMoveItem = ReportStock & {
  managerCount: number;
  netValue: number;
  dominantKind: MoveKind;
};
export type MostHeldItem = ReportStock & { holderCount: number; holderDelta: number };
export type StrikeZoneItem = ReportStock & {
  holderCount: number;
  position: "strike_zone" | "below";
  marginPct: number;
};
export type FeaturedMove = ReportStock & { kind: MoveKind; weightBefore: number; weightAfter: number };
export type FeaturedEntry = {
  slug: string;
  person: string;
  personZh: string | null;
  filed: boolean;
  moves: FeaturedMove[];
};
export type Section<T> = { items: T[]; emptyReason: EmptyReason | null };

export type ReportPayload = {
  schemaVersion: 1;
  period: string; // 季末 YYYY-MM-DD
  /** total = 应申报 M;excluded = 上季未申报、不计入的人数(Q2 定稿 payload 无此字段)。 */
  coverage: { filed: number; total: number; excluded?: number };
  bought: Section<ConsensusMoveItem>;
  sold: Section<ConsensusMoveItem>;
  mostHeld: Section<MostHeldItem>;
  strikeZone: Section<StrikeZoneItem>;
  featured: FeaturedEntry[];
};

export type ReportStatus = "live" | "final";
/** 先记 broadcastId(sentAt=null)再发送;发送成功后补 sentAt。sentAt 非空才算该语言已完成。 */
export type ReportSendEntry = { broadcastId: string; sentAt: string | null };
export type ReportSends = Partial<Record<ReportLang, ReportSendEntry>>;

/** quarterly_reports 一行(读层映射后的 camelCase)。 */
export type ReportRow = {
  period: string;
  status: ReportStatus;
  payload: ReportPayload;
  payloadHash: string;
  coverageFiled: number;
  coverageTotal: number;
  valuationAsOf: string | null;
  firstLiveAt: string;
  generatedAt: string;
  previewPayload: ReportPayload | null;
  previewValuationAsOf: string | null;
  previewSentAt: string | null;
  finalizedAt: string | null;
  sends: ReportSends;
};

export type ReportHolding = {
  cusip: string;
  issuer: string;
  value: number;
  shares: number;
  weight: number; // 组合权重,小数(0.042 = 4.2%),与 ingest 写入口径一致
  putCall: string | null;
};

export type ReportManagerInput = {
  slug: string;
  person: string;
  personZh: string | null;
  /** 报告季度 P 的持仓;null = 尚未申报 P。 */
  current: ReportHolding[] | null;
  /** 早于 P 的最近一季持仓(与全站口径一致);null = 库里没有更早申报。 */
  prior: ReportHolding[] | null;
};

export type ReportInput = {
  period: string;
  /** 应申报投资人(expectedOnly)。 */
  managers: ReportManagerInput[];
  cusipMap: Map<string, { ticker: string | null; name: string | null }>;
  /** key = ticker 大写;只含 reliable 且(击球区 或 价值带以下)且通过 isImplausibleBand 的票。 */
  bargains: Map<string, { inStrikeZone: boolean; marginPct: number }>;
  featuredSlugs: string[];
  /** valuation_snapshot 里至少有一行 reliable 估值。false → 击球区板块写“估值暂不可用”。 */
  valuationAvailable: boolean;
  /** 名单里上季未申报、不计入分母的人数。 */
  excludedCount: number;
};
