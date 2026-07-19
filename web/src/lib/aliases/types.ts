// web/src/lib/aliases/types.ts
// 统一实体别名解析层的类型(spec §3.1)。

// URL 的 section 天然隔离命名空间:/investors/* 只查 investor,/stocks/* 只查 stock,
// 互不冲突(如 "brk" 在两侧各自命中)。
export type EntityType = "investor" | "stock";

// confidence: "high" 才触发 301/308 重定向;"loose" 只进结构化数据(v1 无 loose 来源,
// 这是接 Wikidata 时的安全闸,见 spec §3.3)。
export type AliasTarget = { canonicalSlug: string; confidence: "high" | "loose" };

// 构建期的中间三元组:alias=可命中的别名原文(未归一化);display=结构化数据展示用的
// 别名(空串表示该条不进 alternateName,如 slug 自指);canonical=目标 canonical slug。
export type AliasEntry = { alias: string; display: string; canonical: string };

// 构建产物:resolve 用于重定向(归一化别名 → canonical,已去歧义);
// display 用于结构化数据(canonical → 该实体所有展示别名)。
export type BuiltIndex = {
  resolve: Map<string, string>;
  display: Map<string, string[]>;
};
