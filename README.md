# NY Fed Treasury Web Agent

Clean deployment-ready skeleton for a future public NY Fed Treasury dashboard.

This rebuild is running in partial-live mode. Reference Rates, SOMA, Primary Dealer sections, and Treasury auction data can be connected live section by section. It does not use a database and does not generate trading recommendations.

## Structure

```text
backend/
frontend/
data/cache/
data/raw/
data/processed/
data/manual/
data/reports/assets/
config.yaml
README.md
CHANGELOG.md
```

## Requirements

- Python `3.11`–`3.14` (deps are pinned to compatible ranges; `--only-binary` avoids slow source builds on very new Python)
- Node `>=18` (Vite 6 will not run on older Node; see `frontend/.nvmrc`)

## Backend

Port: `8010`

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install --only-binary=:all: -r requirements.txt
uvicorn app.main:app --reload --host 127.0.0.1 --port 8010
```

First start builds the matplotlib font cache (~20s), which is normal.

Endpoints:

- `GET /api/health`
- `GET /api/summary`
- `GET /api/sections/{section_name}`
- `POST /api/refresh/all`
- `GET /api/status/refresh`
- `GET /api/debug/analysis-keys`

## Frontend

Port: `5174`

```bash
cd frontend
nvm use        # picks up .nvmrc (Node 20); required — older Node hangs Vite silently
npm install
npm run dev
```

Routes:

- `/zh`
- `/en`

## Reconnection Plan

Real data modules can be reintroduced one section at a time after the mock API contracts and UI are stable.

## Manual SME / Policy Expectations Update

The `Policy Expectations` section uses a manually downloaded NY Fed Survey of Market Expectations file.

1. Download the latest NY Fed SME data file as Excel or CSV.
2. Save it as:

```text
data/manual/sme_latest.xlsx
```

3. Or update `config.yaml`:

```yaml
policy_expectations:
  sme_file_path: "data/manual/sme_latest.xlsx"
```

4. Restart or refresh the backend, then click `Refresh` in the frontend.

If the file is missing, the Policy Expectations section will show `Unavailable` / `Missing` instead of crashing.
