from __future__ import annotations

import json
import sqlite3

from .metrics import peer_median


PEER_METRICS = {
    "revenue_growth": "dm.revenue_growth_yoy",
    "gross_margin": "dm.gross_margin",
    "operating_margin": "dm.operating_margin",
    "fcf_margin": "dm.fcf_margin",
    "roe": "dm.roe",
    "roic": "dm.roic",
    "pe": "vm.pe",
    "ps": "vm.ps",
    "pfcf": "vm.pfcf",
    "ev_ebitda": "vm.ev_ebitda",
}


def set_peer_group(conn: sqlite3.Connection, ticker: str, peers: list[str]) -> None:
    conn.execute(
        """
        INSERT INTO peer_groups (ticker, peers_json)
        VALUES (?, ?)
        ON CONFLICT(ticker) DO UPDATE SET peers_json=excluded.peers_json, updated_at=CURRENT_TIMESTAMP
        """,
        (ticker.upper(), json.dumps([peer.upper() for peer in peers])),
    )
    conn.commit()


def calculate_peer_medians(conn: sqlite3.Connection, ticker: str) -> bool:
    ticker = ticker.upper()
    row = conn.execute("SELECT peers_json FROM peer_groups WHERE ticker = ?", (ticker,)).fetchone()
    if row is None:
        return False
    peers = json.loads(row["peers_json"])
    values: dict[str, float | None] = {}
    for name, expr in PEER_METRICS.items():
        samples = []
        for peer in peers:
            sample = conn.execute(
                f"""
                SELECT {expr} AS value
                FROM derived_metrics dm
                LEFT JOIN valuation_metrics vm
                  ON vm.ticker = dm.ticker AND vm.fiscal_year = dm.fiscal_year AND vm.fiscal_period = dm.fiscal_period
                WHERE dm.ticker = ?
                ORDER BY dm.fiscal_year DESC
                LIMIT 1
                """,
                (peer,),
            ).fetchone()
            samples.append(sample["value"] if sample else None)
        values[name] = peer_median(samples)
    conn.execute(
        """
        INSERT INTO peer_medians (
          ticker, revenue_growth, gross_margin, operating_margin, fcf_margin, roe, roic,
          pe, ps, pfcf, ev_ebitda
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(ticker) DO UPDATE SET
          revenue_growth=excluded.revenue_growth,
          gross_margin=excluded.gross_margin,
          operating_margin=excluded.operating_margin,
          fcf_margin=excluded.fcf_margin,
          roe=excluded.roe,
          roic=excluded.roic,
          pe=excluded.pe,
          ps=excluded.ps,
          pfcf=excluded.pfcf,
          ev_ebitda=excluded.ev_ebitda,
          updated_at=CURRENT_TIMESTAMP
        """,
        (ticker, *values.values()),
    )
    conn.commit()
    return True
