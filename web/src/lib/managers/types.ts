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
  totalValue: number;
  holdingCount: number;
  topHolding: string;
};

export type ManagerDetail = {
  manager: Manager;
  latest: FilingData;
  prior?: FilingData;
  changes: HoldingChange[];
};

export type ManagerIndex = {
  generatedAt: string;
  managers: ManagerSummary[];
};
