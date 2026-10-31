import { notFound } from "next/navigation";
import { notFoundMetadata } from "@/lib/notFoundMetadata";

export async function generateMetadata({ params }: { params: Promise<{ lang: string }> }) {
  return notFoundMetadata((await params).lang === "zh" ? "zh" : "en");
}

// 兜底:/zh/* 与裸路径(rewrite 到 /en/*)里没有匹配路由的地址(如手敲的 /zh/stock/AAPL)
// 原本掉到框架默认的英文 404,没有站点外壳、没有 lang。这里接住后抛 notFound(),
// 走 [lang]/not-found.tsx 的本地化 404(Next 自动加 noindex)。更具体的路由(stocks/[ticker] 等)
// 永远优先于 catch-all。
export default function CatchAll(): never {
  notFound();
}
