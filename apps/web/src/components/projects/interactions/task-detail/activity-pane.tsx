import { useQuery } from "@tanstack/react-query";
import { useCallback, useMemo } from "react";
import { ActivityPane } from "@/components/shared/activity-pane";
import { textToBlocks } from "@/components/shared/comment-blocknote";
import {
	type Activity,
	addComment,
	deleteComment,
	listTaskActivities,
	sprintsQueryOptions,
	updateComment,
} from "@/lib/interaction-api";
import { projectMembersQueryOptions } from "@/lib/project-api";
import { currentUserQueryOptions } from "@/lib/auth-api";
import { describeTaskChange } from "./activity-item";

type FieldChange = {
	field: string;
	old?: unknown;
	new?: unknown;
};

interface TaskActivityPaneProps {
	projectId: string;
	taskId: string;
	canEdit?: boolean;
}

export function TaskActivityPane({
	projectId,
	taskId,
	canEdit = true,
}: TaskActivityPaneProps) {
	const { data: membersData } = useQuery(projectMembersQueryOptions(projectId));
	const { data: sprintsData } = useQuery(sprintsQueryOptions(projectId));
	const { data: currentUser } = useQuery(currentUserQueryOptions);

	const myMemberId = useMemo(() => {
		if (!currentUser || !membersData) return undefined;
		return membersData.find((m) => m.user_id === currentUser.id)?.id;
	}, [currentUser, membersData]);

	const nameMaps = useMemo(() => {
		const members: Record<string, string> = {};
		for (const m of membersData ?? []) {
			members[m.id] = m.full_name || m.username;
		}
		const sprints: Record<string, string> = {};
		for (const s of sprintsData ?? []) {
			sprints[s.id] = s.name;
		}
		return { members, sprints };
	}, [membersData, sprintsData]);

	const describeActivity = useCallback(
		(entry: Activity): string => {
			const c = entry.content ?? {};
			switch (entry.activity_type) {
				case "task.created":
					return "created this task";
				case "task.deleted":
					return "deleted this task";
				case "task.updated": {
					const changes = (c as Record<string, unknown>).changes as
						| FieldChange[]
						| undefined;
					if (changes && changes.length === 1) {
						return describeTaskChange(changes[0], nameMaps);
					}
					if (changes && changes.length > 1) {
						return changes
							.map((ch) => describeTaskChange(ch, nameMaps))
							.join("; ");
					}
					return "updated this task";
				}
				case "task.attachment.added":
					return `added attachment${(c as Record<string, unknown>).file_name ? `: ${(c as Record<string, unknown>).file_name}` : ""}`;
				case "task.attachment.removed":
					return `removed attachment${(c as Record<string, unknown>).file_name ? `: ${(c as Record<string, unknown>).file_name}` : ""}`;
				default:
					return (
						((c as Record<string, unknown>)._description as
							| string
							| undefined) ?? "made a change"
					);
			}
		},
		[nameMaps],
	);

	const queryKey = [
		"projects",
		projectId,
		"tasks",
		taskId,
		"activities",
	] as const;

	return (
		<ActivityPane<Activity>
			projectId={projectId}
			entityId={taskId}
			queryKey={queryKey}
			queryFn={() => listTaskActivities(projectId, taskId)}
			addComment={
				canEdit ? (blocks) => addComment(projectId, taskId, blocks) : undefined
			}
			updateComment={
				canEdit
					? (commentId, blocks) =>
							updateComment(projectId, taskId, commentId, blocks)
					: undefined
			}
			deleteComment={
				canEdit
					? (commentId) => deleteComment(projectId, taskId, commentId)
					: undefined
			}
			describeActivity={describeActivity}
			getCommentBlocks={(content) => {
				if (Array.isArray(content)) return content;
				if (
					content &&
					typeof content === "object" &&
					!("length" in content)
				) {
					if ("content" in content) {
						const blockContent = (content as { content?: unknown }).content;
						if (Array.isArray(blockContent)) return blockContent;
					}
					if ("text" in content) {
						const text = (content as { text?: string }).text ?? "";
						return textToBlocks(text);
					}
				}
				return [];
			}}
			currentUserId={myMemberId}
		/>
	);
}
