// web/src/lib/aliases/resolve.ts
// 解析核心(spec §3.1, §6)。运行时永远是查 Map;复杂度全在构建期数据聚合。
// cache() 让同一请求内多次解析只构建一次索引(与 source.ts/securities.ts 一致)。
import "server-only";
import { cache } from "react";
import { normalize } from "./normalize";
import { cleanIssuer } from "@/lib/format";
import { isLikelyTicker } from "@/lib/externalLinks";
import { investorAliasEntries } from "./config";
import { getCusipMap } from "@/lib/managers/securities";
import type { EntityType, AliasEntry, AliasTarget, BuiltIndex } from "./types";

// 纯函数:AliasEntry[] → BuiltIndex。处理 spec §6 边界:
//   - 歧义(一个归一化别名 → 多个不同 canonical):不进 resolve(宁可 404 也不错跳),记日志。
//   - 自指 / canonical 撞别名:canonical 永远赢——canonical 自身的归一化键映射到它自己,
//     解析返回它,调用方再比较 rawSlug≠canonical 决定是否跳(见消费点)。
export function buildFromEntries(entries: AliasEntry[]): BuiltIndex {
  const norm2canon = new Map<string, Set<string>>();
  const display = new Map<string, Set<string>>();
  for (const e of entries) {
    const n = normalize(e.alias);
    if (!n) continue;
    (norm2canon.get(n) ?? norm2canon.set(n, new Set()).get(n)!).add(e.canonical);
    if (e.display) {
      (display.get(e.canonical) ?? display.set(e.canonical, new Set()).get(e.canonical)!).add(e.display);
    }
  }
  const resolve = new Map<string, string>();
  for (const [n, set] of norm2canon) {
    if (set.size === 1) resolve.set(n, [...set][0]);
    else console.warn(`[alias] 歧义别名 "${n}" → ${[...set].join(", ")}; 跳过(不重定向)`);
  }
  const displayArr = new Map<string, string[]>();
  for (const [c, set] of display) displayArr.set(c, [...set]);
  return { resolve, display: displayArr };
}

// 投资人索引:全部来自静态 config(两环境都可用)。
const buildInvestorIndex = cache(async (): Promise<BuiltIndex> =>
  buildFromEntries(investorAliasEntries())
);

// 公司名尾部噪声 token(剥掉后得口语短名:"APPLE INC"→"Apple")。涵盖企业形态、股份类别、
// 以及 OpenFIGI 富化名常见的杂项("VISA INC-CLASS A COMMON STOCK"、"COCA-COLA CO/THE")。
const CORP_SUFFIXES = new Set([
  "inc", "incorporated", "corp", "corporation", "co", "company", "cos",
  "ltd", "limited", "plc", "lp", "llc", "llp", "sa", "nv", "ag",
  "holdings", "hldgs", "holding", "group", "grp", "com", "the", "trust", "tr",
  "class", "cl", "a", "b", "c",
  "common", "stock", "stk", "shares", "share", "sponsored", "adr", "ads",
  "ord", "ordinary", "cap", "new", "del", "reit", "units", "unit",
]);

// cleanIssuer 后的名字 → 剥掉尾部噪声后缀的短名。先把连字符/斜杠当分隔符,再逐个剥尾部噪声 token。
// 仅用于派生一个"短名"别名;歧义(如 alphabet→GOOGL+GOOG、各双股份类别)由 buildFromEntries §6 闸拦掉。
function companyShortName(cleaned: string): string {
  const toks = cleaned.replace(/[-/]/g, " ").split(/\s+/).filter(Boolean);
  while (toks.length > 1 && CORP_SUFFIXES.has(toks[toks.length - 1].toLowerCase().replace(/[.,&]/g, ""))) {
    toks.pop();
  }
  return toks.join(" ");
}

// 个股索引:从证券脊梁 getCusipMap 派生(零 hardcode, spec §4.3)。
//   normalize(name)→ticker、短名→ticker、ticker→ticker(自指)、cusip→ticker。
// 无 Supabase env(本地)→ getCusipMap 为空 → 索引为空 → 优雅降级,不解析(spec §4.4)。
// 脊梁富化偶有脏 ticker(如 OpenFIGI 回传数字 "9.2343e+106"):非 ticker 形态者整行跳过,
// 否则会把"名字/cusip"重定向到一个根本不存在的垃圾 canonical。
const buildStockIndex = cache(async (): Promise<BuiltIndex> => {
  const cusipMap = await getCusipMap();
  const entries: AliasEntry[] = [];
  for (const [cusip, info] of cusipMap) {
    if (!info.ticker || !isLikelyTicker(info.ticker)) continue;
    entries.push({ alias: info.ticker, display: info.ticker, canonical: info.ticker });
    entries.push({ alias: cusip, display: "", canonical: info.ticker });
    if (info.name) {
      const full = cleanIssuer(info.name);
      entries.push({ alias: info.name, display: full, canonical: info.ticker });
      // 口语短名:"APPLE INC"→"Apple",让 /stocks/apple 也能命中(spec §4.3 name 派生的延伸)。
      const short = companyShortName(full);
      if (short && short.toLowerCase() !== full.toLowerCase()) {
        entries.push({ alias: short, display: short, canonical: info.ticker });
      }
    }
  }
  return buildFromEntries(entries);
});

async function indexFor(type: EntityType): Promise<BuiltIndex> {
  return type === "investor" ? buildInvestorIndex() : buildStockIndex();
}

// 任意别名 → canonical。仅返回 confidence=high(v1 全 high);loose 不经此函数(只进
// 结构化数据)。未命中 → null。调用方负责比较 rawSlug≠canonicalSlug 再决定跳转。
// rawSlug 来自 URL 动态段:Next 不会自动解码(中文别名到达时仍是 %E5%B7%B4… 形式),
// 故先 decodeURIComponent 再归一化;畸形编码则回退原串。
export async function resolveEntity(type: EntityType, rawSlug: string): Promise<AliasTarget | null> {
  const idx = await indexFor(type);
  let decoded = rawSlug;
  try {
    decoded = decodeURIComponent(rawSlug);
  } catch {
    // 畸形百分号编码 → 用原串(normalize 会去掉残余标点)。
  }
  const hit = idx.resolve.get(normalize(decoded));
  return hit ? { canonicalSlug: hit, confidence: "high" } : null;
}

// 该 canonical 的全部展示别名(用于结构化数据 alternateName, spec §5.2)。无 → []。
export async function getEntityAliases(type: EntityType, canonicalSlug: string): Promise<string[]> {
  const idx = await indexFor(type);
  return idx.display.get(canonicalSlug) ?? [];
}
