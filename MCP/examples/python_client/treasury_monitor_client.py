"""Read-only Python client for Treasury Monitor API endpoints."""

from __future__ import annotations

import json
import os
from typing import Any
from urllib.parse import urljoin

import requests


DEFAULT_BASE_URL = "https://ny-fed-monitor-2j0eqcyfm-xjing-umichs-projects.vercel.app"


class TreasuryMonitorClient:
    """Small read-only client for external systems calling Treasury Monitor."""

    def __init__(
        self,
        base_url: str | None = None,
        auth_secret: str | None = None,
        timeout: float = 30.0,
    ) -> None:
        self.base_url = (
            base_url
            or os.getenv("TREASURY_MONITOR_BASE_URL")
            or DEFAULT_BASE_URL
        ).rstrip("/")
        self.auth_secret = auth_secret or os.getenv("TREASURY_MONITOR_AUTH_SECRET")
        self.timeout = timeout
        self.session = requests.Session()

        if self.auth_secret:
            self.session.headers.update({"Authorization": f"Bearer {self.auth_secret}"})

    def get_funding_stress_report(self) -> dict[str, Any]:
        return self._get_json("/api/ai/funding-stress")

    def get_data_freshness_status(self) -> dict[str, Any]:
        return self._get_json("/api/market/freshness/report")

    def get_latest_reference_rates(self) -> dict[str, Any]:
        return self._get_json("/api/market/reference-rates/latest")

    def get_latest_facility_usage(self) -> dict[str, Any]:
        return self._get_json("/api/market/facility-usage/latest")

    def _get_json(self, path: str) -> dict[str, Any]:
        endpoint = urljoin(f"{self.base_url}/", path.lstrip("/"))
        response = self.session.get(
            endpoint,
            headers={"Accept": "application/json"},
            timeout=self.timeout,
        )
        response.raise_for_status()
        return response.json()


def print_json(title: str, payload: dict[str, Any]) -> None:
    print(f"\n{title}")
    print(json.dumps(payload, indent=2, sort_keys=True))


def main() -> None:
    client = TreasuryMonitorClient()

    print_json("Funding stress report", client.get_funding_stress_report())
    print_json("Freshness summary", client.get_data_freshness_status())
    print_json("Latest reference rates", client.get_latest_reference_rates())
    print_json("Latest facility usage", client.get_latest_facility_usage())


if __name__ == "__main__":
    main()
