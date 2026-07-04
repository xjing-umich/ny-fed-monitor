import type { Lang } from "@/lib/nav";

// Footer copy, bilingual. Kept separate from layout so the Footer component
// stays a thin presentational shell.

export interface FooterCopy {
  explore: string;
  legal: string;
  support: string;
  newsletter: string;
  newsletterBlurb: string;
  emailPlaceholder: string;
  subscribe: string;
  subscribing: string;
  subscribed: string;
  subscribeError: string;
  contact: string;
  about: string;
  rights: string;
  notAffiliated: string;
  noAdvice: string;
  backToTop: string;
}

export function footerCopy(lang: Lang): FooterCopy {
  return lang === "zh"
    ? {
        explore: "浏览",
        legal: "条款",
        support: "支持",
        newsletter: "订阅更新",
        newsletterBlurb: "新一季 13F 异动与估值更新，发到你的邮箱。",
        emailPlaceholder: "你的邮箱",
        subscribe: "订阅",
        subscribing: "提交中…",
        subscribed: "已订阅,谢谢!",
        subscribeError: "订阅失败,请稍后再试。",
        contact: "联系我们",
        about: "关于",
        rights: "保留所有权利。",
        notAffiliated: "与美国证券交易委员会(SEC)或 EDGAR 系统无任何隶属关系。",
        noAdvice: "不构成投资建议。",
        backToTop: "回到顶部",
      }
    : {
        explore: "Explore",
        legal: "Legal",
        support: "Support",
        newsletter: "Stay Updated",
        newsletterBlurb: "New-quarter 13F moves and valuation updates, to your inbox.",
        emailPlaceholder: "Your email",
        subscribe: "Subscribe",
        subscribing: "Submitting…",
        subscribed: "Subscribed, thanks!",
        subscribeError: "Subscription failed. Please try again.",
        contact: "Contact Us",
        about: "About",
        rights: "All rights reserved.",
        notAffiliated: "Not affiliated with the U.S. S.E.C. or the EDGAR System.",
        noAdvice: "Not investment advice.",
        backToTop: "Back to top",
      };
}

// Legal links shown in the footer + their route slugs.
export const LEGAL_LINKS: { slug: string; zh: string; en: string }[] = [
  { slug: "disclaimer", zh: "免责声明", en: "Disclaimer" },
  { slug: "terms", zh: "使用条款", en: "Terms of Service" },
  { slug: "privacy", zh: "隐私政策", en: "Privacy Policy" },
];
