import { ogCard, OG_SIZE, OG_CONTENT_TYPE } from "@/lib/ogCard";

export const alt = "Superinvestor Consensus Report — Compounder";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export default function Image() {
  return ogCard({
    eyebrow: "Quarterly report · SEC 13F",
    title: "Superinvestor Consensus Report",
    subtitle: "Most held, most bought, most sold this quarter",
  });
}
