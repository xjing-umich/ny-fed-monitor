import "dotenv/config";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { asJsonText, fetchTreasuryMonitorEndpoint } from "./tools/apiClient.js";

const server = new McpServer({
  name: "treasury-monitor-readonly",
  version: "0.1.0",
});

function registerReadOnlyTool(name: string, description: string, endpointPath: string) {
  server.tool(name, description, {}, async () => {
    const result = await fetchTreasuryMonitorEndpoint(endpointPath);
    return asJsonText(result);
  });
}

registerReadOnlyTool(
  "get_data_freshness_status",
  "Return the current database freshness report from Treasury Monitor.",
  "/api/market/freshness/report",
);

registerReadOnlyTool(
  "get_funding_stress_report",
  "Return the deterministic database-backed funding stress report from Treasury Monitor.",
  "/api/ai/funding-stress",
);

registerReadOnlyTool(
  "get_latest_reference_rates",
  "Return the latest Reference Rates from Treasury Monitor.",
  "/api/market/reference-rates/latest",
);

registerReadOnlyTool(
  "get_latest_facility_usage",
  "Return the latest ON RRP / SRP Facility Usage from Treasury Monitor.",
  "/api/market/facility-usage/latest",
);

const transport = new StdioServerTransport();
await server.connect(transport);
