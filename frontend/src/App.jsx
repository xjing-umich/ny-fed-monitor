import React, { useEffect, useMemo, useState } from "react";
import { Activity, Database, Server, ShieldCheck } from "lucide-react";
import Header from "./components/Header";
import DashboardCards from "./components/DashboardCards";
import RefreshStatus from "./components/RefreshStatus";
import Sidebar from "./components/Sidebar";
import SectionPanel from "./components/SectionPanel";
import { fetchJson } from "./api/client";
import {
  buildExecutiveSummary,
  buildWatchList,
  displayStatusValue,
  i18n,
  quickNavGroups,
  topDashboardCards,
} from "./lib/dashboard";

function routeLang() {
  return window.location.pathname.startsWith("/zh") ? "zh" : "en";
}

function initialTheme() {
  const saved = localStorage.getItem("theme");
  if (saved === "light" || saved === "dark") return saved;
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function StatusMini({ label, value }) {
  return (
    <div className="status-mini">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

export default function App() {
  const [lang, setLang] = useState(routeLang());
  const [theme, setTheme] = useState(initialTheme);
  const [summary, setSummary] = useState(null);
  const [health, setHealth] = useState(null);
  const [refreshStatus, setRefreshStatus] = useState(null);
  const [activeSectionKey, setActiveSectionKey] = useState("dealer-inventory");
  const [activeSection, setActiveSection] = useState(null);
  const [sectionLoading, setSectionLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshError, setRefreshError] = useState("");

  const t = i18n[lang];

  const translateStatus = (value) => displayStatusValue(lang, value);

  const loadSummary = async () => {
    const [nextHealth, nextSummary, nextRefresh] = await Promise.all([
      fetchJson("/api/health"),
      fetchJson("/api/summary"),
      fetchJson("/api/status/refresh"),
    ]);
    setHealth(nextHealth);
    setSummary(nextSummary);
    setRefreshStatus(nextRefresh);
  };

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem("theme", theme);
  }, [theme]);

  const toggleTheme = () => setTheme((prev) => (prev === "dark" ? "light" : "dark"));

  useEffect(() => {
    loadSummary().catch(() => {});
  }, []);

  useEffect(() => {
    setSectionLoading(true);
    fetchJson(`/api/sections/${activeSectionKey}`)
      .then(setActiveSection)
      .catch(() => setActiveSection(null))
      .finally(() => setSectionLoading(false));
  }, [activeSectionKey]);

  const onRefresh = async () => {
    setRefreshing(true);
    setRefreshError("");
    try {
      let status = await fetchJson("/api/refresh/all", { method: "POST" });
      setRefreshStatus(status);
      const deadline = Date.now() + 120000;
      while (status?.state === "running" && Date.now() < deadline) {
        await new Promise((resolve) => setTimeout(resolve, 2000));
        status = await fetchJson("/api/status/refresh");
        setRefreshStatus(status);
      }
      if (status?.state === "error") {
        setRefreshError(lang === "zh" ? "刷新失败，请稍后重试。" : "Refresh failed. Please try again.");
      }
      await loadSummary();
      setSectionLoading(true);
      const currentSection = await fetchJson(`/api/sections/${activeSectionKey}`);
      setActiveSection(currentSection);
    } catch (error) {
      setRefreshError(lang === "zh" ? "刷新失败，请稍后重试。" : "Refresh failed. Please try again.");
    } finally {
      setSectionLoading(false);
      setRefreshing(false);
    }
  };

  const onLanguageChange = (nextLang) => {
    setLang(nextLang);
    window.history.replaceState(null, "", `/${nextLang}`);
  };

  const executiveSummary = useMemo(() => buildExecutiveSummary(lang, summary), [lang, summary]);
  const watchList = useMemo(() => buildWatchList(lang, summary), [lang, summary]);
  const dashboardCards = useMemo(() => topDashboardCards(summary), [summary]);
  const coverage = summary?.data_coverage_summary ?? {
    live_sections: [],
    partial_sections: [],
    mock_sections: [],
    unavailable_sections: [],
  };

  return (
    <main className="clean-dashboard">
      <div className="clean-dashboard__inner">
        <Header
          lang={lang}
          t={t}
          summary={summary}
          refreshing={refreshing}
          onRefresh={onRefresh}
          onLanguageChange={onLanguageChange}
          displayStatusValue={translateStatus}
          theme={theme}
          onToggleTheme={toggleTheme}
        />

        <section className="summary-strip">
          <article className="summary-strip__card summary-strip__card--lead">
            <p className="section-kicker">{t.summary}</p>
            <h2>{t.summary}</h2>
            <ul className="summary-strip__body summary-strip__body--list">
              {executiveSummary.map((line, index) => (
                <li key={index}>{line}</li>
              ))}
            </ul>
          </article>
          <article className="summary-strip__card">
            <p className="section-kicker">{t.watchNext}</p>
            <h2>{t.watchNext}</h2>
            <ul className="watch-list">
              {watchList.map((item, index) => (
                <li key={index}>{item}</li>
              ))}
            </ul>
          </article>
        </section>

        <DashboardCards lang={lang} cards={dashboardCards} displayStatusValue={translateStatus} />

        <nav className="quick-nav" aria-label={lang === "zh" ? "快速导航" : "Quick navigation"}>
          {quickNavGroups.map((group) => (
            <button
              key={group.key}
              className="quick-nav__button"
              onClick={() => setActiveSectionKey(group.target)}
            >
              {lang === "zh" ? group.zh : group.en}
            </button>
          ))}
        </nav>

        <RefreshStatus
          lang={lang}
          t={t}
          refreshStatus={refreshStatus}
          refreshing={refreshing}
          onRefresh={onRefresh}
          refreshError={refreshError}
          summary={summary}
          coverage={coverage}
        />

        <section className="status-minis">
          <StatusMini label={t.statusBackend} value={health?.status ?? "--"} />
          <StatusMini label={t.statusDataMode} value={translateStatus(summary?.data_mode ?? summary?.mode ?? "Unavailable")} />
          <StatusMini label={t.statusRecommendations} value={t.disabled} />
          <StatusMini label={t.liveModules} value={summary?.live_sections?.join(", ") ?? "--"} />
        </section>

        <section className="main-layout">
          <Sidebar lang={lang} t={t} activeKey={activeSectionKey} onSelect={setActiveSectionKey} summary={summary} />
          <SectionPanel
            lang={lang}
            t={t}
            section={activeSection}
            sectionKey={activeSectionKey}
            loading={sectionLoading}
            displayStatusValue={translateStatus}
            theme={theme}
          />
        </section>
      </div>
    </main>
  );
}
