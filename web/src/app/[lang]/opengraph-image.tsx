import { ogCard, OG_SIZE, OG_CONTENT_TYPE } from "@/lib/ogCard";

// Site-wide default social card. Per-route opengraph-image files override this.
export const alt = "Compounder — smart-money holdings × valuation";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export default function OpengraphImage() {
  return ogCard({
    title: "Smart-money holdings × valuation",
    subtitle: "Superinvestor 13F holdings · single-stock valuation",
  });
}
