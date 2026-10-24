/** 数据审计 · 中文摘要与上次对比。 */
import type { AuditResult, Check, Status } from "./checks";

const LABEL: Record<Status, string> = { ok: "OK", warn: "需关注", watch: "观察", info: "信息" };
const ICON: Record<Status, string> = { ok: "✅", warn: "⚠️", watch: "👀", info: "ℹ️" };

type Delta = { check: Check; prev?: Check; change: string };

/** 观察项数量比上次多 → 升为需关注;硬约束、信息项保持原状态。 */
export function compare(cur: AuditResult, prev: AuditResult | null): { checks: Check[]; deltas: Delta[] } {
  const prevMap = new Map((prev?.checks ?? []).map((c) => [c.id, c]));
  const deltas: Delta[] = [];
  const checks = cur.checks.map((c) => {
    const p = prevMap.get(c.id);
    if (!prev) return c;
    if (!p) {
      deltas.push({ check: c, change: "新增检查项" });
      return c;
    }
    if (String(p.value) === String(c.value) && p.status === c.status) return c;
    let change = `${p.value} → ${c.value}`;
    if (typeof c.value === "number" && typeof p.value === "number") {
      const d = c.value - p.value;
      change += `(${d >= 0 ? "+" : ""}${d})`;
    }
    if (p.status !== c.status) change += `,状态 ${LABEL[p.status]} → ${LABEL[c.status]}`;
    const grew = c.status === "watch" && typeof c.value === "number" && typeof p.value === "number" ? c.value - p.value : 0;
    const out: Check = grew > 0 ? { ...c, status: "warn", detail: [c.detail, `观察项较上次增加 ${grew}`].filter(Boolean).join(";") } : c;
    deltas.push({ check: out, prev: p, change });
    return out;
  });
  return { checks, deltas };
}

const cell = (s: unknown) => String(s ?? "").replace(/\|/g, "\\|").replace(/\n/g, " ");
const ex = (c: Check) => (c.examples?.length && c.status !== "ok" ? `例:${cell(JSON.stringify(c.examples.slice(0, 4)))}` : "");

export function renderSummary(cur: AuditResult, prev: AuditResult | null): string {
  const { checks, deltas } = compare(cur, prev);
  const n = (s: Status) => checks.filter((c) => c.status === s).length;
  const L: string[] = [];
  L.push(`# 数据审计摘要 · ${cur.today}`);
  L.push("");
  L.push(`- 运行时间:${cur.runAt}`);
  L.push(`- 数据来源:Supabase 生产库 \`${cur.meta.supabaseHost}\`(只读快照,拉取于 ${cur.meta.fetchedAt})`);
  L.push(`- 总评:**需关注 ${n("warn")} 项** · 观察 ${n("watch")} 项 · OK ${n("ok")} 项 · 信息 ${n("info")} 项`);
  L.push(`- 对比基准:${prev ? `上次运行 ${prev.runAt}` : "无(首次运行)"}`);
  L.push("");
  L.push("## 数据日期与来源");
  L.push("");
  L.push("| 数据 | 来源 | 日期 |");
  L.push("|---|---|---|");
  for (const d of cur.dates) L.push(`| ${cell(d.label)} | ${cell(d.source)} | ${cell(d.value)} |`);
  L.push("");
  const warns = checks.filter((c) => c.status === "warn");
  L.push("## 需关注");
  L.push("");
  if (!warns.length) L.push("无。");
  for (const c of warns) L.push(`- **${c.id} ${c.title}**:${c.value}${c.detail ? `(${c.detail})` : ""} ${ex(c)}`);
  L.push("");
  if (prev) {
    L.push("## 与上次对比");
    L.push("");
    if (!deltas.length) L.push("所有检查项数值与上次一致。");
    for (const d of deltas) L.push(`- ${ICON[d.check.status]} ${d.check.id} ${d.check.title}:${d.change}`);
    L.push("");
  }
  for (const area of [...new Set(checks.map((c) => c.area))]) {
    L.push(`## ${area}`);
    L.push("");
    L.push("| 状态 | 编号 | 检查 | 结果 | 说明 |");
    L.push("|---|---|---|---|---|");
    for (const c of checks.filter((x) => x.area === area))
      L.push(`| ${ICON[c.status]} ${LABEL[c.status]} | ${c.id} | ${cell(c.title)} | ${cell(c.value)} | ${cell([c.detail, ex(c)].filter(Boolean).join(" "))} |`);
    L.push("");
  }
  L.push("> 状态说明:OK = 硬约束为 0;需关注 = 硬约束不为 0,或观察项比上次变多;观察 = 已知的长期项,只看趋势;信息 = 只是数字或日期。");
  return L.join("\n") + "\n";
}
