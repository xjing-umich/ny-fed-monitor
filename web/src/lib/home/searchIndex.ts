import "server-only";
import { cache } from "react";
import { getManagerIndex } from "@/lib/managers/source";
import { mostHeld } from "@/lib/aggregations";
import { INVESTOR_ALIASES } from "@/lib/investorAliases";
import { managerLabel } from "@/lib/managers/displayName";
import { cleanIssuer } from "@/lib/format";
import { stockDisplayName, stockZhName } from "@/lib/stocks/zhNames";
import { investorPath, stockPath } from "@/lib/urls";
import type { Lang } from "@/lib/nav";
import type { SearchItem } from "@/components/shell/SearchBox";

export const getSearchIndex = cache(
  async (lang: Lang): Promise<SearchItem[]> => {
    const [idx, held] = await Promise.all([getManagerIndex(), mostHeld(5000)]);
    const managers = idx.managers.map((m) => ({
      label: managerLabel(lang, m.slug, m.person),
      href: investorPath(lang, m.slug),
      keywords: [INVESTOR_ALIASES[m.slug], m.person, m.name]
        .filter(Boolean)
        .join(" "),
    }));
    const seen = new Set<string>();
    const stocks = held.flatMap((row) => {
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
    return [...managers, ...stocks];
  },
);
