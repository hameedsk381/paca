import type { Tool } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import type { PacaAPIClient } from "../api/index.js";
import { formatList, formatTask } from "../utils/index.js";

const ListTasksSchema = z.object({
	projectId: z.string(),
});

const GetTaskSchema = z.object({
	projectId: z.string(),
	taskId: z.string(),
});

const GetTaskByNumberSchema = z.object({
	projectId: z.string(),
	taskNumber: z.number(),
});

const CreateTaskSchema = z.object({
	projectId: z.string(),
	title: z.string(),
	description: z.string().optional(),
	statusId: z.string().optional(),
	typeId: z.string().optional(),
	sprintId: z.string().optional(),
	assigneeId: z.string().optional(),
	importance: z.number().optional(),
	tags: z.array(z.string()).optional(),
	startDate: z.string().optional(),
	dueDate: z.string().optional(),
});

const UpdateTaskSchema = z.object({
	projectId: z.string(),
	taskId: z.string(),
	title: z.string().optional(),
	description: z.string().optional(),
	statusId: z.string().optional(),
	typeId: z.string().optional(),
	sprintId: z.string().optional(),
	assigneeId: z.string().optional(),
	importance: z.number().optional(),
	tags: z.array(z.string()).optional(),
	startDate: z.string().optional(),
	dueDate: z.string().optional(),
});

const DeleteTaskSchema = z.object({
	projectId: z.string(),
	taskId: z.string(),
});

/**
 * Returns all task-related MCP tools.
 * @returns Array of task tools
 */
export function getTaskTools(): Tool[] {
	return [
		{
			name: "list_tasks",
			description: "List all tasks in a project",
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
			name: "get_task",
			description: "Get details of a specific task",
			inputSchema: {
				type: "object",
				properties: {
					projectId: {
						type: "string",
						description: "The ID of the project",
					},
					taskId: {
						type: "string",
						description: "The ID of the task",
					},
				},
				required: ["projectId", "taskId"],
			},
		},
		{
			name: "get_task_by_number",
			description: "Get a task by its number within a project",
			inputSchema: {
				type: "object",
				properties: {
					projectId: {
						type: "string",
						description: "The ID of the project",
					},
					taskNumber: {
						type: "number",
						description: "The task number",
					},
				},
				required: ["projectId", "taskNumber"],
			},
		},
		{
			name: "create_task",
			description: "Create a new task",
			inputSchema: {
				type: "object",
				properties: {
					projectId: {
						type: "string",
						description: "The ID of the project",
					},
					title: {
						type: "string",
						description: "The title of the task",
					},
					description: {
						type: "string",
						description:
							"The description of the task (will be converted from markdown to BlockNote format)",
					},
					statusId: {
						type: "string",
						description: "The ID of the status",
					},
					typeId: {
						type: "string",
						description: "The ID of the task type",
					},
					sprintId: {
						type: "string",
						description: "The ID of the sprint",
					},
					assigneeId: {
						type: "string",
						description: "The ID of the assignee",
					},
					importance: {
						type: "number",
						description: "The importance of the task",
					},
					tags: {
						type: "array",
						items: { type: "string" },
						description: "Tags for the task",
					},
					startDate: {
						type: "string",
						description: "The start date (ISO 8601 format)",
					},
					dueDate: {
						type: "string",
						description: "The due date (ISO 8601 format)",
					},
				},
				required: ["projectId", "title"],
			},
		},
		{
			name: "update_task",
			description: "Update an existing task",
			inputSchema: {
				type: "object",
				properties: {
					projectId: {
						type: "string",
						description: "The ID of the project",
					},
					taskId: {
						type: "string",
						description: "The ID of the task",
					},
					title: {
						type: "string",
						description: "The new title of the task",
					},
					description: {
						type: "string",
						description:
							"The new description of the task (will be converted from markdown to BlockNote format)",
					},
					statusId: {
						type: "string",
						description: "The ID of the status",
					},
					typeId: {
						type: "string",
						description: "The ID of the task type",
					},
					sprintId: {
						type: "string",
						description: "The ID of the sprint",
					},
					assigneeId: {
						type: "string",
						description: "The ID of the assignee",
					},
					importance: {
						type: "number",
						description: "The importance of the task",
					},
					tags: {
						type: "array",
						items: { type: "string" },
						description: "Tags for the task",
					},
					startDate: {
						type: "string",
						description: "The start date (ISO 8601 format)",
					},
					dueDate: {
						type: "string",
						description: "The due date (ISO 8601 format)",
					},
				},
				required: ["projectId", "taskId"],
			},
		},
		{
			name: "delete_task",
			description: "Delete a task",
			inputSchema: {
				type: "object",
				properties: {
					projectId: {
						type: "string",
						description: "The ID of the project",
					},
					taskId: {
						type: "string",
						description: "The ID of the task",
					},
				},
				required: ["projectId", "taskId"],
			},
		},
	];
}

