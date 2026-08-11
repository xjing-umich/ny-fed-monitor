import { XMLParser } from "fast-xml-parser";

/** instance 里的一条事实。value 已应用 sign/scale;dims 为 localName(轴)→localName(成员)。 */
export type InstanceFact = {
  tag: string;
  value: number;
  dims: Record<string, string>;
  instant?: string;
  start?: string;
  end?: string;
};

/** FY duration 窗口,对齐 normalize-facts flowBucket 的口径。 */
export const FY_DAYS_MIN = 350;
export const FY_DAYS_MAX = 380;

const localName = (key: string) => key.split(":").pop() ?? key;
const asArray = <T,>(x: T | T[] | undefined | null): T[] => (Array.isArray(x) ? x : x == null ? [] : [x]);

type AnyObj = Record<string, unknown>;

function findByLocalName(obj: AnyObj, name: string): unknown {
  for (const [k, v] of Object.entries(obj)) if (localName(k) === name) return v;
  return undefined;
}

function readExplicitMembers(holder: AnyObj, into: Record<string, string>) {
  for (const [mk, mv] of Object.entries(holder)) {
    if (localName(mk) !== "explicitMember") continue;
    for (const em of asArray(mv as AnyObj | AnyObj[])) {
      const dim = (em as AnyObj)["@_dimension"];
      const text = (em as AnyObj)["#text"];
      if (typeof dim === "string" && typeof text === "string") into[localName(dim)] = localName(text);
    }
  }
}

/**
 * 提取 instance 的全部 USD 事实,保留维度。
 *
 * 与 class-shares-fallback.ts 的专用解析并存而非替换它 —— 后者已上生产,不动它以免回归。
 *
 * 硬纪律(spec §1.4):
 *  - parseTagValue:false,数值显式 Number()(CUSIP 科学计数法事故的既定纪律);
 *  - 只接受 unitRef 指向 iso4217:USD 的事实。BRK FY2025 instance 的 14 个单位里只有 1 个是
 *    USD,另有 JPY/EUR/GBP;DebtInstrumentFaceAmount 的 2343.0 是 2,343 亿日元债,不判币种
 *    会造出万亿级假债务;
 *  - 维度两处都扫:segment 在 entity 内,scenario 是 context 的直接子节点(XBRL 2.1);
 *  - 一律按 localName 匹配(不同 filer 命名空间前缀不同)。
 */
export function extractInstanceFacts(xml: string): InstanceFact[] {
  const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "@_", parseTagValue: false });
  const root = findByLocalName(parser.parse(xml) as AnyObj, "xbrl") as AnyObj | undefined;
  if (!root) return [];

  // ① 单位:只留 USD
  const usdUnits = new Set<string>();
  for (const [k, v] of Object.entries(root)) {
    if (localName(k) !== "unit") continue;
    for (const u of asArray(v as AnyObj | AnyObj[])) {
      const id = (u as AnyObj)["@_id"];
      const measure = findByLocalName(u as AnyObj, "measure");
      if (typeof id === "string" && typeof measure === "string" && /iso4217:USD$/.test(measure)) usdUnits.add(id);
    }
  }

  // ② 上下文
  type Ctx = { instant?: string; start?: string; end?: string; dims: Record<string, string> };
  const contexts = new Map<string, Ctx>();
  for (const [k, v] of Object.entries(root)) {
    if (localName(k) !== "context") continue;
    for (const c of asArray(v as AnyObj | AnyObj[])) {
      const ctx = c as AnyObj;
      const id = ctx["@_id"];
      const period = findByLocalName(ctx, "period") as AnyObj | undefined;
      if (typeof id !== "string" || !period) continue;
      const dims: Record<string, string> = {};
      const entity = findByLocalName(ctx, "entity") as AnyObj | undefined;
      if (entity) {
        const seg = findByLocalName(entity, "segment") as AnyObj | undefined;
        if (seg) readExplicitMembers(seg, dims);
      }
      const scenario = findByLocalName(ctx, "scenario") as AnyObj | undefined;
      if (scenario) readExplicitMembers(scenario, dims);
      const instant = findByLocalName(period, "instant");
      const start = findByLocalName(period, "startDate");
      const end = findByLocalName(period, "endDate");
      contexts.set(id, {
        instant: typeof instant === "string" ? instant : undefined,
        start: typeof start === "string" ? start : undefined,
        end: typeof end === "string" ? end : undefined,
        dims,
      });
    }
  }

  // ③ 事实
  const out: InstanceFact[] = [];
  for (const [k, v] of Object.entries(root)) {
    const tag = localName(k);
    if (tag === "context" || tag === "unit" || tag === "schemaRef") continue;
    for (const f of asArray(v as AnyObj | AnyObj[])) {
      if (typeof f !== "object" || f === null) continue;
      const fact = f as AnyObj;
      const unitRef = fact["@_unitRef"];
      const ctxRef = fact["@_contextRef"];
      if (typeof unitRef !== "string" || typeof ctxRef !== "string") continue;
      if (!usdUnits.has(unitRef)) continue; // 币种闸
      const ctx = contexts.get(ctxRef);
      if (!ctx) continue;
      const raw = fact["#text"];
      if (typeof raw !== "string") continue;
      const n = Number(raw);
      if (!Number.isFinite(n)) continue;
      const sign = fact["@_sign"] === "-" ? -1 : 1;
      const scale = typeof fact["@_scale"] === "string" ? Number(fact["@_scale"]) : 0;
      if (!Number.isFinite(scale)) continue;
      out.push({
        tag,
        value: sign * n * Math.pow(10, scale),
        dims: ctx.dims,
        instant: ctx.instant,
        start: ctx.start,
        end: ctx.end,
      });
    }
  }
  return out;
}

export function isDimensionless(f: InstanceFact): boolean {
  return Object.keys(f.dims).length === 0;
}

/** 轴名按「包含」匹配(申报里写作 ProductOrServiceAxis,调用方传 "ProductOrService")。 */
export function dimIs(f: InstanceFact, axisContains: string, memberLocalName: string): boolean {
  for (const [axis, member] of Object.entries(f.dims)) {
    if (axis.includes(axisContains) && member === memberLocalName) return true;
  }
  return false;
}

function isFyDuration(f: InstanceFact): boolean {
  if (!f.start || !f.end) return false;
  const days = (new Date(f.end).getTime() - new Date(f.start).getTime()) / 86400000;
  return days >= FY_DAYS_MIN && days <= FY_DAYS_MAX;
}

/**
 * 按条件取单值。同 (tag, period, dims) 多次申报时取最大绝对值那条(实测有重复申报);
 * 无匹配返回 null —— **绝不**在维度条件不满足时回退到别的维度,那正是漏项与串值的来源。
 */
export function pickFact(
  facts: InstanceFact[],
  opts: {
    tag: string;
    instant?: string;
    end?: string;
    fyOnly?: boolean;
    dimensionless?: boolean;
    axisContains?: string;
    member?: string;
  },
): number | null {
  const hits = facts.filter((f) => {
    if (f.tag !== opts.tag) return false;
    if (opts.instant != null && f.instant !== opts.instant) return false;
    if (opts.end != null && f.end !== opts.end) return false;
    if (opts.fyOnly && !isFyDuration(f)) return false;
    if (opts.dimensionless && !isDimensionless(f)) return false;
    if (opts.axisContains != null && opts.member != null && !dimIs(f, opts.axisContains, opts.member)) return false;
    return true;
  });
  if (!hits.length) return null;
  return hits.reduce((a, b) => (Math.abs(b.value) > Math.abs(a.value) ? b : a)).value;
}
