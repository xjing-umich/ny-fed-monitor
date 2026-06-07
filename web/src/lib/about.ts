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
      "Compounder(复利,thecompounder.fyi)是一个面向价值投资者的财经教育与研究工具。我们把分散在监管申报里的数据整理成清晰、可读的形式,帮助你独立思考——而不是替你做决定。",
    sections: [
      {
        heading: "我们做什么",
        paragraphs: [
          "我们呈现三类公开数据:超级投资者的 SEC 13F 持仓与跨基金共识、单只股票的估值框架,以及宏观流动性背景(资金面、供给面、政策面)。",
          "目标是把专业投资者关注的信息,用普通投资者也能读懂的方式整理出来,作为学习与研究的起点。",
        ],
      },
      {
        heading: "我们不做什么",
        paragraphs: [
          "我们不荐股,不提供买卖点或目标价,也不提供任何个性化的投资、法律、会计或税务建议。本站所有内容仅供信息与教育之用。",
          "我们不管理资金、不收取代客理财费用,也不会因为你买卖任何证券而获益。任何投资决策都应基于你自己的独立判断,并在必要时咨询持牌专业人士。",
        ],
      },
      {
        heading: "我们的理念",
        paragraphs: [
          "我们忠于复利与价值投资的长期主义传统——本杰明·格雷厄姆的安全边际,以及沃伦·巴菲特对优秀企业、合理价格与耐心持有的坚持。",
          "我们相信:理解一门生意,远比预测一个价格更重要;而长期复利,来自纪律而非投机。",
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
      "Compounder (thecompounder.fyi) is an educational and research tool for value investors. We turn data scattered across regulatory filings into a clear, readable form — to help you think independently, not to decide for you.",
    sections: [
      {
        heading: "What We Do",
        paragraphs: [
          "We surface three kinds of public data: superinvestors' SEC 13F holdings and cross-fund consensus, valuation frameworks for individual stocks, and the macro-liquidity backdrop (funding, supply, and policy).",
          "The goal is to organize the information professional investors watch into a form ordinary investors can read — a starting point for learning and research.",
        ],
      },
      {
        heading: "What We Don't Do",
        paragraphs: [
          "We do not recommend stocks, give buy/sell calls or price targets, or provide any personalized investment, legal, accounting, or tax advice. Everything on the Site is for informational and educational purposes only.",
          "We do not manage money, charge advisory fees, or profit from any security you buy or sell. Every investment decision should rest on your own independent judgment and, where appropriate, the advice of a licensed professional.",
        ],
      },
      {
        heading: "Our Philosophy",
        paragraphs: [
          "We are faithful to the long-term tradition of compounding and value investing — Benjamin Graham's margin of safety, and Warren Buffett's insistence on great businesses, fair prices, and patient holding.",
          "We believe understanding a business matters far more than forecasting a price, and that long-term compounding comes from discipline, not speculation.",
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
