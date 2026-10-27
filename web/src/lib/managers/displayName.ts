import type { Lang } from "@/lib/nav";
import { managerZhName } from "@/lib/aliases/config";

// 投资人在页面上的展示名。库里的 person 是英文名,也是 slug/搜索/别名的锚,不改;这里只管怎么显示。
// 1. 中文站显示中文名(段永平、李录、巴菲特……),没有公认中文名的显示英文名。
// 2. 掌管人已经变了的申报主体单独改写,不能再把新一季的持仓记在原来那个人名下:
//    - 伯克希尔:Greg Abel 2026-01-01 起任 CEO 并主导调仓,巴菲特任董事长;
//    - Daily Journal:建立组合的芒格 2023-11-28 去世,之后的申报不是他的决定。

type Stewardship = {
  /** 列表、持有人表、H1 等处的展示名。 */
  label: Record<Lang, string>;
  /** <title> 里"…持仓组合"前的那段(要带上搜索用户找的人名)。 */
  titleName: Record<Lang, string>;
  /** 副标题:取代"由 X 掌管"。 */
  managedBy: Record<Lang, string>;
  /** 结构化数据:申报主体作 Organization,相关的人作 employee/附注。 */
  people?: { name: string; zh?: string; jobTitle: string }[];
};

const STEWARDSHIP: Record<string, Stewardship> = {
  "berkshire-hathaway": {
    // 中文用"与"不用顿号:持有人名单按"、"分隔,"巴菲特、阿贝尔"会被读成两位持有人。
    label: { en: "Warren Buffett & Greg Abel", zh: "巴菲特与阿贝尔" },
    titleName: { en: "Berkshire Hathaway (Buffett & Abel) Portfolio", zh: "伯克希尔（巴菲特与阿贝尔）持仓组合" },
    managedBy: {
      en: "run by CEO Greg Abel since January 2026, with Warren Buffett as chairman",
      zh: "2026 年 1 月起由 CEO 阿贝尔（Greg Abel）掌管，巴菲特任董事长",
    },
    people: [
      { name: "Greg Abel", zh: "阿贝尔", jobTitle: "CEO" },
      { name: "Warren Buffett", zh: "巴菲特", jobTitle: "Chairman" },
    ],
  },
  "daily-journal": {
    label: { en: "Daily Journal", zh: "Daily Journal" },
    titleName: { en: "Daily Journal (Charlie Munger's former portfolio)", zh: "Daily Journal（芒格生前的组合）" },
    managedBy: {
      en: "the portfolio Charlie Munger built; Munger died in November 2023, so later filings are not his decisions",
      zh: "芒格生前建立的组合；芒格已于 2023 年 11 月去世，之后的申报不是他的决定",
    },
  },
};

// 库里 person 本身就是机构名的申报主体:结构化数据用 Organization,不当成一个人。
const ORG_NAMED = new Set(["dodge-and-cox", "polen-capital", "ruane-cunniff", "tweedy-browne"]);

// 中文名过于笼统时的改写("红杉"在中文里更常指红杉资本)。
const ZH_LABEL_OVERRIDES: Record<string, string> = { "ruane-cunniff": "红杉基金" };

// 英文名带逗号的改写:持有人名单按逗号分隔,"Ruane, Cunniff (Sequoia)" 会被读成两位持有人。
const EN_LABEL_OVERRIDES: Record<string, string> = {
  "ruane-cunniff": "Ruane Cunniff (Sequoia Fund)",
  "tweedy-browne": "Tweedy Browne",
};

export function managerLabel(lang: Lang, slug: string, person: string): string {
  const s = STEWARDSHIP[slug];
  if (s) return s.label[lang];
  const en = EN_LABEL_OVERRIDES[slug] ?? person;
  if (lang === "zh") return ZH_LABEL_OVERRIDES[slug] ?? managerZhName(slug, person) ?? en;
  return en;
}

/** 中文页标题、副标题用:有中文名时写成「中文名（English）」,否则就是英文名。括号里的英文名去掉自带的括注,免得括号套括号。 */
function zhWithEnglish(slug: string, person: string): string {
  const en = managerLabel("en", slug, person);
  const zh = managerLabel("zh", slug, person);
  return zh === en ? en : `${zh}（${en.replace(/\s*\(.*\)$/, "")}）`;
}

export function managerTitleName(lang: Lang, slug: string, person: string): string {
  const s = STEWARDSHIP[slug];
  if (s) return s.titleName[lang];
  if (lang === "en") return `${managerLabel("en", slug, person)} Portfolio`;
  const name = zhWithEnglish(slug, person);
  // 全角括号后不留空格:"段永平（Duan Yongping）持仓组合";英文名后照常空一格。
  return name.endsWith("）") ? `${name}持仓组合` : `${name} 持仓组合`;
}

export function managerSubtitle(lang: Lang, slug: string, person: string, fund: string): string {
  const s = STEWARDSHIP[slug];
  if (s) {
    return lang === "zh"
      ? `${fund} — ${s.managedBy.zh}；美股持仓通过 SEC 13F 季度披露`
      : `${fund} — ${s.managedBy.en}; US equity positions disclosed quarterly via SEC 13F`;
  }
  if (lang === "en") return `${fund} — managed by ${managerLabel("en", slug, person)}; US equity positions disclosed quarterly via SEC 13F`;
  const name = zhWithEnglish(slug, person);
  return `${fund} — ${name}${name.endsWith("）") ? "" : " "}掌管，美股持仓通过 SEC 13F 季度披露`;
}

export function managerIsOrganization(slug: string): boolean {
  return ORG_NAMED.has(slug) || slug in STEWARDSHIP;
}

export function managerStewardPeople(slug: string): { name: string; zh?: string; jobTitle: string }[] {
  return STEWARDSHIP[slug]?.people ?? [];
}
