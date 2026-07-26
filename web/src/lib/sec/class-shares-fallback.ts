import { XMLParser } from "fast-xml-parser";

/** 分股类维度事实(localName 化):tag 如 EarningsPerShareDiluted,member 如 CommonClassAMember。 */
export type ClassShareFact = { tag: string; member: string; start: string; end: string; value: number };
export type DerivedShares = { period_end: string; shares: number; eps: number; cross_check_pct: number; member: string };

/** 双路互证容差:|股数tag − 净利÷EPS|/后者 超过即拒绝(V 的 basic-A 1714M 这类非经济总量来源在此被天然挡下,实测偏差 14.7%)。 */
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
      for (const holder of ["segment", "scenario"]) {
        const seg = entity ? (findByLocalName(entity, holder) as AnyObj | undefined) : undefined;
        if (!seg) continue;
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
    const pair = pairs.find(([eps, sh]) => eps != null && sh != null && eps.value > 0 && sh.value > 0);
    if (!pair) continue;
    const [eps, sharesTag] = pair as [ClassShareFact, ClassShareFact];
    const routeB = p.net_income / eps.value;
    const dev = Math.abs(sharesTag.value - routeB) / routeB;
    if (dev > CROSS_CHECK_TOLERANCE) continue;
    out.push({ period_end: p.period_end, shares: routeB, eps: eps.value, cross_check_pct: dev, member: eps.member });
  }
  return out;
}
