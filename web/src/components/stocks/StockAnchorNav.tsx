import type { Lang } from "@/lib/nav";
import { BAND_COPY, type StockAnchor } from "@/lib/stocks/stockConclusion";
import { PageAnchorNav } from "@/components/common/PageAnchorNav";

export function StockAnchorNav({ lang, anchors }: { lang: Lang; anchors: StockAnchor[] }) {
  return <PageAnchorNav ariaLabel={BAND_COPY[lang].anchorsAria} anchors={anchors} />;
}
