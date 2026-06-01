import React from "react";
import Badge from "./Badge";
import { shortCardValue } from "../lib/dashboard";

export default function DashboardCards({ lang, cards, displayStatusValue }) {
  return (
    <section className="card-grid">
      {cards.map((card) => (
        <article className="dashboard-card" key={card.id}>
          <div className="dashboard-card__header">
            <p className="dashboard-card__label">{lang === "zh" ? card.label?.zh : card.label?.en}</p>
            <Badge value={card.value}>{displayStatusValue(card.value)}</Badge>
          </div>
          <strong className="dashboard-card__value">{shortCardValue(card.id, lang, card.value)}</strong>
          <p className="dashboard-card__detail">{lang === "zh" ? card.detail?.zh : card.detail?.en}</p>
        </article>
      ))}
    </section>
  );
}
