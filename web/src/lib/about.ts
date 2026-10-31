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
      "Compounder（复利，thecompounder.fyi）是一个面向价值投资者的财经教育与研究工具。很多有用的数据埋在监管申报里，我们把它们集中到一处、整理得能读，剩下的思考留给你自己。",
    sections: [
      {
        heading: "我们做什么",
        paragraphs: [
          "我们整理超级投资者公开披露的持仓，并用财报、股价和利率数据估算个股价值。估值由本站模型计算，不是监管机构发布的数据。",
          "想法是把专业投资者会留意的信息，整理成普通人也读得懂的样子。它是你做研究的起点，不是终点。",
        ],
      },
      {
        heading: "我们不做什么",
        paragraphs: [
          "我们不荐股，不设目标价，不喊买卖，也不提供任何个性化的投资、法律、会计或税务建议。这里的一切只供信息和教育用途。",
          "我们不管钱，不收代客理财的费用，你买卖任何证券我们也不从中获利。钱怎么用是你自己的决定；真要听建议，该问的是持牌的专业人士。",
        ],
      },
      {
        heading: "我们的理念",
        paragraphs: [
          "我们出自价值投资这一脉：本杰明·格雷厄姆的安全边际，以及沃伦·巴菲特那种偏好——以合理价格买好生意，然后耐心拿着。",
          "我们的偏向是：把一门生意搞懂，比猜它价格下一步往哪走更值钱；复利奖励的是纪律，不是投机。",
        ],
      },
      {
        heading: "数据与来源",
        paragraphs: [
          "持仓来自 SEC EDGAR 的13F申报；财务数据来自 SEC XBRL 财报；股价默认取自 Yahoo Finance，必要时使用东方财富；美国国债收益率来自 FRED。各项数据的报告期、价格日期和具体来源以相应页面标注为准。",
          "13F披露的是季末时点、纳入申报范围的证券持仓。等你读到申报时，仓位可能已过去数周甚至数月，此后也可能发生变化。详见我们的免责声明。",
        ],
      },
      {
        heading: "联系我们",
        paragraphs: [
          "有反馈、纠错或合作意向？欢迎通过页脚的「联系我们」表单与我们联系。",
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
        heading: "What we do",
        paragraphs: [
          "We organize superinvestors' disclosed holdings and estimate stock values using financial statements, prices, and interest rates. Valuations are estimates from our own models, not data published by a regulator.",
          "The idea is to take the information professional investors pay attention to and put it in a form anyone can read. It's a place to start your own research, not a finish line.",
        ],
      },
      {
        heading: "What we don't do",
        paragraphs: [
          "We don't recommend stocks, set price targets, or call buys and sells, and we don't give personalized investment, legal, accounting, or tax advice. Everything here is for information and education only.",
          "We don't manage money, charge advisory fees, or make anything when you buy or sell a security. What you do with your money is your decision, and a licensed professional is the right person to ask when you need real advice.",
        ],
      },
      {
        heading: "Our philosophy",
        paragraphs: [
          "We come out of the value-investing tradition: Benjamin Graham's margin of safety, and Warren Buffett's preference for good businesses bought at fair prices and held patiently.",
          "Our bias is that understanding a business is worth more than guessing where its price goes next, and that compounding rewards discipline rather than speculation.",
        ],
      },
      {
        heading: "Data and sources",
        paragraphs: [
          "Holdings come from SEC EDGAR 13F filings; financials come from SEC XBRL filings; prices use Yahoo Finance, with Eastmoney as a fallback; and U.S. Treasury yields come from FRED. See each page for the reporting period, price date, and specific source.",
          "A 13F shows reportable securities held at quarter-end. By the time you read it, the positions may be weeks or months old and may have changed. See our Disclaimer for details.",
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
