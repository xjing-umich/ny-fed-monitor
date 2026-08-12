export type Holding = {
  cusip: string;
  issuer: string;
  titleOfClass?: string;
  value: number;
  shares: number;
  putCall?: string;
  weight?: number;
};

export type FilingData = {
  period: string;
  filedAt: string;
  accession: string;
  holdings: Holding[];
  totalValue: number;
};

export type HoldingChange = {
  cusip: string;
  putCall?: string;
  issuer: string;
  kind: "new" | "exited" | "increased" | "decreased";
  prevShares: number;
  shares: number;
  value: number;
  deltaPct: number | null;
};

export type Manager = {
  cik: string;
  slug: string;
  name: string;
  person: string;
};

export type ManagerSummary = Manager & {
  period: string;
  /** 最新 filing 的 SEC 提交日(YYYY-MM-DD)。manager_index RPC 未更新时容错为 null。 */
  filedAt: string | null;
  totalValue: number;
  holdingCount: number;
  topHolding: string;
};

export type ManagerDetail = {
  manager: Manager;
  /** 全历史，按 period 降序，[0]=最新（最多 8 季）。单一来源；latest/prior/changes 由 assembleManagerDetail 派生。 */
  filings: FilingData[];
  latest: FilingData;
  prior?: FilingData;
  changes: HoldingChange[];
};

export type ManagerIndex = {
  generatedAt: string;
  managers: ManagerSummary[];
};

/** 列表页季度变化信号(来自 manager_qoq RPC)。各字段为 null 表示无 prior/无变动。 */
export type ManagerQoQ = {
  valueDeltaPct: number | null;
  countDelta: number | null;
  verdict: "buying" | "selling" | "mixed" | null;
  topMoveIssuer: string | null;
  topMoveKind: "new" | "exited" | "increased" | "decreased" | null;
};
