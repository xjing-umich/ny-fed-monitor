export type Metric = { label: string; label_zh?: string; value: string; unit?: string };
export type TableT = { title: string; title_zh?: string; columns?: string[]; rows: Record<string, unknown>[] };
export type Section = {
  key?: string; title: string; title_zh?: string;
  mode?: string; freshness_status?: string; data_date?: string | null;
  summary?: string; summary_zh?: string;
  interpretation?: string; interpretation_zh?: string;
  why_it_matters?: string; why_it_matters_zh?: string;
  key_metrics?: Metric[]; tables?: TableT[]; warnings?: string[]; warnings_zh?: string[];
  normalized_data?: Record<string, unknown>[];
};
export type Summary = { data_mode: string; live_sections: string[]; unavailable_sections: string[]; section_order: string[] };
export type DataPayload = { summary: Summary; sections: Record<string, Section>; as_of: string };
