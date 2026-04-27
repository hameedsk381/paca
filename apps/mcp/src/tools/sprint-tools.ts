import type { Tool } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import type { PacaAPIClient } from "../api/index.js";
import { formatList, formatSprint } from "../utils/index.js";

const ListSprintsSchema = z.object({
	projectId: z.string(),
});

const GetSprintSchema = z.object({
	projectId: z.string(),
	sprintId: z.string(),
});

const CreateSprintSchema = z.object({
	projectId: z.string(),
	name: z.string(),
	startDate: z.string(),
	endDate: z.string(),
});

const UpdateSprintSchema = z.object({
	projectId: z.string(),
	sprintId: z.string(),
	name: z.string().optional(),
	startDate: z.string().optional(),
	endDate: z.string().optional(),
});

const DeleteSprintSchema = z.object({
	projectId: z.string(),
	sprintId: z.string(),
});

const CompleteSprintSchema = z.object({
	projectId: z.string(),
	sprintId: z.string(),
});

/**
 * Returns all sprint-related MCP tools.
 * @returns Array of sprint tools
 */
export function getSprintTools(): Tool[] {
	return [
		{
			name: "list_sprints",
			description: "List all sprints in a project",
			inputSchema: {
				type: "object",
				properties: {
					projectId: {
						type: "string",
						description: "The ID of the project",
					},
				},
				required: ["projectId"],
			},
		},
		{
			name: "get_sprint",
			description: "Get details of a specific sprint",
			inputSchema: {
				type: "object",
				properties: {
					projectId: {
						type: "string",
						description: "The ID of the project",
					},
					sprintId: {
						type: "string",
						description: "The ID of the sprint",
					},
				},
				required: ["projectId", "sprintId"],
			},
		},
		{
			name: "create_sprint",
			description: "Create a new sprint",
			inputSchema: {
				type: "object",
				properties: {
					projectId: {
						type: "string",
						description: "The ID of the project",
					},
					name: {
						type: "string",
						description: "The name of the sprint",
					},
					startDate: {
						type: "string",
						description: "The start date (ISO 8601 format)",
					},
					endDate: {
						type: "string",
						description: "The end date (ISO 8601 format)",
					},
				},
				required: ["projectId", "name", "startDate", "endDate"],
			},
		},
		{
			name: "update_sprint",
			description: "Update an existing sprint",
			inputSchema: {
				type: "object",
				properties: {
					projectId: {
						type: "string",
						description: "The ID of the project",
					},
					sprintId: {
						type: "string",
						description: "The ID of the sprint",
					},
					name: {
						type: "string",
						description: "The new name of the sprint",
					},
					startDate: {
						type: "string",
						description: "The new start date (ISO 8601 format)",
					},
					endDate: {
						type: "string",
						description: "The new end date (ISO 8601 format)",
					},
				},
				required: ["projectId", "sprintId"],
			},
		},
		{
			name: "delete_sprint",
			description: "Delete a sprint",
			inputSchema: {
				type: "object",
				properties: {
					projectId: {
						type: "string",
						description: "The ID of the project",
					},
					sprintId: {
						type: "string",
						description: "The ID of the sprint",
					},
				},
				required: ["projectId", "sprintId"],
			},
		},
		{
			name: "complete_sprint",
			description: "Mark a sprint as completed",
			inputSchema: {
				type: "object",
				properties: {
					projectId: {
						type: "string",
						description: "The ID of the project",
					},
					sprintId: {
						type: "string",
						description: "The ID of the sprint",
					},
				},
				required: ["projectId", "sprintId"],
			},
		},
	];
}

/**
 * Handles sprint-related tool calls.
 * @param toolName - Name of the tool being called
 * @param args - Tool arguments
 * @param client - Paca API client instance
 * @returns Tool response
 */
export async function handleSprintTool(
	toolName: string,
	args: any,
	client: PacaAPIClient,
): Promise<any> {
	switch (toolName) {
		case "list_sprints": {
			const { projectId } = ListSprintsSchema.parse(args);
			const sprints = await client.listSprints(projectId);
			const formatted = formatList(sprints, formatSprint);
			return {
				content: [
					{
						type: "text",
						text: `Sprints:\n\n${formatted}`,
					},
				],
			};
		}

		case "get_sprint": {
			const { projectId, sprintId } = GetSprintSchema.parse(args);
			const sprint = await client.getSprint(projectId, sprintId);
			return {
				content: [
					{
						type: "text",
						text: formatSprint(sprint),
					},
				],
			};
		}

		case "create_sprint": {
			const { projectId, name, startDate, endDate } =
				CreateSprintSchema.parse(args);
			const sprint = await client.createSprint({
				project_id: projectId,
				name,
				start_date: startDate,
				end_date: endDate,
			});
			return {
				content: [
					{
						type: "text",
						text: `Sprint created successfully:\n\n${formatSprint(sprint)}`,
					},
				],
			};
		}

		case "update_sprint": {
			const { projectId, sprintId, name, startDate, endDate } =
				UpdateSprintSchema.parse(args);
			const sprint = await client.updateSprint(projectId, sprintId, {
				name,
				start_date: startDate,
				end_date: endDate,
			});
			return {
				content: [
					{
						type: "text",
						text: `Sprint updated successfully:\n\n${formatSprint(sprint)}`,
					},
				],
			};
		}

		case "delete_sprint": {
			const { projectId, sprintId } = DeleteSprintSchema.parse(args);
			await client.deleteSprint(projectId, sprintId);
			return {
				content: [
					{
						type: "text",
						text: `Sprint ${sprintId} deleted successfully`,
					},
				],
			};
		}

		case "complete_sprint": {
			const { projectId, sprintId } = CompleteSprintSchema.parse(args);
			const sprint = await client.completeSprint(projectId, sprintId);
			return {
				content: [
					{
						type: "text",
						text: `Sprint completed successfully:\n\n${formatSprint(sprint)}`,
					},
				],
			};
		}

		default:
			throw new Error(`Unknown sprint tool: ${toolName}`);
	}
}
