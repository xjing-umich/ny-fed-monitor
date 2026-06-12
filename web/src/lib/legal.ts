import type { Lang } from "@/lib/nav";

// Legal page content, bilingual. These are well-structured templates suitable
// for a data-aggregation / educational site; have counsel review before relying
// on them. Update LAST_UPDATED when the substance changes.

export const LAST_UPDATED = "2026-06-06";

export interface LegalSection {
  heading: string;
  paragraphs: string[];
}

export interface LegalDoc {
  title: string;
  intro: string;
  sections: LegalSection[];
}

export type LegalSlug = "disclaimer" | "terms" | "privacy";

const CONTENT: Record<LegalSlug, Record<Lang, LegalDoc>> = {
  disclaimer: {
    zh: {
      title: "免责声明",
      intro:
        "Compounder(thecompounder.fyi,下称“本站”)是一个面向价值投资的教育与研究工具。请在使用前仔细阅读以下声明。",
      sections: [
        {
          heading: "非投资建议",
          paragraphs: [
            "本站提供的所有内容,包括 13F 持仓、估值框架及任何衍生分析,仅供信息与教育之用,不构成、也不应被理解为投资建议、要约、招揽或任何买卖证券的推荐。",
            "本站不提供个性化的投资、法律、会计或税务意见。任何投资决策应基于你自己的独立判断,并在必要时咨询持牌专业人士。",
          ],
        },
        {
          heading: "数据来源与准确性",
          paragraphs: [
            "本站数据来源于公开渠道,主要为美国证券交易委员会 EDGAR 系统(13F 等监管申报)。数据可能存在延迟、口径差异或第三方录入错误。",
            "13F 申报本身具有滞后性(通常在季度结束后最多 45 天披露),反映的是过去某一时点的持仓,不代表当前或未来的实际仓位。本站不保证任何数据的准确性、完整性或时效性。",
          ],
        },
        {
          heading: "与监管机构无隶属关系",
          paragraphs: [
            "本站与美国证券交易委员会(SEC)、EDGAR 系统或任何政府机构均无任何隶属、授权或背书关系。所有引用的数据归原始来源所有。",
          ],
        },
        {
          heading: "风险提示",
          paragraphs: [
            "证券投资涉及风险,可能导致本金损失。历史表现不代表未来结果。任何投资者跟随本站所示持仓或分析进行操作所产生的盈亏,概由其本人承担。",
          ],
        },
      ],
    },
    en: {
      title: "Disclaimer",
      intro:
        "Compounder (thecompounder.fyi, the “Site”) is an educational and research tool for value investors. Please read this disclaimer carefully before using the Site.",
      sections: [
        {
          heading: "Not Investment Advice",
          paragraphs: [
            "All content on the Site — including 13F holdings, valuation frameworks, and any derived analysis — is provided for informational and educational purposes only. It does not constitute, and must not be construed as, investment advice, an offer, a solicitation, or a recommendation to buy or sell any security.",
            "The Site does not provide personalized investment, legal, accounting, or tax advice. Any investment decision should be based on your own independent judgment and, where appropriate, the advice of a licensed professional.",
          ],
        },
        {
          heading: "Data Sources & Accuracy",
          paragraphs: [
            "Data on the Site is sourced from public channels, primarily the U.S. Securities and Exchange Commission's EDGAR system (13F and other regulatory filings). Data may be delayed, defined differently across sources, or contain third-party entry errors.",
            "13F filings are inherently lagging (typically disclosed up to 45 days after quarter-end) and reflect holdings as of a past point in time — they do not represent current or future positions. The Site makes no warranty as to the accuracy, completeness, or timeliness of any data.",
          ],
        },
        {
          heading: "No Affiliation with Regulators",
          paragraphs: [
            "The Site is not affiliated with, authorized by, or endorsed by the U.S. Securities and Exchange Commission (SEC), the EDGAR system, or any government agency. All referenced data remains the property of its original source.",
          ],
        },
        {
          heading: "Risk Notice",
          paragraphs: [
            "Investing in securities involves risk, including possible loss of principal. Past performance is not indicative of future results. Any gains or losses arising from acting on holdings or analysis shown on the Site are borne solely by the user.",
          ],
        },
      ],
    },
  },
  terms: {
    zh: {
      title: "使用条款",
      intro: "使用本站即表示你同意以下条款。若不同意,请停止使用本站。",
      sections: [
        {
          heading: "按现状提供",
          paragraphs: [
            "本站及其全部内容按“现状”和“现有”基础提供,不附带任何明示或暗示的担保,包括但不限于适销性、特定用途适用性及不侵权的担保。",
          ],
        },
        {
          heading: "责任限制",
          paragraphs: [
            "在适用法律允许的最大范围内,本站及其运营者不对因使用或无法使用本站而产生的任何直接、间接、附带、后果性或惩罚性损失承担责任,包括因依赖任何数据或分析而造成的投资损失。",
          ],
        },
        {
          heading: "知识产权",
          paragraphs: [
            "本站的设计、文案、原创分析与代码归本站所有。引用的第三方数据归其原始来源所有。未经许可,不得对本站内容进行系统性抓取、转售或商业再分发。",
          ],
        },
        {
          heading: "条款变更",
          paragraphs: [
            "本站可不时更新本条款。继续使用本站即视为接受更新后的条款。",
          ],
        },
      ],
    },
    en: {
      title: "Terms of Service",
      intro:
        "By using the Site, you agree to these terms. If you do not agree, please discontinue use of the Site.",
      sections: [
        {
          heading: "Provided “As Is”",
          paragraphs: [
            "The Site and all of its content are provided on an “as is” and “as available” basis, without warranties of any kind, express or implied, including but not limited to warranties of merchantability, fitness for a particular purpose, and non-infringement.",
          ],
        },
        {
          heading: "Limitation of Liability",
          paragraphs: [
            "To the maximum extent permitted by law, the Site and its operators shall not be liable for any direct, indirect, incidental, consequential, or punitive damages arising from your use of, or inability to use, the Site — including investment losses resulting from reliance on any data or analysis.",
          ],
        },
        {
          heading: "Intellectual Property",
          paragraphs: [
            "The design, copy, original analysis, and code of the Site belong to the Site. Referenced third-party data remains the property of its original source. Systematic scraping, resale, or commercial redistribution of the Site's content is prohibited without permission.",
          ],
        },
        {
          heading: "Changes to These Terms",
          paragraphs: [
            "The Site may update these terms from time to time. Continued use of the Site constitutes acceptance of the updated terms.",
          ],
        },
      ],
    },
  },
  privacy: {
    zh: {
      title: "隐私政策",
      intro: "本政策说明本站收集哪些信息、如何使用,以及涉及的第三方处理者。",
      sections: [
        {
          heading: "我们收集的信息",
          paragraphs: [
            "邮件订阅:当你订阅更新时,我们收集你提供的邮箱地址,用于发送 newsletter。订阅记录存储于邮件服务商 Resend。",
            "联系表单:当你通过联系表单留言时,我们收集你提供的称呼、邮箱与留言内容,仅用于回复你的咨询。",
            "使用分析:本站使用 Vercel Analytics 与 Speed Insights 收集匿名、聚合的访问与性能数据,不用于识别个人身份。",
          ],
        },
        {
          heading: "第三方处理者",
          paragraphs: [
            "我们依赖以下服务商处理上述数据:Resend(邮件发送与订阅名单)、Vercel(托管与匿名分析)。这些服务商各自的隐私政策约束其数据处理行为。",
          ],
        },
        {
          heading: "Cookie",
          paragraphs: [
            "本站使用必要的功能性存储(如主题与语言偏好)。分析工具可能使用匿名标识。本站不投放第三方广告 Cookie。",
          ],
        },
        {
          heading: "你的选择",
          paragraphs: [
            "你可随时通过 newsletter 邮件中的退订链接取消订阅。如需删除我们持有的你的联系数据,请通过联系表单与我们联系。",
          ],
        },
      ],
    },
    en: {
      title: "Privacy Policy",
      intro:
        "This policy explains what information the Site collects, how it is used, and which third-party processors are involved.",
      sections: [
        {
          heading: "Information We Collect",
          paragraphs: [
            "Newsletter: When you subscribe to updates, we collect the email address you provide in order to send the newsletter. Subscriptions are stored with our email provider, Resend.",
            "Contact form: When you message us via the contact form, we collect the name, email, and message you provide, solely to respond to your inquiry.",
            "Usage analytics: The Site uses Vercel Analytics and Speed Insights to collect anonymous, aggregated traffic and performance data. This is not used to identify individuals.",
          ],
        },
        {
          heading: "Third-Party Processors",
          paragraphs: [
            "We rely on the following providers to process the data above: Resend (email delivery and subscription lists) and Vercel (hosting and anonymous analytics). Each provider's own privacy policy governs its handling of data.",
          ],
        },
        {
          heading: "Cookies",
          paragraphs: [
            "The Site uses necessary functional storage (such as theme and language preferences). Analytics tools may use anonymous identifiers. The Site does not serve third-party advertising cookies.",
          ],
        },
        {
          heading: "Your Choices",
          paragraphs: [
            "You can unsubscribe at any time via the link in any newsletter email. To request deletion of contact data we hold about you, reach us through the contact form.",
          ],
        },
      ],
    },
  },
};

export function getLegalDoc(slug: LegalSlug, lang: Lang): LegalDoc {
  return CONTENT[slug][lang];
}
