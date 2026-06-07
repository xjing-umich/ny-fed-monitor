import type { Lang } from "@/lib/nav";
import type { LegalDoc } from "@/lib/legal";

// About page content, bilingual. Reuses the LegalDoc shape so it can render
// through the shared ProseDoc layout. This page doubles as a compliance asset:
// the "What we don't do" section reinforces the educational, non-advice
// characterization of the site.

const ABOUT: Record<Lang, LegalDoc> = {
  zh: {
    title: "关于 Compounder",
    intro:
      "Compounder(复利,thecompounder.fyi)是一个面向价值投资者的财经教育与研究工具。很多有用的数据埋在监管申报里,我们把它们集中到一处、整理得能读,剩下的思考留给你自己。",
    sections: [
      {
        heading: "我们做什么",
        paragraphs: [
          "我们把三类公开数据放到一起:超级投资者的 SEC 13F 持仓和基金之间的重叠、单只股票的估值框架,以及宏观流动性背景(资金面、供给面、政策面)。",
          "想法是把专业投资者会留意的信息,整理成普通人也读得懂的样子。它是你做研究的起点,不是终点。",
        ],
      },
      {
        heading: "我们不做什么",
        paragraphs: [
          "我们不荐股,不设目标价,不喊买卖,也不提供任何个性化的投资、法律、会计或税务建议。这里的一切只供信息和教育用途。",
          "我们不管钱,不收代客理财的费用,你买卖任何证券我们也不从中获利。钱怎么用是你自己的决定;真要听建议,该问的是持牌的专业人士。",
        ],
      },
      {
        heading: "我们的理念",
        paragraphs: [
          "我们出自价值投资这一脉:本杰明·格雷厄姆的安全边际,以及沃伦·巴菲特那种偏好——以合理价格买好生意,然后耐心拿着。",
          "我们的偏向是:把一门生意搞懂,比猜它价格下一步往哪走更值钱;复利奖励的是纪律,不是投机。",
        ],
      },
      {
        heading: "数据与来源",
        paragraphs: [
          "数据来源于公开渠道,主要包括美国证券交易委员会 EDGAR 系统(13F 等申报)、纽约联储(NY Fed)与美国财政部 Treasury.gov。",
          "请注意:13F 申报具有滞后性(通常在季度结束后最多 45 天披露),反映的是过去某一时点的持仓,不代表当前实际仓位。详见我们的免责声明。",
        ],
      },
      {
        heading: "联系我们",
        paragraphs: [
          "有反馈、纠错或合作意向?欢迎通过页脚的「联系我们」表单与我们联系。",
        ],
      },
    ],
  },
  en: {
    title: "About Compounder",
    intro:
      "Compounder (thecompounder.fyi) is an educational and research tool for value investors. A lot of useful data sits buried in regulatory filings. We pull it into one place and make it readable, so the thinking is left to you.",
    sections: [
      {
        heading: "What We Do",
        paragraphs: [
          "We bring together three kinds of public data: superinvestors' SEC 13F holdings and where funds overlap, valuation frameworks for individual stocks, and the macro-liquidity backdrop (funding, supply, and policy).",
          "The idea is to take the information professional investors pay attention to and put it in a form anyone can read. It's a place to start your own research, not a finish line.",
        ],
      },
      {
        heading: "What We Don't Do",
        paragraphs: [
          "We don't recommend stocks, set price targets, or call buys and sells, and we don't give personalized investment, legal, accounting, or tax advice. Everything here is for information and education only.",
          "We don't manage money, charge advisory fees, or make anything when you buy or sell a security. What you do with your money is your decision, and a licensed professional is the right person to ask when you need real advice.",
        ],
      },
      {
        heading: "Our Philosophy",
        paragraphs: [
          "We come out of the value-investing tradition: Benjamin Graham's margin of safety, and Warren Buffett's preference for good businesses bought at fair prices and held patiently.",
          "Our bias is that understanding a business is worth more than guessing where its price goes next, and that compounding rewards discipline rather than speculation.",
        ],
      },
      {
        heading: "Data & Sources",
        paragraphs: [
          "Data is sourced from public channels, primarily the U.S. Securities and Exchange Commission's EDGAR system (13F and other filings), the Federal Reserve Bank of New York (NY Fed), and the U.S. Department of the Treasury (Treasury.gov).",
          "Note that 13F filings are lagging (typically disclosed up to 45 days after quarter-end) and reflect holdings as of a past point in time, not current positions. See our Disclaimer for details.",
        ],
      },
      {
        heading: "Contact",
        paragraphs: [
          "Feedback, corrections, or partnership ideas? Reach us through the “Contact Us” form in the footer.",
        ],
      },
    ],
  },
};

export function getAboutDoc(lang: Lang): LegalDoc {
  return ABOUT[lang];
}
