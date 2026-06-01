from __future__ import annotations

import json
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import requests


class NYFedClient:
    """Small NY Fed Markets API client with defensive error handling."""

    def __init__(
        self,
        raw_dir: Path | None = None,
        timeout: int = 30,
        max_attempts: int = 3,
        backoff_base: float = 0.5,
    ) -> None:
        project_root = Path(__file__).resolve().parents[3]
        self.raw_dir = raw_dir or project_root / "data" / "raw"
        self.timeout = timeout
        self.max_attempts = max_attempts
        self.backoff_base = backoff_base
        self.warnings: list[str] = []
        self.raw_dir.mkdir(parents=True, exist_ok=True)

    def get_json(self, url: str, save_raw: bool = False) -> dict[str, Any]:
        """Fetch JSON from a public NY Fed endpoint, retrying transient failures.

        NY Fed endpoints intermittently reset connections under burst load, so we
        retry connection errors, timeouts, and 5xx responses with exponential
        backoff. 4xx responses are treated as permanent and not retried.
        """
        response = self._get_with_retry(url)

        try:
            payload = response.json()
        except ValueError as exc:
            message = f"invalid json from {url}: {exc}"
            self.warnings.append(message)
            raise RuntimeError(message) from exc

        if save_raw:
            self._save_raw_json(url=url, payload=payload)

        return payload

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

    def _save_raw_json(self, url: str, payload: dict[str, Any]) -> None:
        timestamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
        safe_name = (
            url.replace("https://", "")
            .replace("http://", "")
            .replace("/", "__")
            .replace("?", "_")
            .replace("=", "_")
            .replace("&", "_")
            .replace(".", "_")
        )
        output_path = self.raw_dir / f"{timestamp}__{safe_name}.json"
        output_path.write_text(json.dumps(payload, indent=2), encoding="utf-8")
