import type { Lang } from "@/lib/nav";
import type { LegalSection } from "@/lib/legal";

// Evergreen educational articles, bilingual. Content-as-code: each Article reuses
// the LegalDoc shape (title / intro / sections) so it renders through the shared
// ProseDoc layout, plus list/SEO metadata (slug / description / updated).
//
// These are educational, non-advice explainers — the safe link targets for
// outbound posts (Reddit / HN / X) and the SEO landing pages for the site.

/** 文章正文里点名的实体 → 对应实体页内链(SEO 内链, 仅给"文中确有提及"的文章配)。 */
export type ArticleEntityRef = { kind: "investor" | "stock"; id: string; label: string };

export interface Article {
  slug: string;
  title: string;
  /** Meta description + list-page summary. */
  description: string;
  /** ISO date, shown as "Last updated" and used for Article JSON-LD. */
  updated: string;
  intro: string;
  sections: LegalSection[];
  /** 可选:文中点名的投资人/个股, 渲染为文末"相关"内链。id = manager slug / ticker。 */
  related?: ArticleEntityRef[];
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
  "reading-cross-fund-consensus": {
    en: {
      slug: "reading-cross-fund-consensus",
      title: "Reading Cross-Fund Consensus",
      description:
        "Which stocks the most superinvestors hold at once — what that overlap tells you, where it misleads, and how to use cross-fund consensus as a starting point rather than a buy signal.",
      updated: "2026-06-08",
      intro:
        "Compounder's stock pages are built around one idea: counting how many superinvestors hold the same company at the same time. We call that cross-fund consensus, and it's the first thing you see when you open the Stocks page. A high number looks like a strong signal. Sometimes it is. More often it's less than it appears, and telling the difference is most of the value.",
      sections: [
        {
          heading: "What consensus means here",
          paragraphs: [
            "Consensus here is a plain count. For every stock, we look across the superinvestors we track and tally how many of them held it as of their latest 13F. Hold the same name as two or more of them and the stock shows up on the Stocks page, ranked by that holder count.",
            "We draw the line at two on purpose. One famous investor owning something tells you about that one investor. Several owning the same thing, each doing their own work, is a different kind of evidence. Two is the point where overlap starts to mean anything at all.",
          ],
        },
        {
          heading: "Why overlap is worth a look",
          paragraphs: [
            "When people who don't talk to each other reach the same conclusion, it's worth asking why. They've each run their own numbers and still landed on the same company. That doesn't make them right, but it does make the company a reasonable place to start reading.",
            "Consensus works best as a filter, not a verdict. There are thousands of public companies. A short list of the ones serious, independent investors keep returning to is a shortcut to the businesses worth understanding first. Treat it as a reading list drawn up by people who read carefully.",
          ],
        },
        {
          heading: "Why consensus can mislead",
          paragraphs: [
            "Now the catch. A high holder count can fool you in a few ways, and the data behind it carries the same blind spots every 13F does.",
            "The investors aren't as independent as the count suggests. Many of them read the same letters, sit in the same conferences, and came up through the same handful of firms. When a dozen of them own one stock, you may be seeing a single good idea that spread, not a dozen separate ones.",
            "The filings are old. A 13F can lag the real portfolio by up to 45 days, so a consensus you read today was assembled from positions held weeks or months ago. Some of those investors may already be out.",
            "And a crowd says nothing about price. Each of those investors bought at a different time, at a different cost, for reasons the filing never shows. A stock twenty funds own is not therefore cheap. It might be expensive precisely because it's popular.",
          ],
        },
        {
          heading: "How to use it on Compounder",
          paragraphs: [
            "Use consensus to find candidates, then set it aside. Open the Stocks page, see which companies the most investors hold, and let that point you toward names worth a closer look. At that point the count has done its job.",
            "The real work starts on the individual stock and investor pages: who holds it, how that group has shifted over the last few quarters, whether the people buying are ones whose thinking you respect. A position someone keeps adding to says more than a crowd that happened to be holding on one particular day.",
            "None of this is a buy signal, and none of it is advice. Consensus shows you where thoughtful investors have been looking. Whether any of it belongs in your own portfolio is a question only you can answer, once you understand the business yourself.",
          ],
        },
      ],
    },
    zh: {
      slug: "reading-cross-fund-consensus",
      title: "读懂跨基金共识",
      description:
        "哪些股票被最多超级投资者同时持有——这种重叠能告诉你什么、又会在哪里骗你,以及怎样把跨基金共识当作研究起点,而不是买入信号。",
      updated: "2026-06-08",
      intro:
        "Compounder 的个股页面就围着一件事转:数一数有多少位超级投资者在同一时间持有同一家公司。我们管这叫跨基金共识,你一打开「个股」页,最先看到的就是它。数字高,看上去像个强信号。有时候确实是,但更多时候它没看起来那么重,而能不能分清这点,正是它大半的价值。",
      sections: [
        {
          heading: "这里说的「共识」是什么",
          paragraphs: [
            "这里的「共识」就是个简单的计数。对每只股票,我们把追踪的超级投资者过一遍,数出在他们最新一份 13F 里持有它的有几位。被其中两位或更多人持有,这只股票就会出现在「个股」页上,按持有人数排序。",
            "我们特意把线划在「两位」。一位名气大的投资者持有某样东西,告诉你的是关于他这一个人的事;好几位各自做功课的人持有同一样东西,则是另一种证据。两位,正是重叠开始有点意义的那个门槛。",
          ],
        },
        {
          heading: "重叠为什么值得看",
          paragraphs: [
            "当一群互不通气的人得出同一个结论,这事值得问个为什么。他们各自算过账,最后还是落到了同一家公司上。这不代表他们对,但确实让这家公司成了一个合理的阅读起点。",
            "共识最好用的时候,是当成筛子,而不是判决。上市公司成千上万,而一份「严肃、独立的投资者反复回头看」的短名单,是条捷径,帮你先去搞懂那些最值得搞懂的生意。把它当成一份阅读清单,由一群读得很仔细的人开出来的。",
          ],
        },
        {
          heading: "共识为什么会骗你",
          paragraphs: [
            "现在说说陷阱。一个高持有人数能从好几个方向骗到你,而它背后的数据,也带着每份 13F 都有的那些盲点。",
            "这些投资者,没有计数显示得那么独立。他们里很多人读同样的信、坐同样的会、出自同样那几家公司。当一打人持有同一只股票,你看到的可能是一个好点子传开了,而不是一打各自独立的点子。",
            "申报是旧的。13F 最多能比真实组合滞后 45 天,所以你今天读到的共识,是用几周甚至几个月前的仓位拼出来的。其中一些人,可能早就出来了。",
            "而且,扎堆这件事,对价格只字未提。那些投资者每一位都在不同时间、以不同成本、出于你在申报里看不到的理由买入。一只被二十家基金持有的股票,并不因此就便宜。它可能恰恰因为热门而贵。",
          ],
        },
        {
          heading: "在 Compounder 上怎么用",
          paragraphs: [
            "用共识来找候选,然后就把它放下。打开「个股」页,看哪些公司被最多投资者持有,让它把你引向值得细看的名字。到这一步,计数的活儿就干完了。",
            "真正的功夫,从个股页和投资者页才开始:谁在持有、这群人过去几个季度怎么变的、正在买入的是不是你尊重其思路的人。一个有人不断加仓的仓位,比某一天碰巧被一群人拿着,要说明问题得多。",
            "这一切都不是买入信号,也都不是投资建议。共识让你看到用心的投资者一直在看哪里;这其中有没有哪样该进你自己的组合,是个只有你能回答的问题——在你自己搞懂了那门生意之后。",
          ],
        },
      ],
    },
  },
  "q1-2026-superinvestor-consensus": {
    en: {
      slug: "q1-2026-superinvestor-consensus",
      title: "Q1 2026: What the Superinvestors Held, Bought, and Sold",
      description:
        "A read of the Q1 2026 13F filings: the most widely held stocks, the quarter's biggest buys and sells, and why overlap still isn't a signal.",
      updated: "2026-06-11",
      intro:
        "Big institutional investors disclose their U.S. stock positions every quarter, and the Q1 2026 filings are in. They cover the quarter that ended March 31 and were filed through mid-May. Below is what the investors we track were holding, what most of them were buying, and what they were selling. It is one quarter's data, and the last section gets into why the overlap you're about to see proves less than it looks.",
      sections: [
        {
          heading: "What we're reading",
          paragraphs: [
            "These figures come from Form 13F, the quarterly filing any manager running at least $100 million in U.S. stocks has to submit to the SEC. We line up the filings from the investors on Compounder's superinvestor list and count where they agree and where they moved. If you want the mechanics of a single filing, How to Read a 13F covers them.",
            "Everything below is as of the last day of the quarter, March 31, 2026. Some of these positions have surely changed since, and none of the figures tell you what anyone paid.",
          ],
        },
        {
          heading: "The most widely held stocks",
          paragraphs: [
            "Alphabet was the single most common holding, in 16 of the tracked portfolios through its C-share line (GOOG), with another 15 holding the A shares (GOOGL). Berkshire Hathaway came next at 14, then Microsoft at 13. Visa and Meta tied at 12. Moody's, Amazon, and Mastercard tied at 11, and Apple closed out the top ten at 10.",
            "It is a familiar lineup: payment networks, a ratings business with few real competitors, a few of the big compounders. These are the companies long-term investors expect to still be around in ten years.",
          ],
        },
        {
          heading: "What they were buying",
          paragraphs: [
            "More funds added to Microsoft than to any other stock this quarter. Alphabet, Amazon, and Berkshire were close behind. In each of those, funds were topping up positions they already held rather than starting fresh ones. The money went to companies these investors already knew.",
            "Sunbelt Rentals was the standout new buy. Several funds opened it from scratch, which rarely happens with a name this far outside the mega-caps. Some funds also started Alphabet positions through the A-share line, and managed care drew real money, with both Elevance and UnitedHealth among the more widely bought stocks.",
          ],
        },
        {
          heading: "What they were selling",
          paragraphs: [
            "The sell side ran through the same household names. Alphabet, Visa, Meta, and Microsoft were trimmed the most widely, and these were mostly reductions, not clean exits. Bank of America, Berkshire, Amazon, Capital One, Mastercard, and Charles Schwab also turned up among the stocks funds were cutting back.",
            "UnitedHealth is the one worth slowing down on. More funds left it entirely than trimmed it, while a separate group kept adding. The investors we track pulled in opposite directions on UnitedHealth all quarter.",
          ],
        },
        {
          heading: "The names on both lists",
          paragraphs: [
            "Alphabet, Microsoft, Meta, Amazon, Berkshire, and UnitedHealth all sit near the top of the buy list and the sell list at once. The most heavily traded names had capable funds buying and capable funds selling in the same window.",
            "This is what consensus looks like up close. A lot of serious investors studied the same company over the same three months and walked away with opposite answers. A high holder count means a stock is on a lot of screens. Whether those investors agree about it is a different question, and usually the answer is no.",
          ],
        },
        {
          heading: "Why none of this is a signal",
          paragraphs: [
            "A stock being widely held, or widely bought, is a reason to look closer. It is not a conclusion. A 13F is long-only, up to 45 days old, and says nothing about why a manager bought or what they paid. A name several investors you respect all own is worth your time. It is still not worth buying just because they did.",
            "Reading Cross-Fund Consensus goes deeper on the trap that consensus sets. The investor and stock pages on Compounder track how these positions move from one quarter to the next. None of this is investment advice.",
          ],
        },
      ],
      related: [
        { kind: "stock", id: "GOOGL", label: "Alphabet" },
        { kind: "stock", id: "MSFT", label: "Microsoft" },
        { kind: "stock", id: "AMZN", label: "Amazon" },
        { kind: "stock", id: "AAPL", label: "Apple" },
        { kind: "stock", id: "V", label: "Visa" },
        { kind: "stock", id: "META", label: "Meta" },
        { kind: "stock", id: "UNH", label: "UnitedHealth" },
        { kind: "investor", id: "berkshire-hathaway", label: "Berkshire Hathaway" },
      ],
    },
    zh: {
      slug: "q1-2026-superinvestor-consensus",
      title: "2026 Q1：超级投资者持有、买入与卖出了什么",
      description:
        "一份对 2026 Q1 13F 申报的解读：被最多机构持有的股票、本季最大的买入与卖出，以及为什么「重合」依然不是信号。",
      updated: "2026-06-11",
      intro:
        "每个季度,大型机构投资者都必须披露他们持有的美股仓位,2026 年 Q1 的申报如今已经出全。这一季截至 3 月 31 日,各家在 5 月中前报齐。下面是我们追踪的这些投资者当时持有什么、其中最多人在买什么、又在卖什么。这只是一个季度的数据;最后一节会讲清楚,你接下来看到的这些重合,为什么远没有它看上去那么有分量。",
      sections: [
        {
          heading: "我们在读什么",
          paragraphs: [
            "这些数字来自 Form 13F,任何管理至少 1 亿美元美股的机构,每季度都得向 SEC 提交它。我们把 Compounder 超级投资者名单里这些人的申报排在一起,数他们在哪里一致、又在哪里调了仓。想了解单份申报怎么读,《如何读懂 13F》讲了机制。",
            "下面所有数字,都是季度最后一天,也就是 2026 年 3 月 31 日的状态。其中一些仓位此后必定已经变了,而且没有一个数字告诉你任何人当初买在什么价位。",
          ],
        },
        {
          heading: "被最多机构持有的股票",
          paragraphs: [
            "Alphabet 是被持有得最广的单一标的:16 家追踪组合通过它的 C 类股(GOOG)持有,另有 15 家持有 A 类股(GOOGL)。其后是 Berkshire Hathaway,14 家持有;再是 Microsoft 的 13 家;Visa 和 Meta 各 12 家;Moody's、Amazon、Mastercard 并列 11 家。Apple 以 10 家收尾前十。",
            "这个阵容很眼熟:支付网络、一家几乎没有对手的评级公司、几只大市值复利机器。都是长期投资者预期十年后还在的公司。",
          ],
        },
        {
          heading: "他们在买什么",
          paragraphs: [
            "Microsoft 是本季被买得最广的名字,加仓它的基金比加仓任何其他股都多。Alphabet、Amazon、Berkshire 紧随其后,而且每一个都是基金在给已有仓位加码,不是新开仓。钱流向的是这些投资者本就熟悉的公司。",
            "最值得一提的新仓位是 Sunbelt Rentals,本季有好几家基金从零开仓;这种远离大市值的名字能冲到买入榜前列,并不常见。也有若干基金通过 A 类股新开 Alphabet;医疗保险吸引了真金白银,Elevance 和 UnitedHealth 都跻身被买得较广的名字之列。",
          ],
        },
        {
          heading: "他们在卖什么",
          paragraphs: [
            "卖出一侧,领头的还是那几个家喻户晓的名字。Alphabet、Visa、Meta、Microsoft 被减得最广,多数是减仓而非清仓。Bank of America、Berkshire、Amazon、Capital One、Mastercard、Charles Schwab 也都出现在被最多基金削减的股票里。",
            "UnitedHealth 值得放慢看一眼。清仓它的基金比减仓它的还多,而另一拨人却在持续加仓。整个季度,我们追踪的这些投资者在 UnitedHealth 上方向相反。",
          ],
        },
        {
          heading: "同时出现在两张榜上的名字",
          paragraphs: [
            "Alphabet、Microsoft、Meta、Amazon、Berkshire、UnitedHealth,同时挤在买入榜和卖出榜的前列。被交易得最多的那些名字,在同一段时间里既有能干的基金在买,也有能干的基金在卖。",
            "这就是共识凑近了看的样子。一群认真的投资者,研究同一家公司、看的是同样三个月,却走出了相反的结论。持有家数高,只说明一只股票出现在很多人的屏幕上;他们是否认同它,是另一个问题,而答案通常是否定的。",
          ],
        },
        {
          heading: "为什么这些都不是信号",
          paragraphs: [
            "一只股票被广泛持有、或被广泛买入,只是让你该看得更近的理由,谈不上结论。13F 只含多头、最多滞后 45 天,对一位经理为什么买、买在什么价位只字不提。一个被几位你尊重的投资者共同持有的名字,值得你花时间看;但它仍然不值得你因为别人买了就跟着买。",
            "《读懂跨基金共识》更深入地讲了共识设下的陷阱。Compounder 的投资者页和个股页,逐季追踪这些仓位怎么变。这一切都不是投资建议。",
          ],
        },
      ],
      related: [
        { kind: "stock", id: "GOOGL", label: "Alphabet" },
        { kind: "stock", id: "MSFT", label: "Microsoft" },
        { kind: "stock", id: "AMZN", label: "Amazon" },
        { kind: "stock", id: "AAPL", label: "Apple" },
        { kind: "stock", id: "V", label: "Visa" },
        { kind: "stock", id: "META", label: "Meta" },
        { kind: "stock", id: "UNH", label: "UnitedHealth" },
        { kind: "investor", id: "berkshire-hathaway", label: "Berkshire Hathaway" },
      ],
    },
  },
  "reading-business-quality": {
    en: {
      slug: "reading-business-quality",
      title: "What Makes a Business High Quality: Reading the Numbers Behind Superinvestor Holdings",
      description:
        "How to judge whether a business is any good from a few numbers in its filings: profit margins, free cash flow, and returns on capital, worked through the stocks superinvestors actually own.",
      updated: "2026-06-11",
      intro:
        "Compounder shows you which stocks the superinvestors own and how that ownership shifts each quarter. Knowing who holds a stock is a starting point. The harder and more useful question is whether the underlying business is any good. You can get a long way toward answering that from a handful of numbers in a company's financial statements, and every stock page on the site carries them. This is a guide to reading those numbers, worked through the businesses that turn up most often in superinvestor portfolios. None of it is a verdict on any stock. It is a way to look.",
      sections: [
        {
          heading: "Quality comes before price",
          paragraphs: [
            "Value investors going back to Graham and Buffett keep two questions apart that beginners tend to blur: is this a good business, and is it trading at a good price. A wonderful company bought at too high a price is still a bad investment. A mediocre one bought cheaply enough can work out fine. This guide is only about the first question. Price is its own discipline, and the numbers here say nothing about it.",
            "There is no single 'quality' number. You build a picture from a few angles: how profitable the business is, whether that profit turns into cash, how well it earns on the capital it uses, and how steady all of it looks over time. The figures on Compounder's stock pages come straight from SEC filings, so you can run this read on any holding you find on the site.",
          ],
        },
        {
          heading: "Profit margins: the first look at pricing power",
          paragraphs: [
            "Net margin is the share of each dollar of revenue that survives all the way down to profit. It is the quickest read on pricing power. A business that can charge well above what it costs to serve a customer, and keep doing it, posts a high and steady margin. One fighting on price cannot.",
            "The businesses superinvestors cluster in tend to sit at the high end. On their most recent filings shown here, Alphabet runs around a 57% net margin, Visa about 54%, Meta near 48%, Mastercard 46%, and Moody's 32%. Those are extraordinary numbers, and they are not an accident: a payment network or a ratings franchise takes a small cut of an enormous flow it does not have to fund. Apple, around 27%, and Amazon, near 17%, sit lower, which is the nature of selling physical products and running warehouses rather than tollbooths.",
            "Two cautions. Compare margins inside an industry, not across it, because a supermarket and a software company live in different worlds. And read the trend rather than one quarter. A margin that has slid for several years usually means something the latest figure hides.",
          ],
        },
        {
          heading: "Free cash flow: does the profit turn into cash?",
          paragraphs: [
            "Accounting profit and cash are not the same thing, and the gap between them tells you a lot about a business. Free cash flow is the cash left after a company pays to run its operations and reinvest in them. FCF margin is that cash as a share of revenue. Buffett's 'owner earnings' is the same instinct: what the owner could actually take out at the end of the year.",
            "Put net margin and FCF margin side by side and the businesses separate. Visa turns revenue into free cash at about 80%, higher than its net margin, because it barely spends on physical assets. Apple is similar, near 70%. These are capital-light machines. Alphabet is a different case: a 57% net margin but an FCF margin around 9% on its latest filing, because it is pouring money into data centers and chips. Amazon's FCF margin was negative on the same basis, near minus 10%, as it reinvests faster than the cash comes in.",
            "A low or negative FCF margin is not automatically a red flag. It can mean a weak business, or a strong one spending hard on its future. Telling those apart is the actual work, and it is why one number is never enough.",
          ],
        },
        {
          heading: "Return on capital, and why it misleads",
          paragraphs: [
            "Return on equity asks how much profit a company earns on the money shareholders have left in it. A business that earns high returns on capital and can reinvest at those returns is the closest thing investing has to a compounding machine, which is why the metric sits near the center of quality investing.",
            "It is also the easiest of these numbers to misread, in two ways. Debt and buybacks flatter it: equity is the denominator, so a company that borrows heavily or buys back stock until its equity is thin can show a dazzling return on a shaky base. A high number earned that way is worth less than the same number earned on a fortress balance sheet. And returns have to be read over full years and across a cycle, not from a single quarter. Compounder shows a per-filing figure, so use it as a prompt to pull up the multi-year picture and the debt behind it, not as a verdict on its own.",
          ],
        },
        {
          heading: "Reading them together",
          paragraphs: [
            "No single number settles anything, and the interesting cases are the ones where the metrics seem to disagree. Alphabet's thin free cash flow next to its fat net margin is not a flaw. It is a company in a heavy building phase, and the question is whether that spending pays off later. Berkshire Hathaway shows a low headline return on equity, which mostly reflects an enormous equity base built over decades rather than a weak business. Amazon spent most of its life with little or no free cash flow, by choice.",
            "The reason to look at several metrics is that each one checks the others. A fat margin with no cash behind it, a high return on capital sitting on a pile of debt, a number that looks fine this quarter but has fallen for three years: each of those only shows up when you line the figures up together. Where the site marks data as incomplete or leaves a field blank, that is part of the read too. Treat a gap as a question, not a pass.",
          ],
        },
        {
          heading: "What the numbers can't tell you",
          paragraphs: [
            "These figures describe a business as it was on its last filing, up to a few months ago. They say nothing about what comes next. A moat can erode, a new manager can change how capital gets spent, an industry can turn. They also say nothing about price, which is what actually decides your return. A great business is not automatically a great investment. What you pay decides that.",
            "So treat all of this as a way to ask better questions about the companies superinvestors own, not a scorecard that picks them for you. A 13F tells you who holds a stock. These numbers help you judge the business underneath it. What you do with that judgment, and at what price, is yours alone, and none of this is investment advice. Every figure here lives on the stock pages, refreshed each filing, if you want to run the read yourself.",
            "Margin figures cited above are from each company's most recent filing on Compounder, through Q1 2026 (periods ending 2026-03-31). Source: SEC filings via SEC EDGAR.",
          ],
        },
      ],
    },
    zh: {
      slug: "reading-business-quality",
      title: "什么样的生意算优质:读懂超级投资者持仓背后的数字",
      description:
        "怎么从申报里的几个数字判断一门生意好不好:利润率、自由现金流、资本回报率,拿超级投资者真实持有的股票逐一做案例。",
      updated: "2026-06-11",
      intro:
        "Compounder 让你看到超级投资者持有哪些股票、这份持有每季怎么变。知道谁在持有,只是起点。更难也更有用的问题是:底下那门生意到底好不好。这件事,你能从公司财报里的几个数字走出很远,而站上每个个股页都带着这些数字。这篇就讲怎么读它们,拿超级投资者持仓里最常出现的那些生意逐一做案例。它不是对任何一只股票的定论,而是一种看法的方法。",
      sections: [
        {
          heading: "先看质量,再看价格",
          paragraphs: [
            "从格雷厄姆到巴菲特,价投始终把两个问题分开,而新手往往把它们混在一起:这是不是一门好生意,以及它现在的价格是否划算。一家好公司,买得太贵,仍是一笔糟糕的投资;一家平庸公司,买得足够便宜,也可能不错。这篇只谈第一个问题。价格是另一门功课,下面这些数字对它只字不提。",
            "没有哪一个数字叫'质量'。你要从几个角度拼出一幅图:这门生意多赚钱、利润能不能变成现金、它用的资本回报如何、以及这一切常年看下来稳不稳。Compounder 个股页上的数字直接来自 SEC 申报,所以你能对站上任何一个持仓跑一遍这套读法。",
          ],
        },
        {
          heading: "利润率:对定价权的第一眼",
          paragraphs: [
            "净利率,是每一块钱营收里最终活到利润那一步的比例。它是对定价权最快的一眼。一门生意若能收得远高于服务一个客户的成本,还能一直收下去,就会有又高又稳的利润率;靠打价格战的,做不到。",
            "超级投资者扎堆的生意,往往落在高端。按站上各家最近一期申报:Alphabet 净利率约 57%,Visa 约 54%,Meta 近 48%,Mastercard 46%,Moody's 32%。这些是惊人的数字,也并非偶然:一家支付网络或评级特许经营,只是从一笔它不必出资的庞大流水里抽一小道。Apple 约 27%、Amazon 近 17%,要低一些,这是卖实物、跑仓库而非守收费站的本性。",
            "两点提醒。利润率要在同行业内比,别跨行业比,因为超市和软件公司活在两个世界。还要读趋势,而不是某一个季度:一个连跌几年的利润率,通常藏着最新数字看不出的东西。",
          ],
        },
        {
          heading: "自由现金流:利润变成现金了吗?",
          paragraphs: [
            "账面利润和现金不是一回事,而两者之间的缺口,能告诉你关于一门生意的很多事。自由现金流,是公司付完维持运营、再投资运营的钱之后剩下的现金。FCF 利润率,就是这笔现金占营收的比例。巴菲特的'股东盈余'(owner earnings)是同一个直觉:到年底,所有者真正能拿走多少。",
            "把净利率和 FCF 利润率并排放,生意就分出来了。Visa 把营收转成自由现金的比例约 80%,高过它的净利率,因为它几乎不用花钱买实物资产。Apple 类似,近 70%,都是轻资本的机器。Alphabet 是另一种情形:净利率 57%,但最近一期 FCF 利润率只有约 9%,因为它正把钱砸进数据中心和芯片。Amazon 同口径下 FCF 利润率为负,约 -10%,因为它再投资的速度快过现金进账。",
            "FCF 利润率低、甚至为负,不一定是坏信号。它可能意味着一门弱生意,也可能是一门强生意在为未来重金投入。把这两者分辨开,才是真正的功夫,也正是为什么一个数字永远不够。",
          ],
        },
        {
          heading: "资本回报率,以及它为什么骗人",
          paragraphs: [
            "净资产收益率(ROE)问的是:股东留在公司里的钱,公司从中赚出多少利润。一门能赚到高资本回报、又能按那个回报率把利润再投出去的生意,是投资里最接近'复利机器'的东西,这也是为什么这个指标处在质量投资的中心附近。",
            "它也是这些数字里最容易读错的,有两种错法。债务和回购会美化它:股东权益是分母,所以一家大举借债、或回购股票直到权益所剩无几的公司,能在脆弱的底子上显出耀眼的回报;这样赚来的高数字,远不如同样的数字坐在稳如堡垒的资产负债表上值钱。还有,回报要按整年、跨周期来读,而不是看单一季度。Compounder 显示的是每期的值,所以请把它当成一个提示:去把多年的全貌和背后的债务调出来看,别凭它本身下定论。",
          ],
        },
        {
          heading: "把它们放在一起读",
          paragraphs: [
            "没有哪个数字能单独说了算,而真正有意思的,是那些指标看上去彼此矛盾的情形。Alphabet 单薄的自由现金流挨着它丰厚的净利率,这不是缺陷。它是一家正处在重投入期的公司,问题在于那些花费日后是否值回。Berkshire Hathaway 的账面 ROE 很低,这多半反映的是几十年攒下的庞大权益基数,并不说明它是一门弱生意。Amazon 大半生都靠主动选择,过着几乎没有自由现金流的日子。",
            "看好几个指标的意义,在于每一个都在校验其他几个。一个有利润却没有现金垫底的高margin、一个坐在一堆债务上的高资本回报、一个这季看着还行却已连跌三年的数字:这些都只有在你把数字排在一起时才会现形。站上把数据标为不完整、或某个字段留空的地方,也是这套读法的一部分。把缺口当成一个问题,而不是一次放行。",
          ],
        },
        {
          heading: "数字读不出什么",
          paragraphs: [
            "这些数字描述的,是一门生意在它上一份申报时的样子,可能已是几个月前。它们对接下来会怎样只字不提:护城河会被侵蚀、一位新管理者会改变资本怎么花、一个行业会转向。它们对价格也只字不提,而价格才真正决定你的回报。一门好生意,并不自动等于一笔好投资。你付了多少,才决定这一点。",
            "所以把这一切当作向超级投资者所持公司提出更好问题的方法,而不是一张替你挑好股票的评分表。一份 13F 告诉你谁在持有一只股票;这些数字帮你判断它底下那门生意。你拿这份判断去做什么、在什么价位做,只属于你自己,而这一切都不是投资建议。上面每个数字都在个股页上,每期申报刷新,你想自己跑一遍读法,随时可以。",
            "上文引用的利润率数字,取自各公司在 Compounder 上的最近一期申报,截至 2026 Q1(period 截止 2026-03-31)。来源:SEC EDGAR 申报。",
          ],
        },
      ],
    },
  },
  "what-is-intrinsic-value": {
    en: {
      slug: "what-is-intrinsic-value",
      title: "What Is a Stock Actually Worth?",
      description:
        "Intrinsic value is the one idea underneath all of value investing. What it actually means, why it can't be calculated to a number, and how Graham, Buffett, Li Lu, and Duan Yongping each sharpened it.",
      updated: "2026-07-12",
      intro:
        "Everyone wants investing to come down to a number. The stock price is one, and it's the wrong one: it only tells you what the crowd will pay today. Intrinsic value looks like the better number, the real one hiding under the price. But you can't get that number either, not exactly. And that's the whole point. Intrinsic value isn't something you calculate. It's a way of admitting you can't know for sure what a business is worth, plus a few habits that let you invest well anyway. Graham, [[investor:berkshire-hathaway|Buffett]], [[investor:himalaya-capital|Li Lu]], and [[investor:hh-international|Duan Yongping]] all reach the same idea in different words. That idea, and everything it forces on you, is the rest of this piece.",
      sections: [
        {
          heading: "Price is not value",
          paragraphs: [
            "Graham's first move was to pull apart two words most people use as if they mean the same thing. The market hands you a price. It never hands you the value. In the short run, he said, the market is a voting machine; in the long run it's a weighing machine. Price swings on mood and on who's buying and selling that day. Value sits underneath, in the business itself.",
            "He made it concrete with Mr. Market: a moody partner who knocks every day with a new price, set by whatever mood he woke up in. He's there to serve you, not to advise you. Trade with him when his price suits you, ignore him when it doesn't. The one thing you can't let him do is tell you what your business is worth.",
          ],
        },
        {
          heading: "What intrinsic value actually is",
          paragraphs: [
            "The definition is simpler than most people expect. A business is worth the cash it will pay its owners over its life, counted in today's money. Buffett says it in one line: the discounted value of the cash that can be taken out of a business during its remaining life. [[investor:hh-international|Duan Yongping]] puts it plainer still: 'Buying a stock is buying the company, and buying the company is buying the discounted value of its future cash.' (2012)",
            "So value isn't the share price, and it isn't the book value on the balance sheet. It's the cash the business will actually produce. Buffett liked Aesop's version of this: a bird in the hand is worth two in the bush. The whole job is counting the birds in the bush and judging how sure you are they're there.",
            "That cash is in the future, so the value is never a hard fact. It's an estimate. Duan is blunt: 'intrinsic value is not calculated.' You don't solve for it with a formula. You make a rough, honest judgment about a business you understand.",
          ],
        },
        {
          heading: "The discount rate is your opportunity cost",
          paragraphs: [
            "'Discounted' is the word most people skip, and it's the one that carries the weight. In that 1999 Sun Valley talk, Buffett stripped investing down to a sentence: laying out money today to get more money back tomorrow. If that's the deal, a dollar the business earns ten years from now can't be worth a full dollar to you today. You'd rather have the dollar now and put it to work in the meantime. So you knock future cash down to reflect the wait, and how far you knock it down is the discount rate.",
            "That rate is anything but a technicality. In the same talk, [[investor:berkshire-hathaway|Buffett]] called interest rates the gravity of finance: 'interest rates act as gravity behaves in the physical world. At all times, in all markets, in all parts of the world, the tiniest change in rates changes the value of every financial asset.' A dollar arriving years from now is worth far less when rates are 13% than when they're 4%. Push rates up and every valuation gets pulled down; let them fall and everything floats higher.",
            "Where does the rate come from? Duan gives the ground-level answer: it's really your opportunity cost, and the floor under it is the risk-free rate, something close to the yield on U.S. Treasuries. That's why the ten-year Treasury yield turns up under every serious valuation, including the value estimates on this site. It's the gravity the rest of your money gets weighed against.",
          ],
        },
        {
          heading: "You can only value what you understand",
          paragraphs: [
            "The four-concept version of value investing has a fourth leg that Graham didn't lean on and Buffett added from fifty years at it: the circle of competence. You can only estimate the future cash of a business you truly understand, and for most of us, most businesses sit outside that circle.",
            "[[investor:himalaya-capital|Li Lu]]'s version cuts to the edge of it: 'a competence without a boundary isn't real competence.' A view you actually hold is one where you can name the conditions that would prove you wrong. Duan gives the working test. Understanding a company means you can roughly estimate its future cash, and the honest sign that you can is that you stop asking other people whether you understand it. What makes that cash estimable at all is the business model underneath it, and the culture running it. A durable business model, Duan says, is what keeps the future cash coming.",
            "If you can't understand a business, you have no way to know what it's worth. So you leave it alone, even when the price looks cheap.",
          ],
        },
        {
          heading: "A range, not a number",
          paragraphs: [
            "Because the value is a guess about the future, it lands as a range, not a point. Two honest, careful people will come out with different numbers, and that's fine. Buffett's standard is to be roughly right instead of precisely wrong. Duan is blunter still: if you need a calculator to see that something's cheap, it isn't cheap enough. He calls his own approach a rough eyeball estimate, and he means it as a compliment. A detailed spreadsheet looks rigorous, but it lays a coat of false precision over what are still guesses about the future.",
            "These investors mostly use the number for one thing: sizing up the downside, so they know what they'd lose if they're wrong. The real return comes from the judgment call: is this a good business, run by honest people, that will still be strong in ten years? That's the hard part, and no formula makes the call for you.",
          ],
        },
        {
          heading: "The golden rule: margin of safety",
          paragraphs: [
            "You've got a range for a business you understand, and you know the range can be wrong. That's the whole reason for the one rule you can't skip, Graham's margin of safety: buy far enough below your estimate that being wrong won't hurt you much. Pay right up to your estimate and you've left yourself no room to be human.",
            "Li Lu reframes what you're really defending against. The risk that matters isn't the price bouncing around. It's the permanent loss of your capital, and the margin of safety is the wall you build against it. Duan takes it one step further, to a line worth sitting with: the margin of safety is really about the circle of competence, not just the price. A cheap price on a business you don't understand is no margin of safety at all. The safety comes from knowing what you own.",
          ],
        },
        {
          heading: "How this shows up on Compounder",
          paragraphs: [
            "This is the frame behind what you see on a stock page here. The value estimate shows up as a band, not a single target, because an honest estimate is a range. The margin-of-safety figure only appears when a stock sits genuinely below that band, since flashing a discount on a fairly priced stock would just be noise. And the ten-year Treasury yield sits under all of it as the discount anchor, because that's the opportunity cost everything gets measured against.",
            "None of this tells you to buy or sell anything. It's the list of questions worth asking before you decide, and the deciding is yours.",
            "Sources: Benjamin Graham, The Intelligent Investor; Warren Buffett, Berkshire Hathaway shareholder letters and \"Mr. Buffett on the Stock Market\" (Fortune, Nov. 22, 1999); Li Lu, lecture at Peking University (Oct. 23, 2015); Duan Yongping, published investment Q&A.",
          ],
        },
      ],
      related: [
        { kind: "investor", id: "himalaya-capital", label: "Li Lu" },
        { kind: "investor", id: "hh-international", label: "Duan Yongping" },
        { kind: "investor", id: "berkshire-hathaway", label: "Berkshire Hathaway" },
      ],
    },
    zh: {
      slug: "what-is-intrinsic-value",
      title: "一只股票到底值多少钱",
      description:
        "内在价值,是价值投资底下最根本的一个概念。它到底是什么、为什么算不出一个精确的数字,以及格雷厄姆、巴菲特、李录、段永平如何一步步把它讲清楚。",
      updated: "2026-07-12",
      intro:
        "每个人都想把投资归结成一个数字。股价就是个数字,可它是错的那个:它只告诉你此刻人群愿意出多少。内在价值看着像那个更好的、藏在价格底下的「真」数字。可你同样得不到这个数字,至少得不到准的。而这正是关键。内在价值不是你算出来的。它是一种态度:承认你没法确切知道一门生意值多少;再加上几条规矩,让你照样能投得好。格雷厄姆、[[investor:berkshire-hathaway|巴菲特]]、[[investor:himalaya-capital|李录]]、[[investor:hh-international|段永平]],说法不同,说的是同一件事。下面讲的就是这件事,和它逼你养成的那些习惯。",
      sections: [
        {
          heading: "价格不是价值",
          paragraphs: [
            "格雷厄姆做的第一件事,是把大多数人当同义词用的两个词拆开。市场递给你的是价格,从不递给你价值。用他的话说,市场短期是投票机,长期是称重机。价格随情绪、随当天谁在买谁在卖上下跳;价值沉在底下,在生意本身里。",
            "他打了个比方,叫「市场先生」:一个情绪化的生意伙伴,每天来敲你的门报个价,那价全看他当天什么心情。他是来服务你的,不是来给你出主意的。他的价合适你就跟他做,不合适就不理他。唯一不能让他做的,是由他来告诉你,你的生意值多少钱。",
          ],
        },
        {
          heading: "内在价值到底是什么",
          paragraphs: [
            "这个定义比大多数人以为的简单。一门生意值多少,就是它一生能付给所有者的现金,用今天的钱来算。巴菲特一句话:它是一家企业在余下的寿命史中可以产生的现金的折现值。[[investor:hh-international|段永平]]说得更白:「买股票就是买公司,买公司就是买其未来现金流(的折现)。」(2012)",
            "所以价值不是股价,也不是资产负债表上的账面净资产。它是这门生意将来真正能产出的现金。巴菲特喜欢用伊索的说法:一鸟在手,胜过二鸟在林。全部的活儿,就是数清林子里有几只鸟,再判断你有多大把握它们真在。",
            "这笔现金在未来,所以价值永远不是铁一样的事实,它是个估计。段永平说得直白:「内在价值不是算出来的。」你不是拿公式去解它,而是对一门你看得懂的生意,做一个粗略而诚实的判断。",
          ],
        },
        {
          heading: "折现率就是你的机会成本",
          paragraphs: [
            "「折现」这两个字大多数人会跳过,可它才是最要紧的。就在 1999 年太阳谷那场演讲里,巴菲特把投资剥到只剩一句:今天付出钱,是为了明天收回更多的钱。如果是这么个买卖,那么生意十年后赚到的一块钱,今天对你就不可能值满满一块。你宁愿现在就拿到,好让它在这中间去干活。所以你把未来的现金往下打个折,来抵这段等待;打多深,就是折现率。",
            "这个折现率绝不是什么技术细节。还是那场演讲,[[investor:berkshire-hathaway|巴菲特]]把利率叫作金融世界的地心引力:「利率之于金融,如同地心引力之于物质。任何时候、任何市场、世界任何角落,利率哪怕最微小的变动,都会改变每一项金融资产的价值。」同样一块多年后才到手的钱,利率 13% 时远不如 4% 时值钱。利率往上顶,所有估值都被往下拽;利率一落,一切又往上浮。",
            "折现率从哪儿来?段永平给的答案最实在:它其实就是你的机会成本,而它的底,是无风险回报率,差不多就是美国国债的利率。这就是为什么十年期美国国债收益率会垫在每一个严肃估值的底下,也垫在你在这个站上看到的价值估算底下。它就是你其余的钱用来称重的那股地心引力。",
          ],
        },
        {
          heading: "你只能给看得懂的生意估值",
          paragraphs: [
            "把价值投资讲成四个基本概念,第四条是格雷厄姆没倚重、巴菲特干了五十年才补上的:能力圈。你只能估出一门你真正看得懂的生意的未来现金,而对我们大多数人来说,大多数生意都在这个圈子外头。",
            "[[investor:himalaya-capital|李录]]的说法直指它的边:「没有边界的能力,就不是真的能力。」你真正持有的观点,是你说得出什么条件会证明它错。段永平给了可上手的判据:看懂一家公司,就是你能大致估出它的未来现金流;而你真能估的诚实信号,是你不再想去问别人「我到底看懂了没」。让这笔现金变得可估的,是它底下的生意模式,和运营它的企业文化。段永平说,好的生意模式,才能让现金一年年不断地流出来。",
            "所以一门你看不懂的生意,你根本无从知道它值多少。这不是价值低,是没有价值可谈。哪怕价格看着便宜,也放着别碰。",
          ],
        },
        {
          heading: "是一个区间,不是一个数",
          paragraphs: [
            "因为价值是对未来的一个猜测,它落下来是一个区间,不是一个点。两个诚实、认真的人,会算出不一样的数,这很正常。巴菲特的标准是:宁可大致对,也不要精确地错。段永平更冲:要用计算器才算得出来的便宜,就不够便宜。他把自己的路子叫「毛估估」,而且是当褒义词讲的。一张精细的表格看着严谨,其实是在一堆对未来的猜测上,又刷了一层虚假的精确。",
            "这些人用这个数,主要就干一件事:估一估万一错了、最坏会亏多少。真正的回报来自定性的判断:这是不是一门好生意,由诚实的人经营,十年后还依然强壮?这才是最难的地方,没有公式替你拿主意。",
          ],
        },
        {
          heading: "黄金法则:安全边际",
          paragraphs: [
            "你手里有一门确实看得懂的生意的一个区间,你也知道它可能错。正因为可能错,才有那条不能省的法则,格雷厄姆的安全边际:买得比你估的价值低足够多,错了也伤不到你。要是买到贴着你的估值,你就没给自己留一点犯错的余地。",
            "李录把你真正要防的东西重新定义了:要紧的风险,不是股价上上下下,而是你的本金永久性地没了,而安全边际就是你为它砌的那堵墙。段永平再往前推一步:安全边际的本质,其实是能力圈,不只是价格。一门你看不懂的生意,再便宜的价也算不上安全边际。安全,来自你知道自己买的是什么。",
          ],
        },
        {
          heading: "这些在 Compounder 上怎么体现",
          paragraphs: [
            "这就是你在这里个股页上看到的东西背后的框架。价值估算显示成一条带,不是单一目标价,因为诚实的估计本就是个区间。安全边际的数字,只在股价确实落到这条带以下时才出现,因为给一只定价合理的股票标个「折扣」,只是噪音。而十年期美国国债收益率垫在这一切底下,作为折现的锚,因为那是一切用来衡量的机会成本。",
            "这里没有一句叫你买或卖什么。它只是你自己下判断前该先问的一组问题。这四个人都是亏过钱才想明白的;答案,没人能替你给。",
            "参考来源:格雷厄姆《聪明的投资者》;巴菲特致伯克希尔股东的信,以及《Mr. Buffett on the Stock Market》(Fortune,1999-11-22);李录北京大学演讲(2015-10-23);段永平公开投资问答。",
          ],
        },
      ],
      related: [
        { kind: "investor", id: "himalaya-capital", label: "李录" },
        { kind: "investor", id: "hh-international", label: "段永平" },
        { kind: "investor", id: "berkshire-hathaway", label: "Berkshire Hathaway" },
      ],
    },
  },
};

// Display order on the index page.
export const ARTICLE_SLUGS: string[] = [
  "how-to-read-a-13f",
  "what-is-a-superinvestor",
  "what-is-intrinsic-value",
  "reading-cross-fund-consensus",
  "q1-2026-superinvestor-consensus",
  "reading-business-quality",
];

export function getArticle(slug: string, lang: Lang): Article | undefined {
  return ARTICLES[slug]?.[lang];
}

export function listArticles(lang: Lang): Article[] {
  return ARTICLE_SLUGS.map((slug) => ARTICLES[slug][lang]);
}
