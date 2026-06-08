import type { Lang } from "@/lib/nav";
import type { LegalSection } from "@/lib/legal";

// Evergreen educational articles, bilingual. Content-as-code: each Article reuses
// the LegalDoc shape (title / intro / sections) so it renders through the shared
// ProseDoc layout, plus list/SEO metadata (slug / description / updated).
//
// These are educational, non-advice explainers — the safe link targets for
// outbound posts (Reddit / HN / X) and the SEO landing pages for the site.

export interface Article {
  slug: string;
  title: string;
  /** Meta description + list-page summary. */
  description: string;
  /** ISO date, shown as "Last updated" and used for Article JSON-LD. */
  updated: string;
  intro: string;
  sections: LegalSection[];
}

const ARTICLES: Record<string, Record<Lang, Article>> = {
  "how-to-read-a-13f": {
    en: {
      slug: "how-to-read-a-13f",
      title: "How to Read a 13F",
      description:
        "What a 13F filing is, what it tells you about an investor's portfolio, and what it leaves out. A plain guide to reading one.",
      updated: "2026-06-07",
      intro:
        "Big institutional investors have to tell the public which U.S. stocks they own. They do it once a quarter, in a filing called a Form 13F, and those filings are where Compounder's superinvestor pages come from. A 13F can tell you a lot about how a serious investor is positioned. It can also mislead you if you take it at face value, so it helps to know what you're actually looking at.",
      sections: [
        {
          heading: "What a 13F is",
          paragraphs: [
            "Any institutional manager running at least $100 million in U.S. stocks has to file a 13F with the SEC every quarter. The filing lists the firm's U.S.-listed stock positions as of the last day of the quarter: the stock, the share count, and the market value.",
            "Line these filings up across a lot of well-known investors and you start to see overlap. The stocks that turn up in many portfolios at once are what we mean by consensus.",
          ],
        },
        {
          heading: "What you can learn from it",
          paragraphs: [
            "The most useful number on the page is position size. A stock that makes up 10% of a portfolio means something. A 0.2% sliver usually doesn't. Size is how an investor signals conviction, and the weighting puts it right in front of you.",
            "Overlap is worth watching too. When several investors who think independently all hold the same company, that proves nothing on its own, but it's a reasonable place to start looking. And if you set a manager's filing this quarter next to last quarter's, you can see what they added to, trimmed, or sold outright. That direction of travel often says more than any single snapshot.",
          ],
        },
        {
          heading: "What a 13F leaves out",
          paragraphs: [
            "This is where people get tripped up. By the time you read a 13F it's already old news, and it only ever shows part of the picture.",
            "For one thing, it can be up to 45 days stale. Managers get 45 days after the quarter closes to file, so the positions you're reading may already be weeks or months out of date.",
            "It also shows only what a fund is long. Short positions never appear, which means a stock that looks like a big bet might actually be hedged against something else. The report is limited to U.S.-listed stocks and some options, so cash, bonds, foreign shares, and private holdings don't show up at all. And it's a single day's photo: the numbers are whatever the fund held on the last day of the quarter, not the average position and not what they own today.",
          ],
        },
        {
          heading: "How to actually use it",
          paragraphs: [
            "Treat a 13F as a lead, not an answer. The useful question isn't \"what did they buy so I can buy it too.\" It's \"why might someone thoughtful own this, and do I understand the business well enough to judge that for myself?\"",
            "Copying a holding outright ignores everything the filing doesn't tell you: what the investor paid, how long they mean to hold, how much risk they can stomach, what else is in the portfolio. By the time any of it is public, the price and the reasoning behind it may have moved on.",
            "Compounder lets you see who holds a given stock and how that consensus shifts over time. It's a good way to find businesses worth a closer look. The looking is still up to you.",
          ],
        },
      ],
    },
    zh: {
      slug: "how-to-read-a-13f",
      title: "如何读懂 13F",
      description:
        "13F 申报是什么、它能告诉你投资者持仓的哪些信息、又遗漏了什么。一份大白话的阅读指南。",
      updated: "2026-06-07",
      intro:
        "大型机构投资者必须公开自己持有哪些美股。他们每季度披露一次,文件叫 Form 13F,Compounder 的超级投资者页面就来自这些申报。一份 13F 能告诉你不少东西,让你看到严肃投资者怎么布局;但要是照单全收,它也会把你带偏。所以先搞清楚你看到的到底是什么。",
      sections: [
        {
          heading: "13F 是什么",
          paragraphs: [
            "任何管理着至少 1 亿美元美股的机构,都得每季度向 SEC 申报一次 13F。文件列出它在季度最后一天持有的美国上市股票仓位:股票、持股数、市值。",
            "把许多知名投资者的申报摆在一起,你会看到重叠。同时出现在很多组合里的股票,就是我们说的\"共识\"。",
          ],
        },
        {
          heading: "你能读到什么",
          paragraphs: [
            "这页上最有用的数字是仓位大小。一只占组合 10% 的股票是有分量的,占 0.2% 的零头通常说明不了什么。仓位是投资者表达信念的方式,权重把它直接摆在你面前。",
            "重叠也值得看。当几位各自独立思考的投资者都持有同一家公司,这本身证明不了什么,但它是个合理的研究起点。如果你把一位管理人这季和上季的申报放在一起,就能看出他加了什么、减了什么、又清掉了什么。这个变化方向,往往比单张快照更说明问题。",
          ],
        },
        {
          heading: "13F 没说的部分",
          paragraphs: [
            "人们最容易在这里栽跟头。等你读到一份 13F,它已经是旧消息,而且永远只展示了一部分。",
            "首先,它最多能滞后 45 天。机构在季度结束后有 45 天时间申报,所以你看到的仓位,可能已经过去了几周甚至几个月。",
            "其次,它只显示多头。空头从不出现,也就是说一只看起来是重仓押注的股票,实际上可能是拿来对冲别的东西的。报告又只包含美国上市股票和部分期权,现金、债券、海外股份、私人持仓,统统不在里面。最后,它只是某一天的照片:数字是基金在季度最后一天的持仓,不是平均仓位,也不是它今天的持仓。",
          ],
        },
        {
          heading: "该怎么用",
          paragraphs: [
            "把 13F 当线索,别当答案。有用的问题不是\"他们买了什么,我好跟着买\",而是\"为什么一个想得明白的人会持有它,我对这门生意的理解,够不够我自己下判断?\"",
            "直接照抄持仓,会漏掉申报没说的一切:投资者的成本、打算拿多久、能扛多大风险、组合里还有些什么。等这些都公开时,价格和背后的逻辑可能早就变了。",
            "Compounder 能让你看到谁持有某只股票,以及这份共识随时间怎么变。拿它来发现值得细看的生意很合适。但细看这件事,还得你自己来。",
          ],
        },
      ],
    },
  },
  "what-is-a-superinvestor": {
    en: {
      slug: "what-is-a-superinvestor",
      title: "What Is a Superinvestor?",
      description:
        "Where the word comes from, the Graham-to-Buffett value-investing tradition behind it, and what these investors have in common: temperament, patience, and compounding.",
      updated: "2026-06-07",
      intro:
        "\"Superinvestor\" turns up all over Compounder. The word isn't a pat on the back for whoever topped the charts last year. It points to a particular tradition of value investors, and a particular way of thinking about businesses, prices, and time. Here's what we mean by it.",
      sections: [
        {
          heading: "Where the word comes from",
          paragraphs: [
            "The term traces back to a talk Warren Buffett gave at Columbia Business School in 1984, \"The Superinvestors of Graham-and-Doddsville.\" His point was that a handful of investors who had all studied under Benjamin Graham each beat the market for years, even though they ran completely different portfolios. What they shared wasn't a system. It was a habit of mind.",
            "That habit is value investing: pay less for a business than it's worth, insist on a margin of safety, and give time and compounding room to do the work.",
          ],
        },
        {
          heading: "From Graham to Buffett",
          paragraphs: [
            "Benjamin Graham is the starting point. In Security Analysis and The Intelligent Investor he argued that a share is a piece of a business, that price and value are two different things, and that you should leave yourself a margin of safety so being roughly right doesn't ruin you when you turn out to be partly wrong.",
            "Buffett built on that. Nudged along by Charlie Munger, he moved from hunting down dirt-cheap \"cigar-butt\" stocks toward paying fair prices for genuinely good businesses, the kind with durable advantages he could hold for decades.",
            "Plenty of investors since have taken these ideas and made them their own. They disagree about a lot, but the discipline underneath is the same.",
          ],
        },
        {
          heading: "What they have in common",
          paragraphs: [
            "What sets them apart is mostly temperament, not raw intelligence. The hard part of investing is sitting still when prices lurch and everyone around you is selling. Graham's line was that the market is a voting machine in the short run and a weighing machine in the long run.",
            "They also stay inside what they understand, and they're honest about where that understanding ends. They hold for years rather than quarters, and they put real money behind their best ideas instead of owning a little of everything. And they want the entry price low enough that the investment still works out if the future turns out worse than they hoped.",
          ],
        },
        {
          heading: "Why compounding matters so much",
          paragraphs: [
            "Compounding is the reason patience pays. A business that keeps growing its value, bought at a sensible price and held for a long time, can beat almost any amount of trading, because each year's gains build on the last.",
            "That's the idea behind the name Compounder. We're not here for this quarter's hot trade. We're here to understand good businesses and the people who hold them for the long haul.",
            "You can browse these investors and what they've disclosed across the site. Treat their portfolios as a reading list of companies worth understanding, not a set of instructions, and certainly not advice.",
          ],
        },
      ],
    },
    zh: {
      slug: "what-is-a-superinvestor",
      title: "什么是超级投资者?",
      description:
        "这个词从何而来、它背后从格雷厄姆到巴菲特的价值投资传统,以及这些投资者的共同点:性情、耐心,还有复利。",
      updated: "2026-06-07",
      intro:
        "\"超级投资者\"这个词在 Compounder 上随处可见,它不是给\"去年排第一的人\"的恭维。它指向价值投资里一条特定的传统,以及一种看待生意、价格和时间的特定方式。下面说说我们指的是什么。",
      sections: [
        {
          heading: "这个词的来历",
          paragraphs: [
            "这个说法可以追溯到 1984 年巴菲特在哥伦比亚商学院的一次演讲,《格雷厄姆-多德都市里的超级投资者》。他想说的是:一批都师从本杰明·格雷厄姆的投资者,尽管组合各不相同,却各自连续多年跑赢了市场。他们的共同点不是一套系统,而是一种思维习惯。",
            "这种习惯就是价值投资:用低于价值的价格买下一门生意,坚持安全边际,把活儿交给时间和复利去做。",
          ],
        },
        {
          heading: "从格雷厄姆到巴菲特",
          paragraphs: [
            "起点是本杰明·格雷厄姆。在《证券分析》和《聪明的投资者》里,他主张一股股票就是一门生意的一部分,价格和价值是两回事,而且你该给自己留出安全边际,这样即使只是大致看对,在部分看错时也不至于伤筋动骨。",
            "巴菲特在这之上往前走。在查理·芒格的推动下,他从专挑便宜得不能再便宜的\"烟蒂\"股,转向以合理价格买真正的好生意,也就是那些有持久优势、能拿上几十年的公司。",
            "此后不少投资者把这些想法变成了自己的东西。他们争论的地方很多,但底下那套纪律是一样的。",
          ],
        },
        {
          heading: "他们的共同点",
          paragraphs: [
            "让他们与众不同的,主要是性情,而不是智力。投资难就难在:价格剧烈晃动、周围人都在抛的时候,你还坐得住。格雷厄姆有句话,市场短期是投票机,长期是称重机。",
            "他们也只待在自己懂的范围里,并且对这个范围的边界很诚实。他们以年为单位持有,而不是以季;他们把真金白银押在最看好的几个想法上,而不是什么都买一点。他们还要求买入价足够低,低到即使未来比预想的差,这笔投资仍然划算。",
          ],
        },
        {
          heading: "为什么复利这么重要",
          paragraphs: [
            "复利,正是耐心能换来回报的原因。一门价值不断增长的生意,以合理价格买入、长期持有,效果能胜过几乎任何程度的频繁交易,因为每一年的收益都叠在上一年之上。",
            "这就是 Compounder(复利)这个名字背后的想法。我们不为这个季度的热门交易而来,我们想搞懂好生意,以及那些长期持有它们的人。",
            "你可以在站内浏览这些投资者和他们披露的持仓。把这些组合当成一份\"值得了解的公司\"清单,而不是操作指令,更不是投资建议。",
          ],
        },
      ],
    },
  },
};

// Display order on the index page.
export const ARTICLE_SLUGS: string[] = [
  "how-to-read-a-13f",
  "what-is-a-superinvestor",
];

export function getArticle(slug: string, lang: Lang): Article | undefined {
  return ARTICLES[slug]?.[lang];
}

export function listArticles(lang: Lang): Article[] {
  return ARTICLE_SLUGS.map((slug) => ARTICLES[slug][lang]);
}
