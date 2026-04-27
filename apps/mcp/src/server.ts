import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import {
	CallToolRequestSchema,
	ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import {
	PacaAPIClient,
	PacaAPIDocClient,
	PacaAPIExtendedClient,
	PacaAPIGitHubClient,
	PacaAPITaskExtendedClient,
	PacaAPIViewsClient,
} from "./api/index.js";
import { getAllTools, handleToolCall } from "./tools/index.js";
import type { PacaConfig } from "./types/index.js";

/**
 * Creates and configures the Paca MCP server.
 * @param config - Paca configuration
 * @returns Configured MCP server
 */
export function createServer(config: PacaConfig): Server {
	// Initialize all API clients
	const apiClient = new PacaAPIClient(config);
	const extendedClient = new PacaAPIExtendedClient(config);
	const viewsClient = new PacaAPIViewsClient(config);
	const taskExtendedClient = new PacaAPITaskExtendedClient(config);
	const docClient = new PacaAPIDocClient(config);
	const githubClient = new PacaAPIGitHubClient(config);

	const clients = {
		apiClient,
		extendedClient,
		viewsClient,
		taskExtendedClient,
		docClient,
		githubClient,
	};

	const server = new Server(
		{
			name: "paca",
			version: "0.1.0",
		},
		{
			capabilities: {
				tools: {},
			},
		},
	);

	// Handler for listing available tools
	server.setRequestHandler(ListToolsRequestSchema, async () => {
		return {
			tools: getAllTools(),
		};
	});

	// Handler for executing tool calls
	server.setRequestHandler(CallToolRequestSchema, async (request) => {
		return handleToolCall(request, clients);
	});

	return server;
}
