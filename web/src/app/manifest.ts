import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Compounder · 复利",
    short_name: "Compounder",
    description:
      "Smart-money 13F holdings and single-stock valuation.",
    start_url: "/en",
    display: "standalone",
    background_color: "#FAF8F3",
    theme_color: "#1B5E3F",
    icons: [
      { src: "/icon.svg", type: "image/svg+xml", sizes: "any" },
      { src: "/icon.png", type: "image/png", sizes: "512x512" },
      { src: "/apple-icon.png", type: "image/png", sizes: "180x180" },
    ],
  };
}
