from __future__ import annotations

import csv
import io
from dataclasses import dataclass
from datetime import date

import requests


@dataclass(frozen=True)
class PricePoint:
    ticker: str
    price_date: str
    close: float
    source: str


class StooqPriceClient:
    """CSV price source; no HTML finance-site scraping."""

    source = "stooq_csv"

    def latest_close(self, ticker: str) -> PricePoint | None:
        symbol = f"{ticker.lower()}.us"
        url = f"https://stooq.com/q/l/?s={symbol}&f=sd2t2ohlcv&h&e=csv"
        response = requests.get(url, timeout=20)
        response.raise_for_status()
        rows = list(csv.DictReader(io.StringIO(response.text)))
        if not rows:
            return None
        row = rows[0]
        if row.get("Close") in (None, "", "N/D"):
            return None
        price_date = row.get("Date") or date.today().isoformat()
        return PricePoint(ticker=ticker.upper(), price_date=price_date, close=float(row["Close"]), source=self.source)
