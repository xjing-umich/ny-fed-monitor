import { ogFor, fitSnippet, snippetWidth, SNIPPET_MAX } from "./seo";

function assert(c: boolean, m: string) {
  if (!c) { console.error("FAIL:", m); process.exit(1); }
}

// en 页自带 opengraph-image 时给裸地址(文件路由会生成 /en/… 而被 301);zh 交给文件路由;品牌卡不变。
const ogImg = (o: ReturnType<typeof ogFor>) => (o.openGraph?.images as { url: string }[] | undefined)?.[0]?.url;
assert(ogImg(ogFor({ lang: "en", title: "t", description: "d", path: "/stocks/AAPL", brandImage: false })) === "https://thecompounder.fyi/stocks/AAPL/opengraph-image", "en 自带卡 → 裸地址");
assert(ogImg(ogFor({ lang: "zh", title: "t", description: "d", path: "/zh/stocks/AAPL", brandImage: false })) === undefined, "zh 自带卡 → 交给文件路由");
assert(ogImg(ogFor({ lang: "en", title: "t", description: "d", path: "/investors" })) === "https://thecompounder.fyi/opengraph-image", "en 品牌卡");
assert(ogImg(ogFor({ lang: "zh", title: "t", description: "d", path: "/zh/investors" })) === "https://thecompounder.fyi/zh/opengraph-image", "zh 品牌卡");

// 摘要宽度:汉字按 2 计。
assert(snippetWidth("Apple") === 5 && snippetWidth("苹果，") === 6, "snippetWidth");
const long = "x".repeat(SNIPPET_MAX + 1);
assert(fitSnippet(long, "short", "s") === "short", "取第一个放得下的");
assert(fitSnippet(long, long + "y") === long + "y", "都放不下取最后一个");

console.log("seo.check OK");
