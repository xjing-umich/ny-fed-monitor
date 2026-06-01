import React from "react";

export default function LanguageSwitcher({ lang, onChange }) {
  return (
    <div className="lang-switcher" aria-label="Language switcher">
      <button className={lang === "en" ? "active" : ""} onClick={() => onChange("en")}>English</button>
      <button className={lang === "zh" ? "active" : ""} onClick={() => onChange("zh")}>中文</button>
    </div>
  );
}
