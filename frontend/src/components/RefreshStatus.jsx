import React from "react";
import Badge from "./Badge";
import { shortRefreshResult } from "../lib/dashboard";

export default function RefreshStatus({ lang, t, refreshStatus, refreshing, onRefresh, refreshError, summary, coverage }) {
  const stateValue = refreshing ? "running" : (refreshStatus?.state ?? "idle");
  const resultValue = refreshError ? "error" : shortRefreshResult(lang, refreshStatus?.message);
  const detailsMessage = refreshStatus?.message && refreshStatus?.message !== resultValue ? refreshStatus.message : "";

  return (
    <section className="refresh-card">
      <div className="refresh-card__main">
        <p className="section-kicker">{t.refreshStatus}</p>
        <div className="refresh-card__headline">
          <h2>{t.refreshStatus}</h2>
          <p className="refresh-card__explanation">{t.refreshExplanation}</p>
        </div>
        <div className="refresh-card__stats">
          <div className="refresh-card__stat">
            <span>{t.running}</span>
            <Badge value={stateValue}>
              {lang === "zh"
                ? stateValue === "running"
                  ? "Running 刷新中"
                  : stateValue === "completed"
                    ? "Completed 成功"
                    : stateValue === "error"
                      ? "Error 错误"
                      : "Idle 空闲"
                : stateValue === "running"
                  ? "Running"
                  : stateValue === "completed"
                    ? "Completed"
                    : stateValue === "error"
                      ? "Error"
                      : "Idle"}
            </Badge>
          </div>
          <div className="refresh-card__stat">
            <span>{t.lastRefreshTime}</span>
            <strong>{refreshStatus?.last_finished_at ?? summary?.as_of ?? "--"}</strong>
          </div>
          <div className="refresh-card__stat">
            <span>{t.lastResult}</span>
            <strong>{resultValue}</strong>
          </div>
        </div>
        {detailsMessage ? (
          <details className="refresh-card__details">
            <summary>{t.refreshDetails}</summary>
            <p>{detailsMessage}</p>
          </details>
        ) : null}
        <div className="refresh-card__coverage">
          <span className="refresh-card__coverage-label">{t.dataCoverage}</span>
          <Badge value="live">{t.liveCounts}: {coverage?.live_sections?.length ?? 0}</Badge>
          <Badge value="partial">{t.partialCounts}: {coverage?.partial_sections?.length ?? 0}</Badge>
          <Badge value="mock">{t.mockCounts}: {coverage?.mock_sections?.length ?? 0}</Badge>
          <Badge value="unavailable">{t.unavailableCounts}: {coverage?.unavailable_sections?.length ?? 0}</Badge>
        </div>
        {refreshError ? <p className="refresh-card__error">{refreshError}</p> : null}
      </div>
      <div className="refresh-card__action">
        <button className="primary-button primary-button--compact" onClick={onRefresh} disabled={refreshing}>
          {refreshing ? (lang === "zh" ? "刷新中 Refreshing..." : "Refreshing...") : t.refreshAll}
        </button>
      </div>
    </section>
  );
}
