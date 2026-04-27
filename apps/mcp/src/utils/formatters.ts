import type { Document, Project, Sprint, Task } from "../types/index.js";
import { blocknoteToMarkdown } from "./converters.js";

/**
 * Formats a task object into a readable string.
 * @param task - The task object to format
 * @returns Formatted task string with description in Markdown
 */
export function formatTask(task: Task): string {
	const description = task.description
		? blocknoteToMarkdown(task.description)
		: "No description";

	return `Task #${task.task_number}: ${task.title}
ID: ${task.id}
Status: ${task.status_id || "None"}
Type: ${task.task_type_id || "None"}
Sprint: ${task.sprint_id || "None"}
Assignee: ${task.assignee_id || "Unassigned"}
Parent Task: ${task.parent_task_id || "None"}
Importance: ${task.importance}
Tags: ${task.tags && task.tags.length > 0 ? task.tags.join(", ") : "None"}
Start Date: ${task.start_date || "None"}
Due Date: ${task.due_date || "None"}
Created: ${task.created_at}
Updated: ${task.updated_at}

Description:
${description}`;
}

/**
 * Formats a document object into a readable string.
 * @param doc - The document object to format
 * @returns Formatted document string with content in Markdown
 */
export function formatDocument(doc: Document): string {
	const content = doc.content ? blocknoteToMarkdown(doc.content) : "No content";

	return `Document: ${doc.title}
ID: ${doc.id}
Project: ${doc.project_id || "None"}
Folder: ${doc.folder_id || "None"}
Position: ${doc.position}
Created by: ${doc.created_by || "Unknown"}
Updated by: ${doc.updated_by || "Unknown"}
Created: ${doc.created_at}
Updated: ${doc.updated_at}

Content:
${content}`;
}

/**
 * Formats a project object into a readable string.
 * @param project - The project object to format
 * @returns Formatted project string
 */
export function formatProject(project: Project): string {
	return `Project: ${project.name}
ID: ${project.id}
Description: ${project.description || "No description"}
Task ID Prefix: ${project.task_id_prefix || "None"}
Created by: ${project.created_by || "Unknown"}
Created: ${project.created_at}`;
}

/**
 * Formats a sprint object into a readable string.
 * @param sprint - The sprint object to format
 * @returns Formatted sprint string
 */
export function formatSprint(sprint: Sprint): string {
	return `Sprint: ${sprint.name}
ID: ${sprint.id}
Project: ${sprint.project_id}
Start Date: ${sprint.start_date || "None"}
End Date: ${sprint.end_date || "None"}
Goal: ${sprint.goal || "None"}
Status: ${sprint.status}
Created: ${sprint.created_at}
Updated: ${sprint.updated_at}`;
}

/**
 * Formats a list of items with a separator.
 * @param items - Array of items to format
 * @param formatter - Function to format each item
 * @param separator - Separator string between items
 * @returns Formatted string with all items
 */
export function formatList<T>(
	items: T[],
	formatter: (item: T) => string,
	separator: string = "\n\n---\n\n",
): string {
	return items.map(formatter).join(separator);
}
