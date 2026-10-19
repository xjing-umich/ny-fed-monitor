import { ogCard, OG_SIZE, OG_CONTENT_TYPE } from "@/lib/ogCard";

// Site-wide default social card. Per-route opengraph-image files override this.
export const alt = "Compounder — smart-money holdings × valuation";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;
// 静态缓存:否则 [lang] 段下的 OG 图每次被抓取都在函数里重绘 PNG(计入 Vercel Fluid Active CPU)。
export const dynamic = "force-static";
export const revalidate = 604800;

export default function OpengraphImage() {
  return ogCard({
    title: "Smart-money holdings × valuation",
    subtitle: "Superinvestor 13F holdings · single-stock valuation",
  });
}
