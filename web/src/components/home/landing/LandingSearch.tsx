import type { Lang } from "@/lib/nav";
import type { SearchIndex } from "@/lib/search/types";
import GlobalSearch from "@/components/shell/GlobalSearch";
export default function LandingSearch({
  lang,
  index,
}: {
  lang: Lang;
  index: SearchIndex;
}) {
  return <GlobalSearch lang={lang} index={index} variant="hero" />;
}
