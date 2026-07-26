import { XMLParser } from "fast-xml-parser";
import type { FundamentalPeriod } from "./normalize-facts";
import type { NormalizedFiling } from "./company-submissions";
import { filingIndexUrl, secFetchJson, secFetchText, sleep } from "./sec-client";

/** 分股类维度事实(localName 化):tag 如 EarningsPerShareDiluted,member 如 CommonClassAMember。 */
export type ClassShareFact = { tag: string; member: string; start: string; end: string; value: number };
export type DerivedShares = { period_end: string; shares: number; eps: number; cross_check_pct: number; member: string };

/** 双路互证容差:|股数tag − 净利÷EPS|/后者 超过即拒绝(V 的 basic-A 1714M 这类非经济总量来源在此被天然挡下,约 12.8%)。 */
export const CROSS_CHECK_TOLERANCE = 0.1;
/** FY duration 窗口,对齐 normalize-facts flowBucket 的 350–380 天口径。 */
const FY_DAYS_MIN = 350;
const FY_DAYS_MAX = 380;

const SHARE_TAGS = new Set([
  "EarningsPerShareDiluted",
  "EarningsPerShareBasic",
  "WeightedAverageNumberOfDilutedSharesOutstanding",
  "WeightedAverageNumberOfSharesOutstandingBasic",
]);

const localName = (key: string) => key.split(":").pop() ?? key;
const asArray = <T,>(x: T | T[] | undefined | null): T[] => (Array.isArray(x) ? x : x == null ? [] : [x]);

/** 挂牌股类 token:ticker 后缀 .A/.B → ClassA/ClassB,无后缀默认 ClassA(V/多数单挂牌类)。 */
export function listedClassToken(ticker: string): string {
  const m = ticker.toUpperCase().match(/\.([AB])$/);
  return `Class${m ? m[1] : "A"}`;
}

/** member 匹配:localName 含 token 且 token 后一位不是数字(把 V 的 CommonClassB1/B2Member 从 ClassB 排除)。 */
export function memberMatchesToken(member: string, token: string): boolean {
  const idx = member.indexOf(token);
  if (idx < 0) return false;
  const next = member.charAt(idx + token.length);
  return !/[0-9]/.test(next);
}

type AnyObj = Record<string, unknown>;

function findByLocalName(obj: AnyObj, name: string): unknown {
  for (const [k, v] of Object.entries(obj)) if (localName(k) === name) return v;
  return undefined;
}

/**
 * 提取带 ClassOfStock 维度的分股类事实。companyfacts API 在接口层剥掉带维度事实,
 * 这里读的是 filing 的提取版 XBRL instance(*_htm.xml),维度仍在 context 里。
 * 命名空间兼容:V 用默认命名空间(元素无前缀),其他 filer 可能带 xbrli: 前缀 → 一律按 localName 匹配。
 * parseTagValue:false 是硬纪律(CUSIP 科学计数法事故),数值一律显式 Number()。
 * 维度位置:segment 在 entity 内; scenario 是 context 的直接子节点(XBRL 2.1 spec)。
 */
