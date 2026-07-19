import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Compounder · 复利",
    short_name: "Compounder",
    description:
      "Smart-money 13F holdings and single-stock valuation.",
    start_url: "/",
    display: "standalone",
    background_color: "#0E1411",
    theme_color: "#4FBF8A",
    icons: [
      { src: "/icon.svg", type: "image/svg+xml", sizes: "any" },
      { src: "/icon.png", type: "image/png", sizes: "512x512" },
      { src: "/apple-icon.png", type: "image/png", sizes: "180x180" },
    ],
  };
}
