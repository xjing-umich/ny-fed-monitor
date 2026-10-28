import { getManagerIndex } from "@/lib/managers/source";
import { mostHeld, notableMoves } from "@/lib/aggregations";
import {
  effectiveMovesPeriod,
  effectiveFilingDeadline,
  quarterLabel,
  freshness13F,
  globalLatestPeriod,
  FILING_DEADLINE_DAYS,
  type EffectiveMovesPeriod,
} from "@/lib/freshness/derive";
import { listArticles, type Article } from "@/lib/learn";
import { getAboutDoc } from "@/lib/about";
import { excludedClause } from "@/lib/freshness/excludedClause";
import { getLegalDoc, type LegalDoc } from "@/lib/legal";
import { absoluteUrl, localePath, stockPath, investorPath } from "@/lib/urls";
import { formatUSD, cleanIssuer } from "@/lib/format";
import { displayFundName } from "@/lib/managers/profileProse";
import { managerLabel } from "@/lib/managers/displayName";

// /llms.txt 与 /llms-full.txt 的正文(llmstxt.org 规范:H1 → 摘要 blockquote → 说明段 → H2 分节链接)。
// 数据相关的句子(最新季度、申报覆盖、榜单)从库里现算,与站内页面同一口径(effectiveMovesPeriod),
// 不在静态文件里写死季度。只出英文:裸路径即英文站,中文镜像在 /zh 下,文中点明。

const url = (path: string) => absoluteUrl(localePath("en", path));

function isoDay(d: Date): string {
  return d.toISOString().slice(0, 10);
}

// 周末截止顺延到周一,与站内切季同一天。
function deadlineOf(periodEnd: string): string {
  const d = effectiveFilingDeadline(periodEnd);
  return d ? isoDay(d) : periodEnd;
}

/** "Q2 2026 (quarter ended 2026-06-30)" */
function quarterPhrase(period: string): string {
  return `${quarterLabel(period)} (quarter ended ${period})`;
}

/** "1 of 94 managers expected to file (3 more … aren't counted) has" —— 分母 = 应申报 M,与首页进度行同一口径;
 *  M 小于名单时紧跟着写明少的是谁(同一从句)。 */
function filedOf(c: { filed: number; total: number; excluded: number }): string {
  return `${c.filed} of ${c.total} managers expected to file${excludedClause(c.excluded, "en")} ${c.filed === 1 ? "has" : "have"}`;
}

function baselineSentence(eff: EffectiveMovesPeriod): string {
  const { period, reason, maxPeriod, coverage } = eff;
  if (!period || !maxPeriod) return "No 13F data is loaded yet.";
  const head = `Site-wide figures (consensus, top buys and sells, the "as of" date on stock pages) are for ${quarterPhrase(period)}.`;
  const maxQ = quarterLabel(maxPeriod);
  if (reason === "before_deadline") {
    return `${head} ${filedOf(coverage)} already filed for ${maxQ}, but its filing deadline (${deadlineOf(maxPeriod)}) has not passed yet, so ${maxQ} is not the baseline. Early filers' new holdings show on their own investor pages, labelled with their quarter.`;
  }
  if (reason === "low_coverage") {
    return `${head} ${filedOf(coverage)} filed for ${maxQ}; it becomes the baseline once at least half have.`;
  }
  if (coverage.filed < coverage.total) {
    return `${head} ${filedOf(coverage)} filed for it; the rest are shown as of their latest earlier filing.`;
  }
  return `${head} All ${coverage.total} managers expected to file${excludedClause(coverage.excluded, "en")} have filed for it.`;
}

type Ctx = {
  managerCount: number;
  eff: EffectiveMovesPeriod;
  generated: string;
};

async function loadCtx(): Promise<Ctx> {
  const idx = await getManagerIndex();
  const now = new Date();
  return {
    managerCount: idx.managers.length,
    eff: effectiveMovesPeriod(idx.managers.map((m) => m.period), now),
    generated: isoDay(now),
  };
}

