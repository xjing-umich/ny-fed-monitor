export interface SearchItem {
  label: string;
  href: string;
  keywords?: string;
}
export type SearchIndex = {
  items: SearchItem[];
  stockAvailable: boolean;
  investorAvailable: boolean;
};
export type SearchResult = SearchItem & { kind: "company" | "investor" };
