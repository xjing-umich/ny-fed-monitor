// web/src/lib/aliases/config.ts
// 投资人「人工策划」别名的归宿与读取(spec §4.1)。三个静态来源在此合并成 AliasEntry[]:
//   1. config/managers.json 新增的 people[]/aliases[](人名含接班人、票代、中英)
//   2. 既有 INVESTOR_ALIASES(中文搜索词,已维护 34 位,复用免重录)
//   3. src/data/13f/former-names.json(EDGAR 曾用名,由 ingest 写;Task 6 前为空 {})
// 全为 confidence=high。静态导入 → 有库/无库两环境都可用(spec §4.4)。
import managersRaw from "../../../config/managers.json";
import { INVESTOR_ALIASES } from "@/lib/investorAliases";
import formerNamesRaw from "@/data/13f/former-names.json";
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