function header(ctx: Ctx, title: string): string[] {
  const q = ctx.eff.period ? quarterLabel(ctx.eff.period) : "the latest quarter";
  return [
    `# ${title}`,
    "",
    `> Compounder (thecompounder.fyi) tracks the SEC Form 13F holdings of ${ctx.managerCount} superinvestors, shows which stocks many of them own at once, and puts a conservative valuation band next to those stocks. Holdings data is currently for ${q}. It is an educational research tool: no stock recommendations, no price targets, no forecasts.`,
    "",
    `Latest data: ${baselineSentence(ctx.eff)} 13F filings are due ${FILING_DEADLINE_DAYS} days after quarter-end and show positions on the last day of the quarter, so every holding here describes a past date, not what a fund owns today. Source: SEC EDGAR. Generated ${ctx.generated}.`,
    "",
    "English pages live at the bare path (https://thecompounder.fyi/...). The same pages in Simplified Chinese live under /zh (https://thecompounder.fyi/zh/...).",
  ];
}

const DATA_SCOPE = [
  `Holdings come from each manager's latest Form 13F-HR on SEC EDGAR. Investor and stock pages count long equity positions; put and call options are left out of position counts and values.`,
  `Quarter-over-quarter moves (top buys, top sells, the "this quarter" counts on stock pages) only count filings for the baseline quarter. A new quarter becomes the baseline once its filing deadline (quarter-end + ${FILING_DEADLINE_DAYS} days, moved to the next Monday when it falls on a weekend) has passed and at least half of the managers expected to file (those that filed the prior quarter or later) have filed for it.`,
  "A manager who has not filed for the most recent quarter past its deadline is not counted as a current holder on consensus and stock pages; the consensus page lists them by name with the quarter their last 13F covers. Before the deadline, the prior quarter's filing still counts.",
  "Valuation bands are conservative ranges built from reported fundamentals. They show where a price sits against that range; they are not price targets or buy/sell calls.",
];

function articleLine(a: Article): string {
  const snapshot = a.snapshotPeriod ? ` (Snapshot of ${quarterLabel(a.snapshotPeriod)} data; see the live pages for current figures.)` : "";
  return `- [${a.title}](${url(`/learn/${a.slug}`)}): ${a.description}${snapshot}`;
}

/** /llms.txt:站点导航摘要。 */
export async function buildLlmsTxt(): Promise<string> {
  const ctx = await loadCtx();
  const q = ctx.eff.period ? quarterLabel(ctx.eff.period) : "the baseline quarter";
  const lines = [
    ...header(ctx, "Compounder"),
    "",
    "## Holdings data",
    "",
    `- [Consensus holdings](${url("/investors/consensus")}): Stocks held by the most tracked superinvestors at once, ranked by holder count, with the change since the prior quarter.`,
    `- [Top buys](${url("/investors/buys")}): Stocks the most superinvestors opened or added to in ${q}.`,
    `- [Top sells](${url("/investors/sells")}): Stocks the most superinvestors exited or trimmed in ${q}.`,
    `- [Superinvestors](${url("/investors")}): All ${ctx.managerCount} tracked managers. Each investor page lists the latest 13F portfolio with position sizes and quarter-over-quarter changes.`,
    `- [Stocks](${url("/stocks")}): Stocks owned by tracked superinvestors. Each stock page lists who holds it, position values, and the quarter each holding is from.`,
    `- [Stocks by value](${url("/stocks/screener")}): Where each stock's price sits against its conservative value band.`,
    "",
    "## Methodology and data scope",
    "",
    `- [About Compounder](${url("/about")}): What the site does and does not do, and where the data comes from.`,
    `- [How to read a 13F](${url("/learn/how-to-read-a-13f")}): What a 13F covers and what it leaves out (shorts, cash, bonds, foreign shares, anything after quarter-end).`,
    `- [Disclaimer](${url("/disclaimer")}): Data limits and the no-advice stance.`,
    "",
    ...DATA_SCOPE.map((s) => `- ${s}`),
    "",
    "## Learn",
    "",
    ...listArticles("en").map(articleLine),
    "",
    "## Optional",
    "",
    `- [Full text](${absoluteUrl("/llms-full.txt")}): Every Learn article in full, the data-scope notes, and the current consensus and moves rankings as plain text.`,
    `- [Sitemap](${absoluteUrl("/sitemap.xml")}): Every indexable page with hreflang pairs.`,
    "",
  ];
  return lines.join("\n");
}

