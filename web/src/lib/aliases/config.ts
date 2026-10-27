// web/src/lib/aliases/config.ts
// 投资人「人工策划」别名的归宿与读取(spec §4.1)。三个静态来源在此合并成 AliasEntry[]:
//   1. config/managers.json 新增的 people[]/aliases[](人名含接班人、票代、中英)
//   2. 既有 INVESTOR_ALIASES(中文搜索词,已维护 34 位,复用免重录)
//   3. src/data/13f/former-names.json(EDGAR 曾用名,由 ingest 写;Task 6 前为空 {})
// 全为 confidence=high。静态导入 → 有库/无库两环境都可用(spec §4.4)。
import managersRaw from "../../../config/managers.json";
import { INVESTOR_ALIASES } from "@/lib/investorAliases";
import formerNamesRaw from "@/data/13f/former-names.json";
import featuredRaw from "../../../config/report-featured.json";
import type { AliasEntry } from "./types";

type CuratedPerson = { name: string; zh?: string; role?: string };
type CuratedManager = {
  cik: string;
  slug: string;
  person: string;
  people?: CuratedPerson[];
  aliases?: string[];
};

const MANAGERS = managersRaw as CuratedManager[];
const FORMER = formerNamesRaw as Record<string, string[]>;
// 名家清单(季报邮件用)里的中文全名,如"比尔·阿克曼""塞斯·卡拉曼"。
const FEATURED_ZH = new Map(
  (featuredRaw as Array<string | { slug: string; zh?: string }>)
    .filter((x): x is { slug: string; zh: string } => typeof x === "object" && !!x.zh)
    .map((x) => [x.slug, x.zh]),
);

export function investorAliasEntries(): AliasEntry[] {
  const out: AliasEntry[] = [];
  // display="" → 该别名只用于解析/重定向,不进 alternateName(如 slug 自指)。
  const push = (alias: string, canonical: string, display: string = alias) => {
    if (alias && alias.trim()) out.push({ alias, display, canonical });
  };
  for (const m of MANAGERS) {
    push(m.slug, m.slug, "");        // 自指:变体(如 "Berkshire Hathaway")归一化后命中 canonical
    push(m.person, m.slug);          // 现有英文人名
    for (const p of m.people ?? []) {
      push(p.name, m.slug);
      if (p.zh) push(p.zh, m.slug);
    }
    for (const a of m.aliases ?? []) push(a, m.slug);
    const zh = INVESTOR_ALIASES[m.slug];
    if (zh) for (const tok of zh.split(/\s+/)) push(tok, m.slug);
    for (const fn of FORMER[m.slug] ?? []) push(fn, m.slug);
  }
  return out;
}

// Person 结构化数据的 alternateName 只放「这个人本人」的名字变体。
// 上面的解析层故意宽:接班人、合伙人、票代、基金中文名、EDGAR 曾用名都能命中同一投资人页;
// 但把它们写进 Person.alternateName,等于声明"Greg Abel / BRK.B / NBH INC 是巴菲特的别名",
// 搜索和 AI 引擎会把不同实体并成一个。
// 判定:中文锚名 = people[] 里本人那条的 zh,没有则取 INVESTOR_ALIASES 首词(约定为人名)。
// 中文人名姓在后,所以与锚名互为结尾的词算本人变体(沃伦巴菲特、伯里/迈克尔伯里);
// 盖茨基金会、米勒价值这类以姓开头的基金名因此自然排除。
// 以人姓结尾的公司名(加德纳鲁索 = Gardner Russo)规则分不出,列在下面;新增此类别名时补进来。
const FIRM_NAMES_ENDING_IN_SURNAME = new Set(["加德纳鲁索", "林赛尔特雷恩"]);

// 中文站上显示的中文名:名家清单的全名 > people[] 本人的 zh > INVESTOR_ALIASES 首词。没有 → null(显示英文名)。
export function managerZhName(slug: string, person: string): string | null {
  return FEATURED_ZH.get(slug) ?? zhAnchor(slug, person);
}

function zhAnchor(slug: string, person: string): string | null {
  const m = MANAGERS.find((x) => x.slug === slug);
  return m?.people?.find((p) => p.name === person)?.zh ?? INVESTOR_ALIASES[slug]?.split(/\s+/).filter(Boolean)[0] ?? null;
}

export function personNameAliases(slug: string, person: string): string[] {
  const m = MANAGERS.find((x) => x.slug === slug);
  const zhTokens = INVESTOR_ALIASES[slug]?.split(/\s+/).filter(Boolean) ?? [];
  const anchor = zhAnchor(slug, person);
  if (!anchor) return [];
  const out = new Set([anchor]);
  const full = FEATURED_ZH.get(slug);
  if (full) out.add(full);
  for (const t of [...(m?.aliases ?? []), ...zhTokens]) {
    if (t.length < 2 || FIRM_NAMES_ENDING_IN_SURNAME.has(t)) continue;
    if (t.endsWith(anchor) || anchor.endsWith(t)) out.add(t);
  }
  return [...out];
}
