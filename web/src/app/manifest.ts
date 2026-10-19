import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Compounder · 复利",
    short_name: "Compounder",
    description:
      "Smart-money 13F holdings and single-stock valuation.",
    start_url: "/",
    display: "standalone",
    background_color: "#f8fbf9",
    // manifest 不能按配色切换;用品牌绿,深浅用户都不会看到与页面反差的白条/黑条。
    theme_color: "#0e6c43",
    icons: [
      { src: "/icon.svg", type: "image/svg+xml", sizes: "any" },
      { src: "/icon.png", type: "image/png", sizes: "512x512" },
      { src: "/apple-icon.png", type: "image/png", sizes: "180x180" },
    ],
  };
}