/**
 * Handles task-related tool calls.
 * @param toolName - Name of the tool being called
 * @param args - Tool arguments
 * @param client - Paca API client instance
 * @returns Tool response
 */
export async function handleTaskTool(
	toolName: string,
	args: any,
	client: PacaAPIClient,
): Promise<any> {
	switch (toolName) {
		case "list_tasks": {
			const { projectId } = ListTasksSchema.parse(args);
			const tasks = await client.listTasks(projectId);
			const formatted = formatList(tasks, formatTask);
			return {
				content: [
					{
						type: "text",
						text: `Tasks:\n\n${formatted}`,
					},
				],
			};
		}

		case "get_task": {
			const { projectId, taskId } = GetTaskSchema.parse(args);
			const task = await client.getTask(projectId, taskId);
			return {
				content: [
					{
						type: "text",
						text: formatTask(task),
					},
				],
			};
		}

		case "get_task_by_number": {
			const { projectId, taskNumber } = GetTaskByNumberSchema.parse(args);
			const task = await client.getTaskByNumber(projectId, taskNumber);
			return {
				content: [
					{
						type: "text",
						text: formatTask(task),
					},
				],
			};
		}

		case "create_task": {
			const {
				projectId,
				title,
				description,
				statusId,
				typeId,
				sprintId,
				assigneeId,
				importance,
				tags,
				startDate,
				dueDate,
			} = CreateTaskSchema.parse(args);
			const task = await client.createTask({
				project_id: projectId,
				title,
				description,
				status_id: statusId,
				task_type_id: typeId,
				sprint_id: sprintId,
				assignee_id: assigneeId,
				importance,
				tags,
				start_date: startDate,
				due_date: dueDate,
			});
			return {
				content: [
					{
						type: "text",
						text: `Task created successfully:\n\n${formatTask(task)}`,
					},
				],
			};
		}

		case "update_task": {
			const {
				projectId,
				taskId,
				title,
				description,
				statusId,
				typeId,
				sprintId,
				assigneeId,
				importance,
				tags,
				startDate,
				dueDate,
			} = UpdateTaskSchema.parse(args);
			const task = await client.updateTask(projectId, taskId, {
				title,
				description,
				status_id: statusId,
				task_type_id: typeId,
				sprint_id: sprintId,
				assignee_id: assigneeId,
				importance,
				tags,
				start_date: startDate,
				due_date: dueDate,
			});
			return {
				content: [
					{
						type: "text",
						text: `Task updated successfully:\n\n${formatTask(task)}`,
					},
				],
			};
		}

		case "delete_task": {
			const { projectId, taskId } = DeleteTaskSchema.parse(args);
			await client.deleteTask(projectId, taskId);
			return {
				content: [
					{
						type: "text",
						text: `Task ${taskId} deleted successfully`,
					},
				],
			};
		}

		default:
			throw new Error(`Unknown task tool: ${toolName}`);
	}
}
