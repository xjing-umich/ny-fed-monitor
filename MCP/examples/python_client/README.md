# Treasury Monitor Python Client

Example read-only Python client for external systems that need to call Treasury Monitor API endpoints.

This client only performs `GET` requests. It does not trigger ingestion, does not write data, and does not modify Treasury Monitor state.

## Install Dependencies

```bash
cd ~/Desktop/smart-money-monitor-with-env-20260601_副本/MCP/examples/python_client
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

## Configure Environment Variables

Set the Treasury Monitor base URL:

```bash
export TREASURY_MONITOR_BASE_URL="https://ny-fed-monitor-2j0eqcyfm-xjing-umichs-projects.vercel.app"
```

Optionally set an auth secret if the deployment requires one:

```bash
export TREASURY_MONITOR_AUTH_SECRET="your-secret"
```

The script never prints secrets.

If `TREASURY_MONITOR_BASE_URL` is not set, the client uses this default Preview URL:

```text
https://ny-fed-monitor-2j0eqcyfm-xjing-umichs-projects.vercel.app
```

## Run The Script

```bash
TREASURY_MONITOR_BASE_URL=https://ny-fed-monitor-2j0eqcyfm-xjing-umichs-projects.vercel.app python treasury_monitor_client.py
```

The script prints JSON outputs for:

- funding stress report
- freshness summary
- latest reference rates
- latest facility usage

## Read-Only Endpoints

The client calls:

```text
GET /api/ai/funding-stress
GET /api/market/freshness/report
GET /api/market/reference-rates/latest
GET /api/market/facility-usage/latest
```

It does not call ingestion endpoints and does not expose or require ingestion credentials.
