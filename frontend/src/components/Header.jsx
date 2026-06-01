import React from "react";
import { Clock3, Globe, Moon, RefreshCcw, Sun } from "lucide-react";
import Badge from "./Badge";
import LanguageSwitcher from "./LanguageSwitcher";

export default function Header({ lang, t, summary, refreshing, onRefresh, onLanguageChange, displayStatusValue, theme, onToggleTheme }) {
  return (
    <header className="dashboard-header">
      <div className="dashboard-header__copy">
        <p className="dashboard-header__eyebrow">{t.title}</p>
        <h1>{t.title}</h1>
        <p className="dashboard-header__subtitle">{t.subtitle}</p>
        <div className="dashboard-header__meta">
          <span><Clock3 size={14} /> {t.lastUpdated}: {summary?.as_of ?? "--"}</span>
        </div>
      </div>
      <div className="dashboard-header__actions">
        <Badge value={summary?.global_freshness_summary} icon={<Globe size={14} />}>
          {displayStatusValue(summary?.global_freshness_summary ?? "Unavailable")}
        </Badge>
        <div className="header-controls">
          <LanguageSwitcher lang={lang} onChange={onLanguageChange} />
          <button
            className="theme-toggle"
            onClick={onToggleTheme}
            aria-label={lang === "zh" ? "切换主题" : "Toggle theme"}
            title={lang === "zh" ? "切换深浅色" : "Toggle theme"}
          >
            {theme === "dark" ? <Sun size={16} /> : <Moon size={16} />}
          </button>
        </div>
        <button className="primary-button" onClick={onRefresh} disabled={refreshing}>
          <RefreshCcw size={16} />
          {refreshing ? (lang === "zh" ? "刷新中 Refreshing" : "Refreshing") : t.refreshAll}
        </button>
      </div>
    </header>
  );
}
