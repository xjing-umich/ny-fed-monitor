from __future__ import annotations

import html
import re
import sqlite3
from typing import Iterable

from .sec_client import SecClient


SECTION_PATTERNS = {
    "10-K": [
        ("item_1a_risk_factors", r"item\s+1a\.?\s+risk\s+factors", r"item\s+1b\.?"),
        ("item_7_mda", r"item\s+7\.?\s+management.?s\s+discussion\s+and\s+analysis", r"item\s+7a\.?"),
    ],
    "10-Q": [
        ("part_i_item_2_mda", r"item\s+2\.?\s+management.?s\s+discussion\s+and\s+analysis", r"item\s+3\.?"),
        ("part_ii_item_1a_risk_factors", r"item\s+1a\.?\s+risk\s+factors", r"item\s+2\.?"),
    ],
}


def html_to_text(document: str) -> str:
    text = re.sub(r"(?is)<script.*?</script>|<style.*?</style>", " ", document)
    text = re.sub(r"(?s)<[^>]+>", " ", text)
    text = html.unescape(text)
    text = re.sub(r"\s+", " ", text)
    return text.strip()


def extract_section(text: str, start_pattern: str, end_pattern: str) -> str | None:
    lower = text.lower()
    starts = [match for match in re.finditer(start_pattern, lower, re.I)]
    if not starts:
        return None
    start = starts[-1].start()
    end_match = re.search(end_pattern, lower[start + 20 :], re.I)
    end = start + 20 + end_match.start() if end_match else min(len(text), start + 120_000)
    section = text[start:end].strip()
    return section if len(section) > 500 else None


def store_filing_sections(conn: sqlite3.Connection, ticker: str, cik: str, client: SecClient, forms: Iterable[str] = ("10-K", "10-Q")) -> int:
    count = 0
    for form in forms:
        for filing in client.recent_filings(cik, {form}, limit=2):
            url, document = client.filing_document_text(cik, filing)
            text = html_to_text(document)
            for section_name, start, end in SECTION_PATTERNS[form]:
                section = extract_section(text, start, end)
                if not section:
                    continue
                conn.execute(
                    """
                    INSERT INTO filing_sections (
                      ticker, cik, accession_no, form, filing_date, section_name, section_text, source_url
                    )
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                    ON CONFLICT(ticker, accession_no, section_name) DO UPDATE SET
                      section_text=excluded.section_text,
                      source_url=excluded.source_url
                    """,
                    (ticker.upper(), cik, filing.accession_no, filing.form, filing.filing_date, section_name, section, url),
                )
                count += 1
    conn.commit()
    return count


def store_earnings_releases(conn: sqlite3.Connection, ticker: str, cik: str, client: SecClient, limit: int = 8) -> int:
    count = 0
    for filing in client.recent_filings(cik, {"8-K"}, limit=limit):
        try:
            index = client.filing_index(cik, filing.accession_no)
        except Exception:
            continue
        for item in index.get("directory", {}).get("item", []):
            name = item.get("name", "")
            lower = name.lower()
            if not (lower.startswith("ex99") or lower.startswith("ex-99")):
                continue
            url = client.filing_document_url(cik, filing.accession_no, name)
            text = html_to_text(client._get_text(url))
            if len(text) < 500:
                continue
            conn.execute(
                """
                INSERT INTO earnings_releases (
                  ticker, cik, accession_no, filing_date, exhibit_name, release_text, source_url
                )
                VALUES (?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(ticker, accession_no, exhibit_name) DO UPDATE SET
                  release_text=excluded.release_text,
                  source_url=excluded.source_url
                """,
                (ticker.upper(), cik, filing.accession_no, filing.filing_date, name, text, url),
            )
            count += 1
    conn.commit()
    return count
