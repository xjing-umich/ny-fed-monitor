// 运行: npx tsx src/lib/learn.check.ts
import assert from "node:assert/strict";
import { getArticle, listArticles } from "./learn";

const en = getArticle("q2-2026-superinvestor-consensus", "en")!;
const zh = getArticle("q2-2026-superinvestor-consensus", "zh")!;
assert.ok(en.snapshotNote?.includes("94"), "en 快照说明写明实时页现为 94 位");
assert.ok(zh.snapshotNote?.includes("94 位"), "zh 快照说明写明实时页现为 94 位");
assert.ok(!en.intro.includes("due November 14"), "en 不再写 Q3 11/14 截止");
assert.ok(en.intro.includes("November 16"), "en 写顺延后的 11/16");
assert.ok(!zh.intro.includes("11 月 14 日"), "zh intro 不再写 11/14");
assert.ok(zh.intro.includes("11 月 16 日"), "zh intro 写顺延后的 11/16");
for (const [lang, a] of [["en", en], ["zh", zh]] as const) {
  assert.ok(a.sections.length > 0, `${lang} 文章有 sections`);
  for (const sec of a.sections) {
    for (const p of sec.paragraphs) {
      assert.ok(!p.includes("November 14"), `${lang} 正文不再写 November 14`);
      assert.ok(!p.includes("11 月 14"), `${lang} 正文不再写 11 月 14`);
    }
  }
}
// 安全边际出现的条件是“低于内在价值”,不是“低于价值带”(spec 2026-10-23 §三.2 I)
for (const lang of ["en", "zh"] as const) {
  for (const a of listArticles(lang)) {
    const text = [a.intro ?? "", ...a.sections.flatMap((sec) => sec.paragraphs)].join("\n");
    assert.ok(!/below that band|落到这条带以下/.test(text), `${lang}/${a.slug} 仍把安全边际说成低于价值带`);
  }
}
console.log("learn.check OK");

// Publication is immutable, later citation/copy revisions have their own dates.
for (const lang of ['en','zh'] as const) {
 for (const article of listArticles(lang)) {
  assert.match(article.published, /^\d{4}-\d{2}-\d{2}$/);
  assert.ok(article.published <= article.updated);
  assert.equal(new Set(article.sections.map((s) => s.id)).size, article.sections.length, 'unique stable section IDs');
  assert.ok(article.sections.every((s) => !!s.id));
  assert.ok(article.references?.length, `${lang}/${article.slug} needs traceable sources`);
  for (const reference of article.references ?? []) assert.match(reference.url, /^https:\/\//);
  const prose = [article.intro, ...article.sections.flatMap((s) => s.paragraphs)].join(' ');
  assert.ok(!/up to 45 days (?:stale|old)|最多(?:能比真实组合)?滞后 45 天|滞后实际组合最多 45 天/.test(prose));
 }
 const q2 = getArticle('q2-2026-superinvestor-consensus', lang)!;
 assert.equal(q2.published, '2026-10-19');
 assert.equal(q2.written, '2026-10-19');
 assert.ok(q2.updated >= '2026-10-23');
 assert.equal(getArticle('reading-business-quality', lang)!.published, '2026-06-11');
}
