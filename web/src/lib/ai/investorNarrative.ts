// 纯逻辑(无 server-only / 无 ai / 无 db): 投资者叙述的 payload 构造、响应解析、prompt。
// 可被路由(服务端)与测试共同导入。

export type Lang = "zh" | "en";

export type ManagerDetailLike = {
  manager: { person: string; name: string; slug: string };
  latest: {
    period: string;
    totalValue: number;
    filedAt: string;
    holdings: { issuer: string; value: number; weight?: number | null }[];
  };
  changes: {
    issuer: string;
    value: number;
    deltaPct?: number | null;
    kind: "new" | "exited" | "increased" | "decreased";
  }[];
};

export type MovesPayload = {
  person: string;
  name: string;
  period: string;
  portfolio_value: number;
  top_holdings: { issuer: string; weight: number | null }[];
  moves: { issuer: string; kind: string; delta_pct: number | null; value: number }[];
};

export type InvestorNarrativeData = {
  judgment_line: string;
  moves: { issuer: string; action: string; why: string }[];
  confidence: "low" | "medium" | "high";
  limitations: string[];
};

export function narrativeKey(slug: string, period: string, lang: Lang): string {
  return `investor:${slug}:${period}:${lang}`;
}

export function buildMovesPayload(d: ManagerDetailLike, limit = 12): MovesPayload {
  const moves = [...d.changes]
    .sort((a, b) => b.value - a.value)
    .slice(0, limit)
    .map((c) => ({ issuer: c.issuer, kind: c.kind, delta_pct: c.deltaPct ?? null, value: c.value }));
  const top_holdings = [...d.latest.holdings]
    .sort((a, b) => b.value - a.value)
    .slice(0, 10)
    .map((h) => ({ issuer: h.issuer, weight: h.weight ?? null }));
  return {
    person: d.manager.person,
    name: d.manager.name,
    period: d.latest.period,
    portfolio_value: d.latest.totalValue,
    top_holdings,
    moves,
  };
}

export function systemPrompt(lang: Lang): string {
  const common = [
    "You explain a superinvestor's quarterly 13F portfolio changes in plain language.",
    "Use ONLY the provided JSON numbers. Never invent tickers, sizes, or facts.",
    "Describe ACTIONS ONLY (added / trimmed / new / exited / concentration shifts).",
    "STRICTLY FORBIDDEN: buy/sell/hold ratings, price targets, valuation judgments (cheap/expensive), technical or sentiment signals.",
    "This is a lagged, post-hoc read of a public SEC 13F filing — acknowledge it may be incomplete and is not investment advice.",
    "Tone: a restrained financial wire editor. No emoji, no filler like 'let me analyze'.",
    "Output STRICT JSON only, no Markdown.",
  ];
  const langLine =
    lang === "zh"
      ? "Write all output text in Simplified Chinese, cautious wording (可能/或反映/需结合其他信息)."
      : "Write all output text in English, cautious wording (may / could reflect / subject to other information).";
  return [...common, langLine].join("\n");
}

export function userPrompt(payload: MovesPayload, lang: Lang): string {
  const data = JSON.stringify(payload);
  // 注意: user message 的语言会强烈影响输出语言(尤其推理模型), 所以指令本身必须按 lang 切换,
  // 不能只靠 systemPrompt 的一行说明, 否则英文页会被生成成中文。
  if (lang === "en") {
    return [
      "Generate STRICT JSON (no Markdown) from the JSON below. Output format:",
      JSON.stringify({
        judgment_line: "one-sentence summary of this quarter's position changes; no valuation, no buy/sell advice",
        moves: [
          {
            issuer: "...",
            action: "new | added | trimmed | exited",
            why: "one clause on the likely rationale / what the portfolio shift suggests; only state what the facts support",
          },
        ],
        confidence: "low | medium | high",
        limitations: ["..."],
      }),
      "The ONLY data you may use:",
      data,
      "Write ALL output text in English.",
    ].join("\n\n");
  }
  return [
    "请基于以下 JSON 生成严格 JSON（不要 Markdown）。输出格式：",
    JSON.stringify({
      judgment_line: "一句话总结本季调仓动作；不含估值、不含买卖建议",
      moves: [{ issuer: "...", action: "建仓|加仓|减仓|清仓", why: "一句为什么/组合在讲什么故事；仅在有事实支撑处说话" }],
      confidence: "low | medium | high",
      limitations: ["..."],
    }),
    "唯一允许使用的数据：",
    data,
    "全部输出文本用简体中文。",
  ].join("\n\n");
}

export function parseInvestorNarrative(text: string): InvestorNarrativeData {
  const trimmed = text
    .trim()
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/```$/i, "")
    .trim();
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  const jsonText = start >= 0 && end >= start ? trimmed.slice(start, end + 1) : trimmed;
  const parsed = JSON.parse(jsonText) as Partial<InvestorNarrativeData>;

  if (typeof parsed.judgment_line !== "string" || !parsed.judgment_line.trim()) {
    throw new Error("investor narrative missing judgment_line");
  }
  const moves = Array.isArray(parsed.moves)
    ? parsed.moves
        .filter(
          (m): m is { issuer: string; action: string; why: string } =>
            Boolean(m) && typeof m.issuer === "string" && typeof m.action === "string" && typeof m.why === "string"
        )
        .slice(0, 12)
    : [];
  const confidence = ["low", "medium", "high"].includes(String(parsed.confidence))
    ? (parsed.confidence as "low" | "medium" | "high")
    : "low";
  const limitations = Array.isArray(parsed.limitations)
    ? parsed.limitations.filter((x): x is string => typeof x === "string")
    : [];
  return { judgment_line: parsed.judgment_line.trim(), moves, confidence, limitations };
}
