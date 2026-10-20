import type { MetadataRoute } from "next";

// 每个 user-agent 组各自成立(爬虫只读与自己最匹配的那一组),所以 /api/ 的 disallow 要写进每一组,
// 只写在 "*" 里对 GPTBot 等显式点名的爬虫无效。
const DISALLOW = ["/api/"];

// Explicitly welcome AI answer-engine + training crawlers (GEO).
const AI_BOTS = [
  "GPTBot",
  "OAI-SearchBot",
  "ChatGPT-User",
  "PerplexityBot",
  "ClaudeBot",
  "Claude-Web",
  "Google-Extended",
  "Applebot-Extended",
];

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      { userAgent: "*", allow: "/", disallow: DISALLOW },
      ...AI_BOTS.map((userAgent) => ({ userAgent, allow: "/", disallow: DISALLOW })),
    ],
    sitemap: "https://thecompounder.fyi/sitemap.xml",
    host: "https://thecompounder.fyi",
  };
}
