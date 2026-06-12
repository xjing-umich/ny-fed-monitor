/**
 * AI-tell self-check for human-facing prose.
 *
 * Scans the editorial content that ships in the bundle (Learn articles, the
 * About page) for phrasing that makes writing read as
 * machine-generated, plus structural signals (sentence-length variety). The
 * goal: keep the site's prose sounding like a person wrote it, and catch
 * regressions before they ship.
 *
 *   npx tsx scripts/ai-tells.ts            # report + fail on hard hits
 *   npx tsx scripts/ai-tells.ts --report   # report only, never fail
 *
 * HARD hits (clichés a careful editor would never write) fail the run.
 * SOFT hits + burstiness are advisory — read them, don't ignore a pile of them.
 *
 * Out of scope: dynamically generated investor AI narratives. Those are governed
 * by their generation prompt, not by static content; keep that prompt honest.
 */

import { ARTICLE_SLUGS, getArticle } from "../src/lib/learn.js";
import { getAboutDoc } from "../src/lib/about.js";

type Lang = "en" | "zh";
type Block = { source: string; lang: Lang; text: string };

// ── Tell lists ────────────────────────────────────────────────────────────────
// HARD: unambiguous LLM/SEO-filler clichés. SOFT: legitimate in moderation but
// LLM-overused — flagged so a human can judge density.

