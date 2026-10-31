import Link from "next/link";
import type { Lang } from "@/lib/nav";
import type { SearchIndex } from "@/lib/home/searchIndex";
import type { CompanyExample } from "@/lib/home/companyExample";
import { localePath } from "@/lib/urls";
import {
  effectiveFilingDeadline,
  quarterLabel,
  type EffectiveMovesPeriod,
} from "@/lib/freshness/derive";
import { filingProgressText } from "@/components/home/filingProgressText";
import NewsletterForm from "@/components/shell/NewsletterForm";
import LandingSearch from "./LandingSearch";
import CompanyExamples, { CompanyMark } from "./CompanyExamples";
import s from "./landing.module.css";

function ResearchMap({ lang }: { lang: Lang }) {
  const zh = lang === "zh";
  return (
    <div
      className={s.heroVisual}
      role="img"
      aria-label={
        zh
          ? "功能示意：从公开持仓和公司财报，理解价格与价值。"
          : "Feature illustration: use public holdings and financial filings to understand price and value."
      }
    >
      <div className={s.mapLabels}>
        <span>{zh ? "公开证据" : "PUBLIC EVIDENCE"}</span>
        <span>{zh ? "公司研究" : "COMPANY RESEARCH"}</span>
      </div>
      <div className={s.researchMap}>
        <div className={s.mapSources}>
          {[
            [zh ? "公开持仓" : "Public holdings", "SEC 13F"],
            [zh ? "公司财报" : "Financial filings", "10-K · 10-Q"],
          ].map(([title, source]) => (
            <div className={s.sourceDoc} key={source}>
              <svg className={s.docIcon} viewBox="0 0 32 40" aria-hidden>
                <path d="M5 2h15l7 8v28H5Z" fill="currentColor" />
                <path
                  d="M10 17h12M10 23h12M10 29h8"
                  stroke="#355b8d"
                  strokeWidth="1.5"
                />
              </svg>
              <div>
                <strong>{title}</strong>
                <small>{source}</small>
                <i />
                <i />
              </div>
            </div>
          ))}
        </div>
        <svg
          className={s.mapMerge}
          viewBox="0 0 58 220"
          preserveAspectRatio="none"
          aria-hidden
        >
          <path
            d="M0 30C42 30 12 110 58 110M0 190C42 190 12 110 58 110"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.1"
            vectorEffect="non-scaling-stroke"
          />
        </svg>
        <div className={s.mapCompany}>
          <div className={s.companyDisc}>
            <CompanyMark ticker="AAPL" />
          </div>
          <strong>{zh ? "苹果" : "Apple"}</strong>
          <span>AAPL</span>
        </div>
        <svg className={s.mapArrow} viewBox="0 0 40 24" aria-hidden>
          <path
            d="M0 12h36m-5-5 6 5-6 5"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.2"
          />
        </svg>
        <div className={s.mapValue}>
          <strong>{zh ? "价格与价值" : "Price & value"}</strong>
          <div className={s.conceptScale} aria-hidden>
            <span className={s.conceptRange} />
            <span className={s.conceptPrice} />
          </div>
          <span className={s.conceptCaption}>
            {zh ? "模型区间" : "Model range"}
          </span>
          <small>{zh ? "功能示意" : "Feature illustration"}</small>
        </div>
      </div>
      <p className={s.mapPrinciple}>
        {zh
          ? "公开事实 · 保守假设 · 长期视角"
          : "Public facts · Conservative assumptions · A long view"}
      </p>
    </div>
  );
}
export default function LandingPage({
  lang,
  index,
  examples,
  filing,
}: {
  lang: Lang;
  index: SearchIndex;
  examples: CompanyExample[];
  filing: EffectiveMovesPeriod;
}) {
  const zh = lang === "zh";
  const arriving =
    filing.reason === "before_deadline" || filing.reason === "low_coverage";
  const deadline = effectiveFilingDeadline(filing.maxPeriod);
  const date = deadline
    ? new Intl.DateTimeFormat(zh ? "zh-CN" : "en-US", {
        timeZone: "UTC",
        month: zh ? "numeric" : "short",
        day: "numeric",
      }).format(deadline)
    : "";
  const progress = arriving
    ? filingProgressText(
        lang,
        quarterLabel(filing.maxPeriod, lang),
        filing.coverage,
        date,
      )
    : null;
  const q = quarterLabel(arriving ? filing.maxPeriod : filing.period, lang);
  const compactProgress = arriving
    ? zh
      ? `${q} 申报中 · ${filing.coverage.filed}/${filing.coverage.total} 已披露`
      : `${q} filing season · ${filing.coverage.filed}/${filing.coverage.total} reported`
    : null;
  const details = zh
    ? [
        [
          "13F",
          "公开持仓告诉了我们什么？",
          "13F 反映机构在申报期末的证券持有情况，并非实时交易记录。它提供研究线索；混合季度和披露进度会明确标注。",
          "/learn/how-to-read-a-13f",
          "如何读懂 13F ↗",
        ],
        [
          "↔",
          "为什么用估值区间？",
          "财报事实和模型假设共同决定估值。区间表达不同假设下的结果；上沿不是价格的绝对上限。证据不足时保留待确认或不可评估状态。",
          "/learn/what-is-intrinsic-value",
          "理解内在价值 ↗",
        ],
        [
          "◷",
          "不同日期，分开说明。",
          "持仓日期、财报期末和报价日期含义不同。每一组事实都保留自己的时间口径，帮助你判断它是否适合当前的研究。",
          "/stocks",
          "查看个股与数据来源 ↗",
        ],
      ]
    : [
        [
          "13F",
          "What can public holdings tell us?",
          "13F filings show securities held at quarter end, rather than a live trade record. They offer a research lead. Mixed reporting quarters and filing progress are labeled.",
          "/learn/how-to-read-a-13f",
          "How to read a 13F ↗",
        ],
        [
          "↔",
          "Why a valuation range?",
          "Financial facts and model assumptions shape a valuation. A range shows different assumptions; its upper end is not an absolute price ceiling. Incomplete evidence stays pending or unavailable.",
          "/learn/what-is-intrinsic-value",
          "Understand intrinsic value ↗",
        ],
        [
          "◷",
          "Different dates, clearly explained.",
          "A holdings date, financial period and quote date mean different things. Each set of facts keeps its own date so you can assess its relevance to your research.",
          "/stocks",
          "Explore stocks & data sources ↗",
        ],
      ];
  return (
    <div className={s.landingPage}>
      <section className={s.hero} aria-labelledby="landing-title">
        <div className={s.heroPaint} aria-hidden />
        <div className={`${s.heroInner} ${s.wrap}`}>
          <div className={s.heroCopy}>
            <p className={s.heroKicker}>
              {zh
                ? "13F 季度持仓 × 公司估值"
                : "QUARTERLY 13F HOLDINGS × COMPANY VALUATION"}
            </p>
            <h1 id="landing-title">
              <span>{zh ? "查机构持仓，" : "Explore holdings."}</span>
              <span>{zh ? "搜索公司估值。" : "Search company value."}</span>
            </h1>
            <p className={s.heroSub}>
              {zh
                ? "从公开证据出发，形成自己的判断。"
                : "Start with public evidence. Form your own view."}
            </p>
            <LandingSearch lang={lang} index={index} />
            <div className={s.queryExamples}>
              <span>{zh ? "试着查" : "Try"}</span>
              {examples
                .filter((e) => e.available && e.ticker !== "BRK.B")
                .slice(0, 2)
                .map((e) => (
                  <Link
                    key={e.ticker}
                    href={localePath(lang, "/stocks/" + e.ticker)}
                  >
                    {e.ticker === "AAPL"
                      ? zh
                        ? "苹果"
                        : "Apple"
                      : zh
                        ? "微软"
                        : "Microsoft"}{" "}
                    <span className={s.ticker}>{e.ticker}</span> ↗
                  </Link>
                ))}
              <Link href={localePath(lang, "/investors/berkshire-hathaway")}>
                {zh ? "巴菲特与阿贝尔" : "Buffett & Abel"}
              </Link>
            </div>
            <p className={s.heroHelper}>
              {zh
                ? "13F 是机构按季度披露的持仓。先从你熟悉的名字开始。"
                : "13F filings disclose institutional holdings each quarter. Start with a name you know."}
            </p>
          </div>
          <ResearchMap lang={lang} />
        </div>
        <div className={`${s.heroBottom} ${s.wrap}`}>
          <span className={s.quietStatus}>
            <i />
            {compactProgress ??
              (filing.period
                ? zh
                  ? `${quarterLabel(filing.period, lang)} 持仓 · SEC EDGAR`
                  : `${quarterLabel(filing.period, lang)} holdings · SEC EDGAR`
                : zh
                  ? "公开持仓与估值研究"
                  : "Public holdings & valuation research")}
          </span>
          <a href="#company-example">
            {zh ? "用一个例子看清楚 ↓" : "See an example ↓"}
          </a>
        </div>
      </section>
      <CompanyExamples lang={lang} examples={examples} />
      <section
        className={`${s.evidenceSection} ${s.sectionSpace}`}
        aria-labelledby="landing-evidence"
      >
        <div className={`${s.evidenceInner} ${s.wrap}`}>
          <div className={s.evidenceCopy}>
            <p className={s.sectionLabel}>
              {zh ? "把依据放在判断旁边" : "KEEP THE EVIDENCE IN VIEW"}
            </p>
            <h2 id="landing-evidence">
              {zh
                ? "每个判断，都能回到证据。"
                : "Every judgment starts with evidence."}
            </h2>
            <p>
              {zh
                ? "用事实建立理解，保留对假设的审慎。复杂的部分，需要时再展开。"
                : "Build understanding from facts. Stay thoughtful about assumptions. Open the detail when you need it."}
            </p>
            <div className={s.evidenceSignature}>
              <span className={s.signatureLine} />
              <span>
                {zh
                  ? "有来源，有日期，也有不确定性。"
                  : "A source. A date. Room for uncertainty."}
              </span>
            </div>
          </div>
          <div className={s.evidenceDetails}>
            {details.map(([mark, title, body, path, label]) => (
              <details key={path + mark}>
                <summary>
                  <span className={s.evidenceNumber} aria-hidden>
                    {mark}
                  </span>
                  <span>{title}</span>
                  <span className={s.expandIcon} aria-hidden>
                    ＋
                  </span>
                </summary>
                <div>
                  <p>{body}</p>
                  <Link className={s.textLink} href={localePath(lang, path)}>
                    {label}
                  </Link>
                </div>
              </details>
            ))}
          </div>
        </div>
      </section>
      <section className={s.seasonSection} aria-labelledby="landing-season">
        <div className={`${s.seasonInner} ${s.wrap}`}>
          <div className={s.seasonQuarter}>
            <strong>{q || "13F"}</strong>
            <span className={s.seasonStatus}>
              {arriving
                ? zh
                  ? "申报进行中"
                  : "Filing in progress"
                : zh
                  ? "季度持仓"
                  : "Quarterly holdings"}
            </span>
          </div>
          <div className={s.seasonCopy}>
            <p className={s.sectionLabel}>
              {zh ? "让事实随季度累积" : "LET THE FACTS ACCUMULATE"}
            </p>
            <h2 id="landing-season">
              {zh ? "每一季，再看一次。" : "A fresh look, every quarter."}
            </h2>
            <p>
              {zh
                ? "谁改变了持仓，哪些判断需要重看。跟踪已经披露的变化，再回到公司本身。"
                : "See whose holdings changed and which assumptions deserve another look. Follow reported changes, then return to the business."}
            </p>
            {progress && (
              <div className={s.seasonProgress}>
                <span>{progress}</span>
                <span className={s.progressTrack} aria-hidden>
                  <i
                    style={{
                      width: `${filing.coverage.total > 0 ? Math.min(100, (filing.coverage.filed / filing.coverage.total) * 100) : 0}%`,
                    }}
                  />
                </span>
              </div>
            )}
            <p className={s.sourceNote}>
              {filing.period
                ? zh
                  ? `统计以 ${quarterLabel(filing.period, lang)} 为主；各投资人的实际申报期单独标注。来源 SEC EDGAR。`
                  : `Statistics primarily reflect ${quarterLabel(filing.period, lang)}; individual reporting periods are labeled. Source: SEC EDGAR.`
                : zh
                  ? "暂无可确认的统计季度。各投资人页面保留实际申报期。"
                  : "A statistics quarter is not confirmed. Individual profiles retain their actual reporting periods."}
            </p>
            <Link className={s.textLink} href={localePath(lang, "/investors")}>
              {zh
                ? "查看投资人的公开持仓 ↗"
                : "Explore investors’ public holdings ↗"}
            </Link>
          </div>
        </div>
      </section>
      <section
        className={`${s.newsletterSection} ${s.sectionSpace} ${s.wrap}`}
        aria-labelledby="landing-newsletter"
      >
        <div>
          <p className={s.sectionLabel}>
            {zh ? "留一点空间，给长期" : "MAKE ROOM FOR THE LONG VIEW"}
          </p>
          <h2 id="landing-newsletter">
            {zh ? "把视角拉长一点。" : "Take a longer view."}
          </h2>
          <p>
            {zh
              ? "每季申报截止后，一封季度更新。用公开事实，重新检查旧判断。"
              : "One quarterly update after the filing deadline. Revisit old judgments with public facts."}
          </p>
        </div>
        <div className={s.newsletterForm}>
          <p>{zh ? "接收季度更新" : "Get the quarterly update"}</p>
          <NewsletterForm lang={lang} source="landing" />
        </div>
      </section>
    </div>
  );
}
