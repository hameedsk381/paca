import {
	type ActivityEntry,
	ActivityPane,
} from "@/components/shared/activity-pane";
import {
	textToBlocks,
} from "@/components/shared/comment-blocknote";
import {
	addDocComment,
	type DocActivity,
	deleteDocComment,
	docQueryKeys,
	listActivities,
	updateDocComment,
} from "@/lib/doc-api";

type DocActivityChange = {
	field: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null;
}

function getDocActivityChanges(content: unknown): DocActivityChange[] {
	if (!isRecord(content)) {
		return [];
	}

	const { changes } = content;
	if (!Array.isArray(changes)) {
		return [];
	}

	return changes.filter(
		(change): change is DocActivityChange =>
			isRecord(change) && typeof change.field === "string",
	);
}

function describeDocActivity(entry: ActivityEntry): string {
	const activity = entry as DocActivity;
	switch (activity.activity_type) {
		case "doc.created":
			return "created this document";
		case "doc.updated": {
			const changes = getDocActivityChanges(activity.content);
			if (changes.length > 0) {
				const fields = changes.map((c) => c.field).join(", ");
				return `updated ${fields}`;
			}
			return "updated the document";
		}
		case "doc.deleted":
			return "deleted the document";
		case "doc.moved":
			return "moved the document";
		case "comment":
			return "";
		default:
			return activity.activity_type;
	}
}

interface DocActivityPaneProps {
	projectId: string;
	docId: string;
}

export function DocActivityPane({
	projectId,
	docId,
}: DocActivityPaneProps) {
	const queryKey = docQueryKeys.activities(projectId, docId);

		return (
		<ActivityPane<DocActivity>
			projectId={projectId}
			entityId={docId}
			queryKey={queryKey}
			queryFn={() => listActivities(projectId, docId)}
			addComment={(blocks) =>
				addDocComment(projectId, docId, blocks)
			}
			updateComment={(commentId, blocks) =>
				updateDocComment(projectId, docId, commentId, blocks)
			}
			deleteComment={(commentId) =>
				deleteDocComment(projectId, docId, commentId)
			}
			describeActivity={describeDocActivity}
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
			sortAscending
		/>
	);
}
