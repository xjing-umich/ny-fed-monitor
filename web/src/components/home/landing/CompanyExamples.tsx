"use client";
import { useId, useRef, useState } from "react";
import Link from "next/link";
import type { Lang } from "@/lib/nav";
import type { CompanyExample } from "@/lib/home/companyExample";
import {
  formatUSD,
  fmtPrice,
  fmtPerShareValue,
  fmtValueBand,
} from "@/lib/format";
import { stockPath, investorPath, localePath } from "@/lib/urls";
import { LinearValueAxis } from "@/components/stocks/LinearValueAxis";
import s from "./landing.module.css";

const names: Record<string, [string, string]> = {
  AAPL: ["苹果", "Apple"],
  MSFT: ["微软", "Microsoft"],
  "BRK.B": ["伯克希尔", "Berkshire"],
};
export function CompanyMark({ ticker }: { ticker: string }) {
  // Plain local vector marks; no remote image dependency or baked-in UI image.
  return ticker === "AAPL" ? (
    <svg viewBox="0 0 24 24" aria-hidden>
      <path
        fill="currentColor"
        d="M17.05 12.54c.03 3.03 2.66 4.04 2.69 4.05-.02.07-.42 1.44-1.38 2.85-.83 1.22-1.7 2.44-3.06 2.47-1.34.03-1.77-.8-3.3-.8-1.52 0-2 .78-3.27.83-1.31.05-2.3-1.32-3.14-2.54-1.71-2.48-3.01-7.02-1.25-10.09.87-1.52 2.43-2.49 4.13-2.52 1.29-.02 2.51.88 3.3.88.8 0 2.28-1.09 3.84-.93.65.03 2.48.26 3.65 1.97-.1.06-2.18 1.27-2.21 3.83ZM14.55 5.1c.7-.85 1.18-2.03 1.05-3.2-1.01.04-2.24.67-2.97 1.52-.65.75-1.23 1.95-1.08 3.1 1.13.09 2.29-.58 3-1.42Z"
      />
    </svg>
  ) : ticker === "MSFT" ? (
    <span className={s.msMark} aria-hidden>
      <i />
      <i />
      <i />
      <i />
    </span>
  ) : (
    <span aria-hidden>B</span>
  );
}
export default function CompanyExamples({
  lang,
  examples,
}: {
  lang: Lang;
  examples: CompanyExample[];
}) {
  const [selected, setSelected] = useState(0);
  const tabs = useRef<(HTMLButtonElement | null)[]>([]);
  const id = useId();
  const zh = lang === "zh";
  const row = examples[selected];
  if (!row) return null;
  const model = row.summary;
  return (
    <section
      id="company-example"
      className={`${s.companySection} ${s.sectionSpace} ${s.wrap}`}
      aria-labelledby={id + "-title"}
    >
      <div className={s.sectionHeading}>
        <div>
          <p className={s.sectionLabel}>
            {zh ? "从你熟悉的公司开始" : "START WITH A COMPANY YOU KNOW"}
          </p>
          <h2 id={id + "-title"}>
            {zh
              ? "同一家公司，两种研究视角。"
              : "One company. Two research perspectives."}
          </h2>
        </div>
        <div
          role="tablist"
          className={s.caseTabs}
          aria-label={zh ? "公司案例" : "Company examples"}
        >
          {examples.map((e, i) => (
            <button
              key={e.ticker}
              ref={(n) => {
                tabs.current[i] = n;
              }}
              type="button"
              role="tab"
              id={id + "-tab-" + i}
              aria-selected={selected === i}
              aria-controls={id + "-panel"}
              tabIndex={selected === i ? 0 : -1}
              onClick={() => setSelected(i)}
              onKeyDown={(ev) => {
                const next =
                  ev.key === "ArrowRight"
                    ? (i + 1) % examples.length
                    : ev.key === "ArrowLeft"
                      ? (i - 1 + examples.length) % examples.length
                      : ev.key === "Home"
                        ? 0
                        : ev.key === "End"
                          ? examples.length - 1
                          : null;
                if (next !== null) {
                  ev.preventDefault();
                  setSelected(next);
                  tabs.current[next]?.focus();
                }
              }}
            >
              <span className={s.tabMark}>
                <CompanyMark ticker={e.ticker} />
              </span>
              {names[e.ticker]?.[zh ? 0 : 1] ?? e.ticker}
            </button>
          ))}
        </div>
      </div>
      <div
        role="tabpanel"
        tabIndex={0}
        id={id + "-panel"}
        aria-labelledby={id + "-tab-" + selected}
        className={s.companyPanel}
      >
        <div className={s.companyOverview}>
          <div className={s.companyIdentity}>
            <span className={s.companyBadge}>
              <CompanyMark ticker={row.ticker} />
            </span>
            <div>
              <p className={s.companySymbol}>{row.ticker}</p>
              <h3>{row.name}</h3>
            </div>
          </div>
          <p className={s.companyQuestion}>
            {zh ? "谁在持有它？" : "Who holds it?"}
          </p>
          <p className={s.holderCount}>
            {row.holderCount === null
              ? zh
                ? "持仓数据暂不可用"
                : "Holdings unavailable"
              : row.holderCount > 0
                ? zh
                  ? `${row.holderCount} 位跟踪投资人持有`
                  : `${row.holderCount} tracked investors hold it`
                : zh
                  ? "暂无可用的当前持仓"
                  : "No current holdings available"}
          </p>
          {row.totalValue != null && row.available && (
            <p>
              {zh ? "申报持仓合计 " : "Reported holdings total "}
              {formatUSD(row.totalValue, lang)}
            </p>
          )}
          <div className={s.holderLeaders}>
            {row.leaders.map((l) => (
              <Link key={l.slug} href={investorPath(lang, l.slug)}>
                {l.name} ↗
              </Link>
            ))}
          </div>
          <p className={s.sourceNote}>SEC EDGAR 13F · {row.holdingsNote}</p>
          <Link
            className={s.textLink}
            href={
              row.available
                ? stockPath(lang, row.ticker) + "#holders"
                : localePath(lang, "/stocks")
            }
          >
            {zh ? "查看完整公开持仓 ↗" : "Explore public holdings ↗"}
          </Link>
        </div>
        <div
          className={s.companyValue}
          data-position={model?.position ?? "pending"}
        >
          <p className={s.companyQuestion}>
            {zh
              ? "当前价格，处在什么位置？"
              : "Where does the current price stand?"}
          </p>
          {model ? (
            <>
              <div className={s.valueHeading}>
                <span className={s.valueDot} aria-hidden />
                <h3>{model.heading}</h3>
              </div>
              {model.gap && <p className={s.valueGap}>{model.gap}</p>}
              <dl className={s.valueMetrics}>
                <div>
                  <dt>{zh ? "最近收盘价" : "Latest close"}</dt>
                  <dd className={s.closePrice}>{fmtPrice(model.price)}</dd>
                  <dd className={s.sourceNote}>
                    <time dateTime={model.date}>{model.date}</time> ·{" "}
                    {model.source}
                  </dd>
                </div>
                <div>
                  <dt>{model.rangeLabel}</dt>
                  <dd>
                    {fmtValueBand(
                      model.rangeLo,
                      model.rangeHi,
                      fmtPerShareValue,
                    )}
                  </dd>
                  {model.reference != null && (
                    <dd className={s.sourceNote}>
                      {model.referenceLabel} {fmtPerShareValue(model.reference)}
                    </dd>
                  )}
                </div>
              </dl>
              <LinearValueAxis
                axis={model.axis}
                low={model.rangeLo}
                high={model.rangeHi}
                price={model.price}
                lang={lang}
              />
              <p className={s.estimateNote}>
                {zh
                  ? "区间来自模型假设，是估计值；上沿并非价格的绝对上限。"
                  : "The range is an estimate under model assumptions. Its upper end is not an absolute price ceiling."}
              </p>
            </>
          ) : (
            <>
              <h3 className={s.pendingHeading}>
                {zh ? "估值尚待确认" : "Valuation pending"}
              </h3>
              <p className={s.unavailable}>{row.unavailable}</p>
            </>
          )}
          {row.fundamentalsDate && (
            <p className={s.sourceNote}>
              {zh ? "财报期末" : "Financial period end"} {row.fundamentalsDate}{" "}
              · SEC EDGAR
            </p>
          )}
          <Link
            className={s.textLink}
            href={
              row.available
                ? stockPath(lang, row.ticker) + (model ? "#valuation" : "")
                : localePath(lang, "/stocks")
            }
          >
            {zh
              ? "查看估值依据与完整方法 ↗"
              : "Explore valuation evidence & methods ↗"}
          </Link>
        </div>
      </div>
      <p className={s.captureNote}>
        {zh
          ? "持仓是季末快照，报价是所示日期的收盘价。各项日期保留各自口径。"
          : "Holdings are quarter-end snapshots; quotes are closing prices for the dates shown. Each keeps its own date."}
      </p>
    </section>
  );
}
