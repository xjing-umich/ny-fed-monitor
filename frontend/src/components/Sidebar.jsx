import React from "react";
import { sidebarGroups, sidebarItems } from "../lib/dashboard";

export default function Sidebar({ lang, t, activeKey, onSelect, summary }) {
  const sectionsByKey = Object.fromEntries((summary?.sections ?? []).map((section) => [section.key, section]));

  return (
    <aside className="sidebar-card">
      <div className="sidebar-card__header">
        <p className="section-kicker">{t.sections}</p>
        <h2>{t.sections}</h2>
      </div>
      <div className="sidebar-card__groups">
        {sidebarGroups.map((group) => (
          <div className="sidebar-group" key={group.key}>
            <h3>{lang === "zh" ? group.zh : group.en}</h3>
            {sidebarItems.filter((item) => item.group === group.key).map((item) => {
              const section = sectionsByKey[item.key];
              const meta = section?.data_date ?? section?.freshness_status ?? "--";
              return (
                <button
                  key={item.key}
                  className={activeKey === item.key ? "sidebar-link active" : "sidebar-link"}
                  onClick={() => onSelect(item.key)}
                >
                  <span className="sidebar-link__label">{lang === "zh" ? item.zh : item.en}</span>
                  <small className="sidebar-link__meta">{meta}</small>
                </button>
              );
            })}
          </div>
        ))}
      </div>
    </aside>
  );
}
