import type { Lang } from "@/lib/nav";
import type { SearchItem } from "@/lib/search/types";
import GlobalSearch from "./GlobalSearch";
export type { SearchItem } from "@/lib/search/types";
/** Compatibility adapter. All matching and interactions live in GlobalSearch. */
export default function SearchBox({
  lang,
  items,
  variant = "default",
  fill = false,
}: {
  lang: Lang;
  items: SearchItem[];
  variant?: "default" | "hero";
  placeholder?: string;
  fill?: boolean;
}) {
  return (
    <GlobalSearch
      lang={lang}
      index={{ items, stockAvailable: true, investorAvailable: true }}
      variant={variant === "hero" ? "hero" : fill ? "menu" : "header"}
    />
  );
}
