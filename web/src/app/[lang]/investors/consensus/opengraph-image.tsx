import { ogCard, OG_SIZE, OG_CONTENT_TYPE } from "@/lib/ogCard";

export const alt = "Superinvestor 13F consensus holdings — Compounder";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export default function Image() {
  return ogCard({
    eyebrow: "Superinvestor 13F",
    title: "Consensus holdings",
  });
}
