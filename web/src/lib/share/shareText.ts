import type { Lang } from "@/lib/nav";
import { cleanIssuer } from "@/lib/format";

// 分享文案输入：按页面类型区分（discriminated union）。槽位全部来自页面已查询的确定性数据。
export type ShareInput =
  | { kind: "investor"; managerName: string; topHolding: string | null; addedName: string | null }
  | { kind: "consensus"; topName: string | null; holderCount: number | null; managerCount: number }
  | { kind: "buys"; topName: string | null; count: number | null; quarterLabel?: string }
  | { kind: "sells"; topName: string | null; count: number | null; quarterLabel?: string };

const VIA = "via @thecompounder";

/**
 * 拼确定性、双语、零推荐措辞的分享文案。
 * 任一关键槽位缺失 → 退化为 `${fallbackTitle} ${VIA}`，绝不拼数据断言。
 * 发行人槽位一律在这里过 cleanIssuer，与页面展示同名（调用方传 EDGAR 原名也不会漏成 "APPLE INC"）。
 */
export function buildShareText(raw: ShareInput, lang: Lang, fallbackTitle: string): string {
  const input = cleanNames(raw);
  const fallback = `${fallbackTitle} ${VIA}`;
  switch (input.kind) {
    case "investor": {
      if (!input.topHolding) return fallback;
      const added = input.addedName
        ? lang === "zh"
          ? `，本季新增 ${input.addedName}`
          : `, added ${input.addedName} this quarter`
        : "";
      return lang === "zh"
        ? `${input.managerName} 最新 13F：第一大持仓 ${input.topHolding}${added}。${VIA}`
        : `${input.managerName}'s latest 13F — top holding ${input.topHolding}${added}. ${VIA}`;
    }
    case "consensus": {
      if (!input.topName || input.holderCount == null) return fallback;
      return lang === "zh"
        ? `本季 ${input.topName} 被 ${input.holderCount} 位顶级投资者同时持有，居共识首位。${VIA}`
        : `${input.topName} is held by ${input.holderCount} top investors this quarter — the #1 consensus pick. ${VIA}`;
    }
    case "buys": {
      if (!input.topName || input.count == null) return fallback;
      const q = input.quarterLabel;
      if (lang === "zh") {
        return q
          ? `${q} ${input.topName} 获最多顶级投资者买入（${input.count} 位）。${VIA}`
          : `${input.topName} 获最多顶级投资者买入（${input.count} 位）。${VIA}`;
      }
      return q
        ? `In ${q}, ${input.topName} drew the most buying from top investors (${input.count}). ${VIA}`
        : `${input.topName} drew the most buying from top investors (${input.count}). ${VIA}`;
    }
    case "sells": {
      if (!input.topName || input.count == null) return fallback;
      const q = input.quarterLabel;
      if (lang === "zh") {
        return q
          ? `${q} ${input.topName} 被最多超级投资者减持（${input.count} 位）。${VIA}`
          : `${input.topName} 被最多超级投资者减持（${input.count} 位）。${VIA}`;
      }
      return q
        ? `In ${q}, ${input.topName} saw the most selling from top investors (${input.count}). ${VIA}`
        : `${input.topName} saw the most selling from top investors (${input.count}). ${VIA}`;
    }
  }
}

function cleanNames(input: ShareInput): ShareInput {
  const clean = (s: string | null) => (s ? cleanIssuer(s) : s);
  return input.kind === "investor"
    ? { ...input, topHolding: clean(input.topHolding), addedName: clean(input.addedName) }
    : { ...input, topName: clean(input.topName) };
}

export type ShareLabels = { button: string; copy: string; copied: string; x: string; telegram: string };

// 分享按钮的双语 UI 文案（与业务数据无关，集中一处避免各页重复）。
export function shareLabels(lang: Lang): ShareLabels {
  return lang === "zh"
    ? { button: "分享", copy: "复制链接", copied: "已复制 ✓", x: "分享到 X", telegram: "分享到 Telegram" }
    : { button: "Share", copy: "Copy link", copied: "Copied ✓", x: "Share on X", telegram: "Share on Telegram" };
}
