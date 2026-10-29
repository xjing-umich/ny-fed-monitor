import type { Lang } from "../nav";

const LOCALE: Record<Lang, string> = { zh: "zh-CN", en: "en-US" };
const compact = (lang: Lang) => new Intl.NumberFormat(LOCALE[lang], { notation: "compact", maximumSignificantDigits: 3 });
const COMPACT = { zh: compact("zh"), en: compact("en") };
const DECIMAL = new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 });
const CENTS = new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const INTEGER = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });
const DATES = {
  zh: new Intl.DateTimeFormat("zh-CN", { year: "numeric", month: "numeric", day: "numeric", timeZone: "UTC" }),
  en: new Intl.DateTimeFormat("en-US", { year: "numeric", month: "short", day: "numeric", timeZone: "UTC" }),
};
const sign = (v: number) => v < 0 ? "−" : "";

/** 金额均为美元；表格中文币种由表头给出，正文/卡片金额自带币种。 */
export function money(v: number, lang: Lang, mode: "prose" | "table" = "prose"): string {
  if (!Number.isFinite(v)) return "—";
  const abs = Math.abs(v);
  const n = abs < (lang === "zh" ? 1e4 : 1e3) ? DECIMAL.format(abs) : COMPACT[lang].format(abs);
  return lang === "zh" ? `${sign(v)}${n}${mode === "table" ? "" : "美元"}` : `${sign(v)}$${n}`;
}

export function price(v: number): string {
  return Number.isFinite(v) ? `${sign(v)}$${CENTS.format(Math.abs(v))}` : "—";
}

export function perShareValue(v: number): string {
  return Number.isFinite(v) ? Math.abs(v) >= 10 ? `${sign(v)}$${INTEGER.format(Math.abs(v))}` : price(v) : "—";
}

/** 股数表头注明“股”；英文保留完整整数。 */
export function shares(v: number, lang: Lang): string {
  if (!Number.isFinite(v)) return "—";
  return `${sign(v)}${lang === "zh" ? COMPACT.zh.format(Math.abs(v)) : INTEGER.format(Math.abs(v))}`;
}

/** 输入为比例；避免四舍五入后出现 −0%。 */
export function pctDelta(v: number): string {
  if (!Number.isFinite(v)) return "—";
  const rounded = Math.round(Math.abs(v) * 1000) / 10;
  return `${rounded === 0 ? "" : v > 0 ? "+" : "−"}${DECIMAL.format(rounded)}%`;
}

export function weight(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return "—";
  if (v > 0 && v < 0.001) return "<0.1%";
  return `${sign(v)}${(Math.abs(v) * 100).toFixed(1)}%`;
}

/** 日期只按源数据的 ISO 日历日，不随浏览器时区偏移，也不纠正无效日期。 */
function parseDay(value: string): Date | null {
  const match = /^(\d{4}-\d{2}-\d{2})(?:$|T)/.exec(value);
  if (!match) return null;
  if (value.includes("T") && !Number.isFinite(Date.parse(value))) return null;
  const day = new Date(`${match[1]}T00:00:00Z`);
  return Number.isFinite(day.getTime()) && day.toISOString().slice(0, 10) === match[1] ? day : null;
}

export function date(value: string, lang: Lang, mode: "prose" | "table" = "prose"): string {
  const day = parseDay(value);
  if (!day) return value;
  if (lang === "zh") return mode === "table" ? day.toISOString().slice(0, 10) : `${day.getUTCFullYear()}年${day.getUTCMonth() + 1}月${day.getUTCDate()}日`;
  return DATES.en.format(day);
}

export function quarter(period: string | null, lang: Lang, mode: "label" | "prose" = "label"): string {
  if (!period) return "";
  const day = parseDay(period);
  if (!day) return period;
  const year = day.getUTCFullYear();
  const q = Math.floor(day.getUTCMonth() / 3) + 1;
  if (mode === "prose") return lang === "zh" ? `${year}年${["一", "二", "三", "四"][q - 1]}季度` : `the ${["first", "second", "third", "fourth"][q - 1]} quarter of ${year}`;
  return lang === "zh" ? `${year}Q${q}` : `Q${q} ${year}`;
}

export function range(lo: number, hi: number, format: (v: number) => string = perShareValue): string {
  const low = format(lo);
  const high = format(hi);
  return low === high ? low : `${low}–${high}`;
}
