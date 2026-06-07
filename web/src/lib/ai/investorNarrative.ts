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

export type Magnitude = "small" | "moderate" | "large";

// 注意: 刻意不向模型暴露任何原始数字(delta_pct/value/weight)。
// 模型只拿到「方向(kind) + 粗粒度幅度(magnitude) + 排名(rank)」这类定性信号,
// 精确数字由页面表格(确定性、来自 13F)渲染。这样从结构上杜绝模型在 prose 里写错/编数字。
export type MovesPayload = {
  person: string;
  name: string;
  period: string;
  top_holdings: { issuer: string; rank: number }[];
  moves: { issuer: string; kind: "new" | "exited" | "increased" | "decreased"; magnitude?: Magnitude }[];
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

function magnitudeOf(kind: string, deltaPct?: number | null): Magnitude | undefined {
  if (kind !== "increased" && kind !== "decreased") return undefined;
  if (deltaPct == null) return undefined;
  const a = Math.abs(deltaPct);
  if (a < 0.1) return "small";
  if (a < 0.5) return "moderate";
  return "large";
}

export function buildMovesPayload(d: ManagerDetailLike, limit = 12): MovesPayload {
  const moves = [...d.changes]
    .sort((a, b) => b.value - a.value)
    .slice(0, limit)
    .map((c) => ({ issuer: c.issuer, kind: c.kind, magnitude: magnitudeOf(c.kind, c.deltaPct) }));
  const top_holdings = [...d.latest.holdings]
    .sort((a, b) => b.value - a.value)
    .slice(0, 10)
    .map((h, i) => ({ issuer: h.issuer, rank: i + 1 }));
  return {
    person: d.manager.person,
    name: d.manager.name,
    period: d.latest.period,
    top_holdings,
    moves,
  };
}

export function systemPrompt(lang: Lang): string {
  const common = [
    "You explain a superinvestor's quarterly 13F portfolio changes in plain language.",
    "Use ONLY the provided JSON. Never invent tickers, holdings, sizes, or facts.",
    "Describe ACTIONS and FACTUAL PATTERNS ONLY (added / trimmed / new / exited; which sectors the additions vs trims cluster in; rank changes among top holdings).",
    "NEVER state a percentage, dollar amount, share count, or portfolio-weight figure, and never write a specific date. Exact figures live in a separate table. Refer to the period only as 'this quarter'. (Numerals inside a company's own name are fine.)",
    "Do NOT guess the manager's motive, conviction, outlook, or sentiment. Do NOT say a stock is cheap/expensive or imply bullish/bearish.",
    "STRICTLY FORBIDDEN words/ideas: buy/sell/hold ratings, price targets, valuation judgments (cheap/expensive/undervalued/overvalued), conviction, bullish/bearish, technical or sentiment signals.",
    "The 'why' field must state only what the data itself shows (e.g. 'now the top holding', 'part of a broad trim across financials', 'a new position'), not a guessed reason.",
    "This is a lagged, post-hoc read of a public SEC 13F filing — it may be incomplete and is not investment advice.",
    "Tone: a restrained financial wire editor. No emoji, no filler.",
    "Output STRICT JSON only, no Markdown.",
  ];
  const langLine =
    lang === "zh"
      ? "Write all output text in Simplified Chinese, cautious wording (本季/或反映/属事实性描述). Use '本季' for the period; never a date."
      : "Write all output text in English, cautious wording (this quarter / part of / appears to). Use 'this quarter' for the period; never a date.";
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
        judgment_line: "one factual sentence on this quarter's moves (what was added/trimmed/new/exited and any sector pattern); NO numbers, NO valuation, NO buy/sell view",
        moves: [
          {
            issuer: "copy verbatim from the input",
            action: "new | added | trimmed | exited",
            why: "one clause stating only what the data shows (e.g. 'now the top holding', 'part of a broad trim'); NO numbers, NO motive-guessing, NO sentiment",
          },
        ],
        confidence: "low | medium | high",
        limitations: ["..."],
      }),
      "The ONLY data you may use (no numbers appear here on purpose — do not invent any):",
      data,
      "Write ALL output text in English. State no percentages, dollar amounts, share counts, or weight figures; call the period 'this quarter'.",
    ].join("\n\n");
  }
  return [
    "请基于以下 JSON 生成严格 JSON（不要 Markdown）。输出格式：",
    JSON.stringify({
      judgment_line: "一句事实性总结本季调仓（加/减/新建/清仓了什么、有无板块倾向）；不含任何数字、不含估值、不含买卖看法",
      moves: [
        {
          issuer: "原样照抄输入中的名称",
          action: "建仓|加仓|减仓|清仓",
          why: "只陈述数据本身显示的事实（如『现为第一大重仓』『属一轮普遍减持』）；不含数字、不臆测动机、不带情绪",
        },
      ],
      confidence: "low | medium | high",
      limitations: ["..."],
    }),
    "唯一允许使用的数据（这里刻意不含数字——不要编造任何数字）：",
    data,
    "全部输出文本用简体中文。不要出现任何百分比、金额、持股数或权重数字；时期一律称『本季』。",
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

// ── Validation gate ─────────────────────────────────────────────────────────
// 生成入库前的确定性校验: 防幻觉(编造持仓)、防方向写反、防数字失真、防破护栏。
// 返回错误列表(空=通过)。由服务端在缓存前调用, 不过则重试/丢弃。

const norm = (s: string): string => s.trim().toUpperCase().replace(/\s+/g, " ");

const FORBIDDEN_LEXICON =
  /买入|卖出|目标价|估值|低估|高估|便宜|昂贵|看好|看空|利好|利空|\bbuy\b|\bsell\b|price target|undervalued|overvalued|\bcheap\b|\bexpensive\b|valuation|bullish|bearish|conviction/i;

// 量化失真源: 百分比 / 金额 / 权重百分点 / 持股数量级。不拦所有数字(放过 Q1/13F/S&P 500/3M)。
const NUMERIC_PROSE =
  /\d\s*%|百分|个百分点|percentage point|\bpercent\b|[$＄]\s*\d|\d[\d,.]*\s*(?:million|billion|trillion|\bbn\b|\bmn\b|万|亿|股|shares?)/i;

function actionDir(action: string): "up" | "down" | "new" | "exit" | null {
  const a = action.toLowerCase();
  if (/加仓|增持|add|increas|boost|rais/.test(a)) return "up";
  if (/减仓|减持|trim|reduc|cut|lower|pare/.test(a)) return "down";
  if (/建仓|新建|新增|initiat|\bnew\b|open|establish/.test(a)) return "new";
  if (/清仓|退出|sold|sell out|exit|elimin|clos/.test(a)) return "exit";
  return null;
}
const kindDir: Record<string, "up" | "down" | "new" | "exit"> = {
  increased: "up",
  decreased: "down",
  new: "new",
  exited: "exit",
};

/** 校验叙述是否忠于 payload 且不破护栏。返回错误列表(空=通过)。 */
export function validateNarrative(data: InvestorNarrativeData, payload: MovesPayload): string[] {
  const errors: string[] = [];
  const validIssuers = new Set<string>([
    ...payload.moves.map((m) => norm(m.issuer)),
    ...payload.top_holdings.map((h) => norm(h.issuer)),
  ]);
  const kindsByIssuer = new Map<string, Set<string>>();
  for (const m of payload.moves) {
    const k = norm(m.issuer);
    if (!kindsByIssuer.has(k)) kindsByIssuer.set(k, new Set());
    kindsByIssuer.get(k)!.add(m.kind);
  }

  // 1. 护栏词典(查所有文本)
  const proseText = [data.judgment_line, ...data.moves.map((m) => m.why), ...data.limitations].join(" ");
  if (FORBIDDEN_LEXICON.test(proseText) || data.moves.some((m) => FORBIDDEN_LEXICON.test(m.action))) {
    errors.push("forbidden lexicon (valuation/sentiment)");
  }
  // 2. prose 里禁止"量化失真源": 百分比/金额/权重点/持股数。
  //    不禁所有数字(否则 Q1/13F/S&P 500/3M 等正常 token 会误杀)。
  if (NUMERIC_PROSE.test(proseText)) errors.push("numeric figure (%/$/weight/shares) in prose");

  // 3. 幻觉 issuer + 方向一致性
  for (const m of data.moves) {
    const k = norm(m.issuer);
    if (!validIssuers.has(k)) {
      errors.push(`hallucinated issuer: ${m.issuer}`);
      continue;
    }
    const kinds = kindsByIssuer.get(k);
    if (kinds && kinds.size > 0) {
      const dir = actionDir(m.action);
      const allowed = [...kinds].map((kk) => kindDir[kk]);
      if (dir && !allowed.includes(dir)) {
        errors.push(`direction mismatch for ${m.issuer}: action="${m.action}" vs kind=${[...kinds].join("/")}`);
      }
    }
  }
  return errors;
}

// ── Freshness ───────────────────────────────────────────────────────────────
// 13F 季后约 45 天截止申报。给定"现在", 推算应有的最新季度末(YYYY-MM-DD), 据此判断某 period 是否陈旧。

/** 给定当前日期, 返回当下"应已可得"的最新 13F 季度末 (考虑 45 天申报延迟)。 */
export function expectedLatestPeriod(now: Date): string {
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth(); // 0-11
  // 各季度末 + 大致可得月份(季末后~45天): Q4→Feb14, Q1→May15, Q2→Aug14, Q3→Nov14
  const quarters = [
    { end: `${y - 1}-12-31`, availMonth: 1 }, // 上年 Q4, 次年2月可得
    { end: `${y}-03-31`, availMonth: 4 }, // Q1, 5月可得
    { end: `${y}-06-30`, availMonth: 7 }, // Q2, 8月可得
    { end: `${y}-09-30`, availMonth: 10 }, // Q3, 11月可得
    { end: `${y}-12-31`, availMonth: 13 }, // 本年Q4(占位, 不会命中)
  ];
  let latest = `${y - 1}-09-30`;
  for (const q of quarters) if (m >= q.availMonth) latest = q.end;
  return latest;
}

/** period 是否早于"应有最新季度" → 陈旧。 */
export function isPeriodStale(period: string, now: Date): boolean {
  return period < expectedLatestPeriod(now);
}
