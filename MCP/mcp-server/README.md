# Treasury Monitor MCP Server

Read-only Model Context Protocol server for Treasury Monitor market data and the deterministic funding stress report.

This wrapper only calls existing `GET` API endpoints. It does not trigger ingestion, does not write data, does not require `INGEST_SECRET`, and must not be configured with Supabase service keys.

## Install

```bash
cd mcp-server
npm install
```

## Configure

Create a local environment file or pass the variable when starting the server:

```bash
cp .env.example .env
```

Set:

```bash
TREASURY_MONITOR_BASE_URL=http://localhost:3000
```

For production, use the deployed app URL:

```bash
TREASURY_MONITOR_BASE_URL=https://ny-fed-monitor.vercel.app
```

## Run Locally

Build the TypeScript server:

```bash
npm run build
```

Run in development mode:

```bash
TREASURY_MONITOR_BASE_URL=http://localhost:3000 npm run dev
```

Run the built server:

```bash
TREASURY_MONITOR_BASE_URL=http://localhost:3000 npm start
```

The server uses stdio transport for local MCP clients.

## Connect To An MCP Client

Example MCP client configuration:

```json
{
  "mcpServers": {
    "treasury-monitor": {
      "command": "npm",
      "args": ["run", "start"],
      "cwd": "/absolute/path/to/mcp-server",
      "env": {
        "TREASURY_MONITOR_BASE_URL": "http://localhost:3000"
      }
    }
  }
}
```

For development, change the args to:

```json
["run", "dev"]
```

## Tools

### `get_data_freshness_status`

Calls:

```text
GET /api/market/freshness/report
```

### `get_funding_stress_report`

Calls:

```text
GET /api/ai/funding-stress
```

### `get_latest_reference_rates`

Calls:

```text
GET /api/market/reference-rates/latest
```

### `get_latest_facility_usage`

Calls:

```text
GET /api/market/facility-usage/latest
```

## Example Tool Response

Each tool returns formatted JSON text:

```json
{
  "ok": true,
  "endpoint": "http://localhost:3000/api/ai/funding-stress",
  "status": 200,
  "data": {}
}
```

If an API call fails:

```json
{
  "ok": false,
  "error": "Treasury Monitor API returned HTTP 500.",
  "endpoint": "http://localhost:3000/api/ai/funding-stress",
  "status": 500
}
```

If `TREASURY_MONITOR_BASE_URL` is missing, the tool returns a clear configuration error instead of attempting a request.

## Safety Notes

- Read-only tools only.
- No ingestion trigger tools.
- No write tools.
- No Supabase service keys.
- No `INGEST_SECRET` required.
- No changes to dashboard pages, `buildAllSections()`, live fetch behavior, ingestion logic, or database schema.
