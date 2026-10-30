import type { Lang } from './nav';

export type ArticleReference = { label: string; url: string };
// Sources checked 2026-10-30. Historical financial examples remain fiscal-2025 snapshots.
const SEC_FAQ = 'https://www.sec.gov/rules-regulations/staff-guidance/frequently-asked-questions-about-form-13f';
const SUPER = 'https://business.columbia.edu/insights/chazen-global-insights/superinvestors-graham-and-doddsville';
const MANUAL = 'https://www.berkshirehathaway.com/owners.html';
const ref = (label: string, url: string): ArticleReference => ({ label, url });

export function articleReferences(slug: string, lang: Lang): ArticleReference[] {
  const zh = lang === 'zh';
  const rules = ref(zh ? 'SEC：Form 13F 规则、覆盖范围与申报期限（2026-03-06）' : 'SEC Form 13F FAQ: scope and filing deadlines (2026-03-06)', SEC_FAQ);
  if (slug === 'how-to-read-a-13f' || slug === 'reading-cross-fund-consensus' || slug.startsWith('q1-') || slug.startsWith('q2-')) return [rules];
  if (slug === 'what-is-a-superinvestor') return [ref(zh ? '巴菲特：《格雷厄姆-多德都市里的超级投资者》（1984-05-17，哥伦比亚商学院）' : 'Warren Buffett: The Superinvestors of Graham-and-Doddsville (1984-05-17, Columbia)', SUPER), ref(zh ? '伯克希尔：股东手册（1999）' : "Berkshire Hathaway: Owner’s Manual (1999)", MANUAL)];
  if (slug === 'what-is-intrinsic-value') return [
    ref(zh ? '伯克希尔：股东手册，内在价值与估计的局限（1999）' : "Berkshire Hathaway: Owner’s Manual, intrinsic value and estimation limits (1999)", MANUAL),
    ref(zh ? '巴菲特：1992 年致股东信，现金流折现' : 'Warren Buffett: 1992 shareholder letter, discounted cash flows', 'https://www.berkshirehathaway.com/letters/1992.html'),
    ref(zh ? '巴菲特与 Carol Loomis：Mr. Buffett on the Stock Market（1999-11-22）' : 'Warren Buffett and Carol Loomis: Mr. Buffett on the Stock Market (1999-11-22)', 'https://fortune.com/article/warren-buffett-on-stock-market/'),
    ref(zh ? '李录：2015 年北大演讲，Graham Rhodes 英译本（2017；转载）' : 'Li Lu: 2015 Peking University speech, Graham Rhodes translation (2017; hosted copy)', 'https://offpisteinvesting.com/wp-content/uploads/2017/03/17-02-13-Li-Lu-Speech-at-Guanghua-School-of-Management-Translation.pdf'),
    ref(zh ? '段永平：雪球公开讨论（2022-03-23；含读者整理的问答）' : 'Duan Yongping: public Xueqiu discussion (2022-03-23; includes reader-collected Q&A)', 'https://xueqiu.com/7095553395/215016159/232369771'),
  ];
  if (slug === 'reading-business-quality') return [
    ref(zh ? '巴菲特：2007 年致股东信，生意质量与资本回报' : 'Warren Buffett: 2007 shareholder letter, business quality and capital returns', 'https://www.berkshirehathaway.com/letters/2007ltr.pdf'),
    ...[
      ['Visa','2025-09-30','1403161','000140316125000089'],
      ['Mastercard','2025-12-31','1141391','000114139126000013'],
      ['Alphabet','2025-12-31','1652044','000165204426000018'],
      ["Moody’s",'2025-12-31','1059556','000162828026009136'],
      ['Meta','2025-12-31','1326801','000162828026003942'],
      ['Apple','2025-09-27','320193','000032019325000079'],
      ['Amazon','2025-12-31','1018724','000101872426000004'],
      ['Alphabet','2026-06-30','1652044','000165204426000071'],
    ].map(([name, period, cik, accession]) => ref(`${name} · ${period} · ${period === '2026-06-30' ? '10-Q' : '10-K'}`, `https://www.sec.gov/Archives/edgar/data/${cik}/${accession}/`)),
  ];
  return [];
}

// Explicit IDs survive future edits/translations of section headings.
export const ARTICLE_SECTION_IDS: Record<string, readonly string[]> = {
  "how-to-read-a-13f": [
    "what-a-13f-is",
    "what-you-can-learn-from-it",
    "what-a-13f-leaves-out",
    "how-to-actually-use-it"
  ],
  "what-is-a-superinvestor": [
    "where-the-word-comes-from",
    "from-graham-to-buffett",
    "what-they-have-in-common",
    "why-compounding-matters-so-much"
  ],
  "what-is-intrinsic-value": [
    "price-is-not-value",
    "what-intrinsic-value-actually-is",
    "the-discount-rate-is-your-opportunity-cost",
    "you-can-only-value-what-you-understand",
    "a-range-not-a-number",
    "the-golden-rule-margin-of-safety",
    "how-this-shows-up-on-compounder"
  ],
  "reading-cross-fund-consensus": [
    "what-consensus-means-here",
    "why-overlap-is-worth-a-look",
    "why-consensus-can-mislead",
    "how-to-use-it-on-compounder"
  ],
  "q2-2026-superinvestor-consensus": [
    "what-we-re-reading",
    "the-most-widely-held-stocks",
    "what-they-were-buying",
    "what-they-were-selling",
    "the-names-on-both-lists",
    "why-none-of-this-is-a-signal"
  ],
  "q1-2026-superinvestor-consensus": [
    "what-we-re-reading",
    "the-most-widely-held-stocks",
    "what-they-were-buying",
    "what-they-were-selling",
    "the-names-on-both-lists",
    "why-none-of-this-is-a-signal"
  ],
  "reading-business-quality": [
    "quality-comes-before-price",
    "profit-margins-the-first-look-at-pricing-power",
    "free-cash-flow-does-the-profit-turn-into-cash",
    "return-on-capital-and-why-it-misleads",
    "reading-them-together",
    "what-the-numbers-can-t-tell-you"
  ]
};
