// 纯确定性正文生成器(无 AI / 无 IO): 从已装配的 ManagerDetail 派生投资人页的服务端可见正文。
// 与 lib/ai/investorNarrative 的本质区别: 数字直接从 13F 精确算出(非模型生成), 因此正文里
// 可以、也应当带真实数字 —— 这正是让每页内容彼此独一无二、不被判"薄模板页"的关键(SEO_INDEXING_PLAN 任务 1)。
// 复用 page.tsx 已加载的 d(filings/latest/prior/changes), 零新增 IO。

import type { ManagerDetail, Holding } from "./types";
import type { Lang } from "@/lib/nav";
import { cleanIssuer, formatUSD, titleCase } from "@/lib/format";

// 基金名展示化: 仅当名称全大写(EDGAR 原始态, 如 "BERKSHIRE HATHAWAY INC")才标题化;
// 已是混合大小写的策展名(如 "Appaloosa LP"、"Fundsmith LLP")原样保留, 避免 LP→Lp 被误改。
export const displayFundName = (name: string): string =>
  name === name.toUpperCase() ? titleCase(name) : name;

// 段落以 segment 序列表示: 纯字符串, 或一个指向个股页的内链 token(cusip→ticker 由组件解析)。
// 让 lib 保持无 JSX、可测; 内链既服务正文阅读, 也稠化站内链接(任务 3)。
export type ProseSegment = string | { kind: "stock"; label: string; cusip: string };
export type ProseParagraph = ProseSegment[];

const stock = (label: string, cusip: string): ProseSegment => ({ kind: "stock", label, cusip });

const ORDINALS_EN = ["first", "second", "third", "fourth", "fifth", "sixth", "seventh", "eighth", "ninth", "tenth"];
const ordinalEn = (r: number): string => ORDINALS_EN[r - 1] ?? `${r}th`;

/**
 * 从 ManagerDetail 生成 3~5 段服务端正文。每段都从真实 13F 数字派生, 缺数据的段优雅跳过
 * (宁少写一段, 不写错)。holdings 为空 → 返回 []。
 */