export function extractClassShareFacts(xml: string): ClassShareFact[] {
  const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "@_", parseTagValue: false });
  const parsed = parser.parse(xml) as AnyObj;
  const root = findByLocalName(parsed, "xbrl") as AnyObj | undefined;
  if (!root) return [];

  // context id → { start,end,classMember } (维度可在 segment 或 scenario 下)
  const contexts = new Map<string, { start: string; end: string; member: string }>();
  for (const [k, v] of Object.entries(root)) {
    if (localName(k) !== "context") continue;
    for (const ctx of asArray(v as AnyObj | AnyObj[])) {
      const id = (ctx as AnyObj)["@_id"] as string | undefined;
      const period = findByLocalName(ctx as AnyObj, "period") as AnyObj | undefined;
      if (!id || !period) continue;
      const start = findByLocalName(period, "startDate");
      const end = findByLocalName(period, "endDate");
      if (typeof start !== "string" || typeof end !== "string") continue; // instant/无 duration → 不是本回退关心的流量事实
      const entity = findByLocalName(ctx as AnyObj, "entity") as AnyObj | undefined;
      let member: string | undefined;

      // segment 从 entity 内取
      if (entity) {
        const seg = findByLocalName(entity, "segment") as AnyObj | undefined;
        if (seg) {
          for (const [mk, mv] of Object.entries(seg)) {
            if (localName(mk) !== "explicitMember") continue;
            for (const em of asArray(mv as AnyObj | AnyObj[])) {
              const dim = (em as AnyObj)["@_dimension"];
              const text = (em as AnyObj)["#text"];
              if (typeof dim === "string" && dim.includes("ClassOfStock") && typeof text === "string") {
                member = localName(text);
              }
            }
          }
        }
      }

      // scenario 从 context 直接子节点取(XBRL 2.1: segment in entity, scenario is sibling of entity)
      if (!member) {
        const scenario = findByLocalName(ctx as AnyObj, "scenario") as AnyObj | undefined;
        if (scenario) {
          for (const [mk, mv] of Object.entries(scenario)) {
            if (localName(mk) !== "explicitMember") continue;
            for (const em of asArray(mv as AnyObj | AnyObj[])) {
              const dim = (em as AnyObj)["@_dimension"];
              const text = (em as AnyObj)["#text"];
              if (typeof dim === "string" && dim.includes("ClassOfStock") && typeof text === "string") {
                member = localName(text);
              }
            }
          }
        }
      }

      if (member) contexts.set(id, { start, end, member });
    }
  }

  // 事实:root 下 localName 命中 SHARE_TAGS 的元素,contextRef 指向分股类 context
  const out: ClassShareFact[] = [];
  const seen = new Map<string, number>(); // 去重:同 (tag,member,start,end) 多次申报(spike 实测有重复);值冲突则整键剔除
  const conflicted = new Set<string>();
  for (const [k, v] of Object.entries(root)) {
    const tag = localName(k);
    if (!SHARE_TAGS.has(tag)) continue;
    for (const fact of asArray(v as AnyObj | AnyObj[])) {
      const ref = (fact as AnyObj)["@_contextRef"] as string | undefined;
      const text = (fact as AnyObj)["#text"];
      const ctx = ref ? contexts.get(ref) : undefined;
      if (!ctx || typeof text !== "string") continue;
      const value = Number(text.replace(/,/g, ""));
      if (!Number.isFinite(value)) continue;
      const key = `${tag}|${ctx.member}|${ctx.start}|${ctx.end}`;
      const prev = seen.get(key);
      if (prev != null && prev !== value) { conflicted.add(key); continue; }
      if (prev == null) {
        seen.set(key, value);
        out.push({ tag, member: ctx.member, start: ctx.start, end: ctx.end, value });
      }
    }
  }
  return out.filter((f) => !conflicted.has(`${f.tag}|${f.member}|${f.start}|${f.end}`));
}

const durationDays = (f: ClassShareFact) =>
  (new Date(f.end).getTime() - new Date(f.start).getTime()) / 86_400_000;

/**
 * 经济股数推导(spec §2.3):
 *   路线B(定值) = 该期总净利 ÷ 挂牌类 EPS —— 能复现挂牌类每股收益的经济除数,换算率(如 BRK 1:1500)天然内生;
 *   路线A(对账) = 挂牌类股数 tag。
 * 配对必须同口径(摊薄/摊薄 优先,basic/basic 兜底,不混配),双路都在且偏差 ≤10% 才接受;
 * 任一路缺、超差、净利≤0 → 该年不补(宁缺毋假)。
 */
export function deriveEconomicShares(
  facts: ClassShareFact[],
  token: string,
  periods: { period_end: string; net_income: number | null }[],
): DerivedShares[] {
  const out: DerivedShares[] = [];
  for (const p of periods) {
    if (p.net_income == null || !(p.net_income > 0)) continue;
    const inWindow = facts.filter(
      (f) => f.end === p.period_end && durationDays(f) >= FY_DAYS_MIN && durationDays(f) <= FY_DAYS_MAX && memberMatchesToken(f.member, token),
    );
    const pick = (tag: string) => inWindow.find((f) => f.tag === tag);
    const pairs: [ClassShareFact | undefined, ClassShareFact | undefined][] = [
      [pick("EarningsPerShareDiluted"), pick("WeightedAverageNumberOfDilutedSharesOutstanding")],
      [pick("EarningsPerShareBasic"), pick("WeightedAverageNumberOfSharesOutstandingBasic")],
    ];
    const pair = pairs.find(([eps, sh]) => eps != null && sh != null && eps.value > 0 && sh.value > 0 && eps.member === sh.member);
    if (!pair) continue;
    const [eps, sharesTag] = pair as [ClassShareFact, ClassShareFact];
    const routeB = p.net_income / eps.value;
    const dev = Math.abs(sharesTag.value - routeB) / routeB;
    if (dev > CROSS_CHECK_TOLERANCE) continue;
    out.push({ period_end: p.period_end, shares: routeB, eps: eps.value, cross_check_pct: dev, member: eps.member });
  }
  return out;
}

