import "server-only";
import { cache } from "react";
import { getManagerIndex } from "@/lib/managers/source";
import { readConsensusHeld } from "@/lib/managers/consensusRead";
import { INVESTOR_ALIASES } from "@/lib/investorAliases";
import { managerLabel } from "@/lib/managers/displayName";
import { cleanIssuer } from "@/lib/format";
import { stockDisplayName, stockZhName } from "@/lib/stocks/zhNames";
import { investorPath, stockPath } from "@/lib/urls";
import type { Lang } from "@/lib/nav";
import type { SearchIndex } from "@/lib/search/types";
export type { SearchIndex } from "@/lib/search/types";
export const readSearchIndex = cache(
  async (lang: Lang): Promise<SearchIndex> => {
    const [idx, held] = await Promise.allSettled([
      getManagerIndex(),
      readConsensusHeld(4000),
    ]);
    const managers =
      idx.status === "fulfilled"
        ? idx.value.managers.map((m) => ({
            label: managerLabel(lang, m.slug, m.person),
            href: investorPath(lang, m.slug),
            keywords: [INVESTOR_ALIASES[m.slug], m.person, m.name]
              .filter(Boolean)
              .join(" "),
          }))
        : [];
    const seen = new Set<string>();
    const stocks = (
      held.status === "fulfilled" ? (held.value ?? []) : []
    ).flatMap((row) => {
      if (seen.has(row.cusip)) return [];
      seen.add(row.cusip);
      return [
        {
          label: stockDisplayName(lang, row.cusip, cleanIssuer(row.issuer)),
          href: stockPath(lang, row.cusip),
          keywords: [row.cusip, stockZhName(row.cusip), row.issuer]
            .filter(Boolean)
            .join(" "),
        },
      ];
    });
    return {
      items: [...managers, ...stocks],
      stockAvailable: held.status === "fulfilled" && held.value !== null,
      investorAvailable: idx.status === "fulfilled",
    };
  },
);
export const getSearchIndex = cache(
  async (lang: Lang) => (await readSearchIndex(lang)).items,
);