export function buildInvestorProse(d: ManagerDetail, lang: Lang): ProseParagraph[] {
  const { manager, latest, prior, changes, filings } = d;
  const en = lang === "en";
  const paras: ProseParagraph[] = [];

  const holdings = latest.holdings.filter((h) => !h.putCall);
  const longChanges = changes.filter((c) => !c.putCall);
  const n = holdings.length;
  if (n === 0) return paras;

  const fund = displayFundName(manager.name);

  const total = holdings.reduce((s, h) => s + h.value, 0);
  const weightOf = (h: Holding): number => (total > 0 ? h.value / total : 0);

  // 按 CUSIP 归并(同 conviction.ts / holdingKey 口径): 同一 CUSIP 的正股与 put/call 行合并为一个
  // 仓位、value/weight 求和, 避免把单条期权行当成"最大持仓"列出。Map 不参与迭代以兼容 tsconfig。
  type Position = { cusip: string; issuer: string; value: number; weight: number };
  const merged: Position[] = [];
  const mergedIdx = new Map<string, number>();
  for (const h of holdings) {
    const w = weightOf(h);
    const i = mergedIdx.get(h.cusip);
    if (i != null) {
      merged[i].value += h.value;
      merged[i].weight += w;
      merged[i].issuer = h.issuer; // 同券各行同名, 以较后行为准
    } else {
      mergedIdx.set(h.cusip, merged.length);
      merged.push({ cusip: h.cusip, issuer: h.issuer, value: h.value, weight: w });
    }
  }
  const byValue = merged.sort((a, b) => b.value - a.value);
  const pct0 = (w: number): string => `${Math.round(w * 100)}%`;
  const pct1 = (w: number): string => `${(w * 100).toFixed(1)}%`;
  const name = (p: Position): string => cleanIssuer(p.issuer);

  // ── 段 1: 这位投资人是谁 + 由数据派生的风格(集中度) ────────────────────────────
  const topK = Math.min(5, byValue.length);
  const topKShare = byValue.slice(0, topK).reduce((s, p) => s + p.weight, 0);
  const conc = en
    ? topKShare >= 0.6
      ? "a concentrated portfolio"
      : topKShare >= 0.35
        ? "a moderately concentrated portfolio"
        : "a broadly diversified portfolio"
    : topKShare >= 0.6
      ? "属高度集中的组合"
      : topKShare >= 0.35
        ? "属中等集中度的组合"
        : "属较为分散的组合";

  paras.push(
    en
      ? [
          `${fund}'s most recent 13F filing, for the quarter ended ${latest.period}, reports ${n} positions worth ${formatUSD(total)}. The top ${topK} holdings represent ${pct0(topKShare)} of that value, ${conc}.`,
        ]
      : [
          `${fund} 最新一期 13F 申报(截至 ${latest.period})报告 ${n} 个持仓，合计市值 ${formatUSD(total)}。前 ${topK} 大持仓占其中 ${pct0(topKShare)}，${conc}。`,
        ],
  );

  // ── 段 2: 本季持仓全景 — 前 3 大仓位 + 权重, 名称内链到个股页 ────────────────────
  const top = byValue.slice(0, 3);
  if (top.length > 0) {
    const p: ProseParagraph = [];
    if (en) {
      p.push("The single largest position is ", stock(name(top[0]), top[0].cusip), ` at ${pct1(top[0].weight)} of the portfolio`);
      if (top[1]) p.push(", followed by ", stock(name(top[1]), top[1].cusip), ` at ${pct1(top[1].weight)}`);
      if (top[2]) p.push(" and ", stock(name(top[2]), top[2].cusip), ` at ${pct1(top[2].weight)}`);
      p.push(".");
    } else {
      p.push("第一大持仓为 ", stock(name(top[0]), top[0].cusip), `，占组合 ${pct1(top[0].weight)}`);
      if (top[1]) p.push("，其次是 ", stock(name(top[1]), top[1].cusip), `(${pct1(top[1].weight)})`);
      if (top[2]) p.push(" 和 ", stock(name(top[2]), top[2].cusip), `(${pct1(top[2].weight)})`);
      p.push("。");
    }
    paras.push(p);
  }

  // ── 段 3: 本季动作 — 只在有 prior(可比)时渲染 ─────────────────────────────────
  if (prior) {
    const news = longChanges.filter((c) => c.kind === "new").sort((a, b) => b.value - a.value);
    const exits = longChanges.filter((c) => c.kind === "exited").sort((a, b) => b.prevShares - a.prevShares);
    const incs = longChanges.filter((c) => c.kind === "increased");
    const decs = longChanges.filter((c) => c.kind === "decreased");

    const p: ProseParagraph = [];
    if (en) {
      p.push(
        `Against the prior quarter, ${manager.person} opened ${news.length} new ${news.length === 1 ? "position" : "positions"}, exited ${exits.length}, added to ${incs.length}, and trimmed ${decs.length}.`,
      );
      if (news[0]) p.push(" The largest new buy was ", stock(cleanIssuer(news[0].issuer), news[0].cusip), ".");
      if (exits[0]) p.push(" The most notable sale was the full exit from ", stock(cleanIssuer(exits[0].issuer), exits[0].cusip), ".");
    } else {
      p.push(
        `较上一季度，${manager.person} 新建 ${news.length} 个持仓，清仓 ${exits.length} 个，加仓 ${incs.length} 个，减仓 ${decs.length} 个。`,
      );
      if (news[0]) p.push("其中最大的新建仓位是 ", stock(cleanIssuer(news[0].issuer), news[0].cusip), "。");
      if (exits[0]) p.push("最受关注的卖出是清仓 ", stock(cleanIssuer(exits[0].issuer), exits[0].cusip), "。");
    }
    paras.push(p);
  }

  // ── 段 4: 长期核心仓 — 在全部申报季中每期都持有的标的 ───────────────────────────
  const F = filings.length;
  if (F >= 3) {
    // 每期持有(shares>0)的 cusip 集合, 取交集
    // 每个 cusip 出现的季数; 等于 F 的即"每期都持有"
    const seenCount = new Map<string, number>();
    for (const f of filings) {
      const heldThisQuarter = new Set<string>();
      for (const h of f.holdings) if (!h.putCall && h.shares > 0) heldThisQuarter.add(h.cusip);
      for (const c of heldThisQuarter) seenCount.set(c, (seenCount.get(c) ?? 0) + 1);
    }
    // 按最新季市值排序, 取前两个持续持有的标的
    const core = byValue.filter((h) => seenCount.get(h.cusip) === F).slice(0, 2);
    if (core.length > 0) {
      const rank1 = byValue.findIndex((h) => h.cusip === core[0].cusip) + 1;
      const p: ProseParagraph = [];
      if (en) {
        p.push(`Across all ${F} quarters on file, `, stock(name(core[0]), core[0].cusip), " has appeared in every filing");
        if (core[1]) p.push(", as has ", stock(name(core[1]), core[1].cusip));
        p.push(`. ${name(core[0])} currently ranks ${ordinalEn(rank1)} by value.`);
      } else {
        p.push(`在全部 ${F} 个季度的申报中，`, stock(name(core[0]), core[0].cusip), " 每期都在持仓之列");
        if (core[1]) p.push("，", stock(name(core[1]), core[1].cusip), " 亦然");
        p.push(`。按市值计，${name(core[0])} 目前排在第 ${rank1} 位。`);
      }
      paras.push(p);
    }
  }

  // ── 段 5: 数据出处与时点 + 口径限制(建信任、去 doorway) ──────────────────────────
  paras.push(
    en
      ? [
          `A 13F is filed roughly 45 days after quarter-end and covers only long positions in US-listed equities, so it is a lagging and partial view of the portfolio. Source: SEC EDGAR.`,
        ]
      : [
          `13F 通常在季度结束后约 45 天提交，且仅涵盖美股多头持仓，因此是滞后且不完整的组合视图。来源：SEC EDGAR。`,
        ],
  );

  return paras;
}
