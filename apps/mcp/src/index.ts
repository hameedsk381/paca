#!/usr/bin/env node

import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createServer } from "./server.js";
import type { PacaConfig } from "./types/index.js";

/**
 * Main entry point for the Paca MCP server.
 * Initializes the API clients and starts the MCP server.
 */
async function main() {
	// Get configuration from environment variables
	const apiKey = process.env.PACA_API_KEY;
	const baseURL = process.env.PACA_API_URL || "http://localhost:8080";

	// Validate required configuration
	if (!apiKey) {
		console.error(
			"PACA_API_KEY environment variable is required. Please set it to your Paca API key.",
		);
		console.error("\nExample:");
		console.error("  export PACA_API_KEY='your-api-key-here'");
		console.error("  export PACA_API_URL='http://localhost:8080'");
		process.exit(1);
	}

	// Create configuration object
	const config: PacaConfig = { apiKey, baseURL };

	// Create and configure MCP server
	const server = createServer(config);

	// Connect to stdio transport
	const transport = new StdioServerTransport();
	await server.connect(transport);
}

// Handle errors and exit gracefully
main().catch((error) => {
	console.error("Server error:", error);
	process.exit(1);
});