const HARD_EN: RegExp[] = [
  /\bdelv(e|es|ing|ed)\b/i,
  /\bin conclusion\b/i,
  /\bin summary\b/i,
  /\bit'?s (important|worth|crucial) to note\b/i,
  /\bit is (important|worth|crucial) to note\b/i,
  /\bever-(evolving|changing)\b/i,
  /\bfast-paced\b/i,
  /\bin today'?s (world|landscape|market|environment)\b/i,
  /\bin the (world|realm) of\b/i,
  /\ba testament to\b/i,
  /\brich tapestry\b/i,
  /\b(unlock|unleash) (the|your|its)\b/i,
  /\bgame[- ]changer\b/i,
  /\b(deep dive|dive into|let'?s dive)\b/i,
  /\bthat being said\b/i,
  /\bneedless to say\b/i,
  /\bfirst and foremost\b/i,
  /\bplays? a (crucial|vital|key|pivotal|significant) role\b/i,
  /\b(myriad|plethora) of\b/i,
  /\bnavigat(e|ing) the\b/i,
  /\bwhen it comes to\b/i,
  /\bat the end of the day\b/i,
];

const SOFT_EN: RegExp[] = [
  /\b(leverage|leveraging)\b/i,
  /\b(robust|seamless|seamlessly)\b/i,
  /\b(harness|foster|elevate|embark|underscore|cornerstone|pivotal|crucial|vital)\b/i,
  /\blandscape\b/i,
  /\bnot only\b.*\bbut also\b/i,
  /\bisn'?t just\b/i,
  /\bmore than just\b/i,
  /\bwhether you'?re\b/i,
];

const HARD_ZH: RegExp[] = [
  /综上所述/,
  /总而言之/,
  /总的来说/,
  /值得(注意|一提)的是/,
  /需要注意的是/,
  /在当今|在如今|在这个.{0,8}的时代/,
  /随着.{0,12}的(发展|不断|推进|普及)/,
  /扮演着.{0,6}(角色|作用)/,
  /(起着|发挥着).{0,6}作用/,
  /至关重要/,
  /息息相关/,
  /密不可分/,
  /众所周知/,
  /(助力|赋能|深入探讨)/,
  /不仅仅是/,
];

const SOFT_ZH: RegExp[] = [
  /不仅.{0,20}而且/,
  /为.{0,12}提供了/,
  /打造/,
  /深入(了解|剖析)/,
];

// ── Collect prose ───────────────────────────────────────────────────────────

function collect(): Block[] {
  const blocks: Block[] = [];
  const langs: Lang[] = ["en", "zh"];

  for (const lang of langs) {
    for (const slug of ARTICLE_SLUGS) {
      const a = getArticle(slug, lang);
      if (!a) continue;
      const src = `learn/${slug}`;
      push(blocks, src, lang, a.title);
      push(blocks, src, lang, a.description);
      push(blocks, src, lang, a.intro);
      for (const s of a.sections) {
        push(blocks, src, lang, s.heading);
        for (const p of s.paragraphs) push(blocks, src, lang, p);
      }
    }

    const about = getAboutDoc(lang);
    push(blocks, "about", lang, about.title);
    push(blocks, "about", lang, about.intro);
    for (const s of about.sections) {
      push(blocks, "about", lang, s.heading);
      for (const p of s.paragraphs) push(blocks, "about", lang, p);
    }
  }

  return blocks;
}

function push(arr: Block[], source: string, lang: Lang, text: string) {
  if (text && text.trim()) arr.push({ source, lang, text: text.trim() });
}

// ── Scan ──────────────────────────────────────────────────────────────────────

type Hit = { source: string; lang: Lang; tier: "HARD" | "SOFT"; phrase: string; snippet: string };

function snippet(text: string, idx: number, len: number): string {
  const start = Math.max(0, idx - 30);
  const end = Math.min(text.length, idx + len + 30);
  return `${start > 0 ? "…" : ""}${text.slice(start, end)}${end < text.length ? "…" : ""}`;
}

function scan(blocks: Block[]): Hit[] {
  const hits: Hit[] = [];
  for (const b of blocks) {
    const hard = b.lang === "zh" ? HARD_ZH : HARD_EN;
    const soft = b.lang === "zh" ? SOFT_ZH : SOFT_EN;
    for (const [tier, list] of [["HARD", hard], ["SOFT", soft]] as const) {
      for (const re of list) {
        const m = b.text.match(re);
        if (m && m.index != null) {
          hits.push({ source: b.source, lang: b.lang, tier, phrase: m[0], snippet: snippet(b.text, m.index, m[0].length) });
        }
      }
    }
  }
  return hits;
}

// ── Burstiness (sentence-length variety) ───────────────────────────────────────
// Uniform sentence length is a strong machine-writing signal. We report the
// coefficient of variation (stddev/mean) of sentence word-counts per document;
// natural editorial prose usually sits above ~0.5.

function burstiness(blocks: Block[]): { doc: string; sentences: number; cv: number }[] {
  const byDoc = new Map<string, string>();
  for (const b of blocks) {
    const key = `${b.source} [${b.lang}]`;
    byDoc.set(key, `${byDoc.get(key) ?? ""} ${b.text}`);
  }
  const out: { doc: string; sentences: number; cv: number }[] = [];
  for (const [doc, text] of byDoc) {
    const isZh = doc.includes("[zh]");
    const parts = text.split(isZh ? /[。！？]/ : /[.!?]+/).map((s) => s.trim()).filter(Boolean);
    const lens = parts.map((s) => (isZh ? s.replace(/\s/g, "").length : s.split(/\s+/).length));
    if (lens.length < 4) continue;
    const mean = lens.reduce((a, b) => a + b, 0) / lens.length;
    const variance = lens.reduce((a, b) => a + (b - mean) ** 2, 0) / lens.length;
    const cv = mean > 0 ? Math.sqrt(variance) / mean : 0;
    out.push({ doc, sentences: lens.length, cv: Math.round(cv * 100) / 100 });
  }
  return out.sort((a, b) => a.cv - b.cv);
}

// ── Run ─────────────────────────────────────────────────────────────────────

function main() {
  const reportOnly = process.argv.includes("--report");
  const blocks = collect();
  const hits = scan(blocks);
  const hard = hits.filter((h) => h.tier === "HARD");
  const soft = hits.filter((h) => h.tier === "SOFT");

  console.log(`\nAI-tell self-check — scanned ${blocks.length} prose blocks\n${"─".repeat(56)}`);

  if (hard.length) {
    console.log(`\n❌ HARD hits (${hard.length}) — clichés to rewrite:`);
    for (const h of hard) console.log(`   [${h.source} ${h.lang}] "${h.phrase}"  →  ${h.snippet}`);
  } else {
    console.log(`\n✅ No HARD AI-tell phrases found.`);
  }

  if (soft.length) {
    console.log(`\n⚠️  SOFT hits (${soft.length}) — overused, judge density:`);
    for (const h of soft) console.log(`   [${h.source} ${h.lang}] "${h.phrase}"  →  ${h.snippet}`);
  }

  console.log(`\nℹ️  Sentence-length variety (coefficient of variation; <0.5 reads uniform):`);
  for (const r of burstiness(blocks)) {
    const flag = r.cv < 0.5 ? " ⚠️ low" : "";
    console.log(`   ${r.doc.padEnd(36)} cv=${r.cv.toFixed(2)} (${r.sentences} sentences)${flag}`);
  }

  console.log(`\n${"─".repeat(56)}`);
  if (hard.length && !reportOnly) {
    console.log(`FAIL — ${hard.length} hard AI-tell hit(s). Rewrite, then re-run.\n`);
    process.exit(1);
  }
  console.log(`PASS${reportOnly ? " (report-only)" : ""} — ${hard.length} hard, ${soft.length} soft.\n`);
}

main();