// Learn 正文里的实体内链标记 [[investor:slug|Label]] / [[stock:TICKER|Label]](页面上渲染成 <Link>,
// 见 learn/[slug]/page.tsx)。纯文本里要转成 Markdown 链接,否则 AI 读到的是原始标记。
const ENTITY_TOKEN = /\[\[(investor|stock):([^|\]]+)\|([^\]]+)\]\]/g;
function entityLinksToMarkdown(text: string): string {
  return text.replace(ENTITY_TOKEN, (_, kind: string, id: string, label: string) =>
    `[${label}](${absoluteUrl(kind === "investor" ? investorPath("en", id) : stockPath("en", id))})`,
  );
}

function docText(doc: LegalDoc, level: "##" | "###"): string[] {
  const sub = level === "##" ? "###" : "####";
  return [
    `${level} ${doc.title}`,
    "",
    doc.intro,
    "",
    ...doc.sections.flatMap((s) => [`${sub} ${s.heading}`, "", ...s.paragraphs.flatMap((p) => [p, ""])]),
  ];
}

/** /llms-full.txt:全文版——当前榜单 + 口径 + About/Disclaimer + 全部 Learn 文章。 */
export async function buildLlmsFullTxt(): Promise<string> {
  const ctx = await loadCtx();
  const [held, moves, idx] = await Promise.all([mostHeld(25), notableMoves(15), getManagerIndex()]);
  const q = ctx.eff.period ? quarterLabel(ctx.eff.period) : "the baseline quarter";

  const managers = [...idx.managers].sort((a, b) =>
    managerLabel("en", a.slug, a.person).localeCompare(managerLabel("en", b.slug, b.person)),
  );
  // 一年没交新 13F 的标"已停报",免得被当成当前持仓引用(与投资人页的停报警示同一判定)。
  const globalLatest = globalLatestPeriod(idx.managers.map((m) => m.period));
  const filingNote = (period: string): string =>
    freshness13F(period, globalLatest) === "inactive"
      ? `last 13F for ${quarterLabel(period)}, no longer filing`
      : `latest 13F for ${quarterLabel(period)}`;
  const lines = [
    ...header(ctx, "Compounder (full text)"),
    "",
    `## Current data (${q})`,
    "",
    `### Consensus holdings: top ${held.length} by number of holders`,
    "",
    ...held.map(
      (r, i) =>
        `${i + 1}. ${cleanIssuer(r.issuer)} (${r.cusip}): ${r.holderCount} holders, ${formatUSD(r.totalValue)} combined. ${absoluteUrl(stockPath("en", r.cusip))}`,
    ),
    "",
    `### Top buys in ${q}: stocks the most superinvestors opened or added to`,
    "",
    ...moves.mostBought.map(
      (r, i) => `${i + 1}. ${cleanIssuer(r.issuer)} (${r.cusip}): ${r.count} managers. ${absoluteUrl(stockPath("en", r.cusip))}`,
    ),
    "",
    `### Top sells in ${q}: stocks the most superinvestors exited or trimmed`,
    "",
    ...moves.mostSold.map(
      (r, i) => `${i + 1}. ${cleanIssuer(r.issuer)} (${r.cusip}): ${r.count} managers. ${absoluteUrl(stockPath("en", r.cusip))}`,
    ),
    "",
    `### Tracked superinvestors (${managers.length})`,
    "",
    ...managers.map(
      (m) => `- ${managerLabel("en", m.slug, m.person)} (${displayFundName(m.name)}): ${filingNote(m.period)}. ${absoluteUrl(investorPath("en", m.slug))}`,
    ),
    "",
    "## Methodology and data scope",
    "",
    ...DATA_SCOPE.flatMap((s) => [s, ""]),
    ...docText(getAboutDoc("en"), "##"),
    ...docText(getLegalDoc("disclaimer", "en"), "##"),
    "## Learn articles",
    "",
    ...listArticles("en").flatMap((a) => [
      `### ${a.title}`,
      "",
      `${url(`/learn/${a.slug}`)} · Last updated ${a.updated}${a.snapshotPeriod ? ` · Snapshot of ${quarterLabel(a.snapshotPeriod)} data` : ""}`,
      "",
      entityLinksToMarkdown(a.intro),
      "",
      ...a.sections.flatMap((s) => [`#### ${s.heading}`, "", ...s.paragraphs.flatMap((p) => [entityLinksToMarkdown(p), ""])]),
    ]),
  ];
  return lines.join("\n");
}
