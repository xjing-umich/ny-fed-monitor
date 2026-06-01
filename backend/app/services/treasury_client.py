from __future__ import annotations

import time
from typing import Any

import requests


class TreasuryClient:
    """Small FiscalData client with defensive error handling."""

    def __init__(self, timeout: int = 30, max_attempts: int = 3, backoff_base: float = 0.5) -> None:
        self.timeout = timeout
        self.max_attempts = max_attempts
        self.backoff_base = backoff_base
        self.warnings: list[str] = []

    def get_json(self, url: str) -> dict[str, Any]:
        response = self._get_with_retry(url)
        try:
            return response.json()
        except ValueError as exc:
            message = f"invalid json from {url}: {exc}"
            self.warnings.append(message)
            raise RuntimeError(message) from exc

    def _get_with_retry(self, url: str) -> requests.Response:
        last_exc: Exception | None = None
        for attempt in range(1, self.max_attempts + 1):
            try:
                response = requests.get(url, timeout=self.timeout)
                response.raise_for_status()
                return response
            except requests.HTTPError as exc:
                status = exc.response.status_code if exc.response is not None else None
                if status is not None and status < 500:
                    message = f"request failed for {url}: {exc}"
                    self.warnings.append(message)
                    raise RuntimeError(message) from exc
                last_exc = exc
            except (requests.ConnectionError, requests.Timeout) as exc:
                last_exc = exc
            except requests.RequestException as exc:
                last_exc = exc
            if attempt < self.max_attempts:
                time.sleep(self.backoff_base * (2 ** (attempt - 1)))
        message = f"request failed for {url} after {self.max_attempts} attempts: {last_exc}"
        self.warnings.append(message)
        raise RuntimeError(message) from last_exc