/** 触发窄闸(spec §2.1):annual 全部年份缺 shares_diluted 且至少一年有净利。字段已有值的票零影响。 */
export function needsClassSharesFallback(annual: FundamentalPeriod[]): boolean {
  return (
    annual.length > 0 &&
    annual.every((p) => p.shares_diluted == null) &&
    annual.some((p) => p.net_income != null)
  );
}

/** 每票最多解析的 10-K 份数:每份 instance 带 3 个 FY 的利润表事实(BRK 实测),3 份覆盖 6-FY 窗口有余。 */
const MAX_10K_INSTANCES = 3;

type EdgarIndex = { directory?: { item?: { name?: string }[] } };

/** 提取版 instance 文件名 = primaryDocument 去 .htm 加 _htm.xml;404 时回退读目录 index.json 找 *_htm.xml。 */
async function fetchInstanceXml(filing: NormalizedFiling): Promise<string | null> {
  const dir = filingIndexUrl(filing.cik, filing.accession_number);
  const guess = filing.primary_document?.replace(/\.htm$/i, "_htm.xml");
  if (guess) {
    try {
      return await secFetchText(`${dir}${guess}`);
    } catch {
      // fall through to index.json
    }
  }
  try {
    const index = await secFetchJson<EdgarIndex>(`${dir}index.json`);
    const name = index.directory?.item?.map((i) => i.name).find((n) => n?.endsWith("_htm.xml"));
    if (!name) return null;
    return await secFetchText(`${dir}${name}`);
  } catch {
    return null;
  }
}

/**
 * 分股类经济股数回退(spec §2):从最近 3 份 10-K 的提取版 XBRL instance 抽分股类事实,
 * 双路互证推导经济股数,就地 patch annual 行(shares_diluted / 空缺的 eps_diluted / raw_facts 溯源)。
 * 任何异常吞掉打日志 —— 回退绝不打断主 ingest。返回补上的年数。
 */
export async function applyClassSharesFallback(annual: FundamentalPeriod[], filings: NormalizedFiling[]): Promise<number> {
  try {
    const ticker = annual[0]?.ticker;
    if (!ticker) return 0;
    const tenKs = filings
      .filter((f) => f.form === "10-K" && f.primary_document)
      .sort((a, b) => (b.filing_date ?? "").localeCompare(a.filing_date ?? ""))
      .slice(0, MAX_10K_INSTANCES);
    if (!tenKs.length) return 0;

    const facts: ClassShareFact[] = [];
    for (const filing of tenKs) {
      const xml = await fetchInstanceXml(filing);
      if (xml) facts.push(...extractClassShareFacts(xml));
      await sleep(300);
    }
    if (!facts.length) return 0; // MLP/单类缺数等:instance 里没有分股类事实 → 诚实空缺

    const token = listedClassToken(ticker);
    const derived = deriveEconomicShares(
      facts,
      token,
      annual.map((p) => ({ period_end: p.period_end, net_income: p.net_income })),
    );
    const byEnd = new Map(derived.map((d) => [d.period_end, d]));
    let patched = 0;
    for (const row of annual) {
      const d = byEnd.get(row.period_end);
      if (!d) continue;
      row.shares_diluted = Math.round(d.shares);
      if (row.eps_diluted == null) row.eps_diluted = d.eps; // 挂牌类申报 EPS,非合成值
      row.raw_facts = {
        ...row.raw_facts,
        shares_diluted: {
          tag: "class-dimension:eps-implied",
          val: String(Math.round(d.shares)),
          filed: row.filing_date ?? "",
          days: null,
          derived: true,
          member: d.member,
          cross_check_pct: d.cross_check_pct,
        },
      };
      patched++;
    }
    return patched;
  } catch (err) {
    console.error(`class-shares fallback failed (non-fatal): ${err instanceof Error ? err.message : String(err)}`);
    return 0;
  }
}
