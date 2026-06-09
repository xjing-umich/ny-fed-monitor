from __future__ import annotations

import time
from dataclasses import dataclass
from typing import Any

import requests


SEC_BASE = "https://data.sec.gov"
SEC_ARCHIVES = "https://www.sec.gov/Archives/edgar/data"
TICKER_MAP_URL = "https://www.sec.gov/files/company_tickers.json"


@dataclass
class Filing:
    accession_no: str
    form: str
    filing_date: str
    primary_document: str
    primary_doc_description: str | None = None


class SecClient:
    def __init__(self, user_agent: str, pause_seconds: float = 0.11) -> None:
        if not user_agent or "@" not in user_agent:
            raise ValueError("SEC requests require a descriptive user agent with contact email.")
        self.session = requests.Session()
        self.session.headers.update(
            {
                "User-Agent": user_agent,
                "Accept-Encoding": "gzip, deflate",
                "Host": "data.sec.gov",
            }
        )
        self.pause_seconds = pause_seconds
        self._ticker_map: dict[str, dict[str, Any]] | None = None

    def _get_json(self, url: str) -> Any:
        time.sleep(self.pause_seconds)
        response = self.session.get(url, timeout=30)
        response.raise_for_status()
        return response.json()

    def _get_text(self, url: str) -> str:
        time.sleep(self.pause_seconds)
        headers = dict(self.session.headers)
        if "www.sec.gov" in url:
            headers["Host"] = "www.sec.gov"
        response = self.session.get(url, headers=headers, timeout=45)
        response.raise_for_status()
        response.encoding = response.encoding or "utf-8"
        return response.text

    def ticker_map(self) -> dict[str, dict[str, Any]]:
        if self._ticker_map is None:
            raw = self._get_json(TICKER_MAP_URL)
            self._ticker_map = {
                row["ticker"].upper(): {
                    "ticker": row["ticker"].upper(),
                    "cik": str(row["cik_str"]).zfill(10),
                    "name": row.get("title"),
                }
                for row in raw.values()
            }
        return self._ticker_map

    def cik_for_ticker(self, ticker: str) -> dict[str, Any]:
        try:
            return self.ticker_map()[ticker.upper()]
        except KeyError as exc:
            raise KeyError(f"Ticker {ticker!r} not found in SEC company ticker mapping.") from exc

    def company_facts(self, cik: str) -> dict[str, Any]:
        return self._get_json(f"{SEC_BASE}/api/xbrl/companyfacts/CIK{cik.zfill(10)}.json")

    def submissions(self, cik: str) -> dict[str, Any]:
        return self._get_json(f"{SEC_BASE}/submissions/CIK{cik.zfill(10)}.json")

    def recent_filings(self, cik: str, forms: set[str], limit: int = 20) -> list[Filing]:
        data = self.submissions(cik)
        recent = data.get("filings", {}).get("recent", {})
        filings: list[Filing] = []
        for idx, form in enumerate(recent.get("form", [])):
            if form not in forms:
                continue
            filings.append(
                Filing(
                    accession_no=recent["accessionNumber"][idx],
                    form=form,
                    filing_date=recent["filingDate"][idx],
                    primary_document=recent["primaryDocument"][idx],
                    primary_doc_description=recent.get("primaryDocDescription", [None])[idx],
                )
            )
            if len(filings) >= limit:
                break
        return filings

    def filing_document_url(self, cik: str, accession_no: str, document: str) -> str:
        cik_int = str(int(cik))
        accession_flat = accession_no.replace("-", "")
        return f"{SEC_ARCHIVES}/{cik_int}/{accession_flat}/{document}"

    def filing_document_text(self, cik: str, filing: Filing) -> tuple[str, str]:
        url = self.filing_document_url(cik, filing.accession_no, filing.primary_document)
        return url, self._get_text(url)

    def filing_index(self, cik: str, accession_no: str) -> dict[str, Any]:
        cik_int = str(int(cik))
        accession_flat = accession_no.replace("-", "")
        return self._get_json(f"{SEC_ARCHIVES}/{cik_int}/{accession_flat}/index.json")
