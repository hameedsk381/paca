import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { formatDistanceToNow } from "date-fns";
import {
	MessageSquare,
	MoreHorizontal,
	Pencil,
	Send,
	Trash2,
} from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
	addDocComment,
	type DocActivity,
	deleteDocComment,
	docActivitiesQueryOptions,
	docQueryKeys,
	updateDocComment,
} from "@/lib/doc-api";
import { cn } from "@/lib/utils";

interface DocActivityPaneProps {
	projectId: string;
	docId: string;
}

// ── Activity item ─────────────────────────────────────────────────────────────

interface ActivityItemProps {
	activity: DocActivity;
	projectId: string;
	docId: string;
	currentUserId?: string;
}

function ActivityItem({
	activity,
	projectId,
	docId,
	currentUserId,
}: ActivityItemProps) {
	const qc = useQueryClient();
	const [editing, setEditing] = useState(false);
	const [editText, setEditText] = useState(activity.content);

	const isComment = activity.activity_type === "comment";
	const isOwn = activity.actor_id === currentUserId;

	const updateMutation = useMutation({
		mutationFn: (text: string) =>
			updateDocComment(projectId, docId, activity.id, text),
		onSuccess: () => {
			qc.invalidateQueries({
				queryKey: docQueryKeys.activities(projectId, docId),
			});
			setEditing(false);
		},
	});

	const deleteMutation = useMutation({
		mutationFn: () => deleteDocComment(projectId, docId, activity.id),
		onSuccess: () => {
			qc.invalidateQueries({
				queryKey: docQueryKeys.activities(projectId, docId),
			});
		},
	});

	const label = activity.actor_name || activity.actor_username;
	const time = formatDistanceToNow(new Date(activity.created_at), {
		addSuffix: true,
	});
	const initial = label.slice(0, 1).toUpperCase();

	return (
		<div
			data-activity-type={activity.activity_type}
			data-comment-id={isComment ? activity.id : undefined}
			className="flex gap-3"
		>
			{/* Avatar — design system pattern */}
			<div
				className={cn(
					"flex size-6 shrink-0 items-center justify-center rounded-full text-[10px] font-bold",
					isComment
						? "bg-linear-to-br from-primary/20 to-primary/10 text-primary ring-1 ring-primary/15"
						: "bg-muted/40 text-muted-foreground/80 ring-1 ring-border/20",
				)}
			>
				{initial}
			</div>

			<div className="flex-1 min-w-0">
				{isComment ? (
					/* Comment — bubble style per design system */
					<div className="rounded-xl rounded-tl-lg border border-border/25 bg-card/70 px-3.5 py-2.5">
						<div className="mb-1 flex items-center gap-2">
							<span className="text-[12px] font-semibold text-foreground">
								{label}
							</span>
							<span className="text-[10px] text-muted-foreground/50">
								{time}
							</span>
							{isOwn && (
								<DropdownMenu>
									<DropdownMenuTrigger className="inline-flex items-center justify-center ml-auto size-5 rounded-md text-muted-foreground/60 hover:text-foreground hover:bg-muted/60 opacity-0 group-hover:opacity-100 transition-all duration-150">
										<MoreHorizontal className="size-3" />
									</DropdownMenuTrigger>
									<DropdownMenuContent align="end" className="w-36">
										<DropdownMenuItem onClick={() => setEditing(true)}>
											<Pencil className="size-3.5 mr-2" />
											Edit
										</DropdownMenuItem>
										<DropdownMenuItem
											className="text-destructive focus:text-destructive"
											onClick={() => deleteMutation.mutate()}
										>
											<Trash2 className="size-3.5 mr-2" />
											Delete
										</DropdownMenuItem>
									</DropdownMenuContent>
								</DropdownMenu>
							)}
						</div>

						{editing ? (
							<div className="space-y-1.5 mt-1">
								<textarea
									value={editText}
									onChange={(e) => setEditText(e.target.value)}
									className="w-full rounded-lg border border-border/30 bg-muted/15 px-3 py-2 text-[13px] outline-none focus:border-primary/40 focus:ring-2 focus:ring-primary/15 resize-none min-h-16 placeholder:text-muted-foreground/50 leading-relaxed transition-all duration-150"
								/>
								<div className="flex gap-1.5">
									<Button
										size="sm"
										className="h-6 text-[11px] gap-1 rounded-md"
										onClick={() => updateMutation.mutate(editText)}
										disabled={!editText.trim()}
									>
										Save
									</Button>
									<Button
										variant="ghost"
										size="sm"
										className="h-6 text-[11px] rounded-md"
										onClick={() => {
											setEditing(false);
											setEditText(activity.content);
										}}
									>
										Cancel
									</Button>
								</div>
							</div>
						) : (
							<p className="text-[13px] text-foreground leading-relaxed">
								{activity.content}
							</p>
						)}
					</div>
				) : (
					/* Non-comment activity — inline style per design system */
					<div className="flex flex-wrap items-baseline gap-1.5 py-0.5">
						<span className="text-[12px] font-medium text-foreground/80">
							{label}
						</span>
						<span className="text-[12px] text-muted-foreground/70 italic">
							{formatActivityMessage(activity)}
						</span>
						<span className="text-[10px] text-muted-foreground/45">{time}</span>
					</div>
				)}
			</div>
		</div>
	);
}

function formatActivityMessage(activity: DocActivity): string {
	switch (activity.activity_type) {
		case "doc.created":
			return "created this document";
		case "doc.updated":
			if (activity.changes && activity.changes.length > 0) {
				const fields = activity.changes.map((c) => c.field).join(", ");
				return `updated ${fields}`;
			}
			return "updated the document";
		case "doc.deleted":
			return "deleted the document";
		case "doc.moved":
			return "moved the document";
		default:
			return activity.content || activity.activity_type;
	}
}

// ── Comment composer — design system pattern ─────────────────────────────────

interface CommentComposerProps {
	projectId: string;
	docId: string;
}

function CommentComposer({ projectId, docId }: CommentComposerProps) {
	const qc = useQueryClient();
	const [text, setText] = useState("");

	const mutation = useMutation({
		mutationFn: (t: string) => addDocComment(projectId, docId, t),
		onSuccess: () => {
			qc.invalidateQueries({
				queryKey: docQueryKeys.activities(projectId, docId),
			});
			setText("");
		},
	});

	const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
		if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
			e.preventDefault();
			if (text.trim()) mutation.mutate(text.trim());
		}
	};

	return (
		<div className="shrink-0 border-t border-border/25 p-3 bg-background/50">
			<div className="flex items-end gap-2 rounded-xl border border-border/30 bg-card/80 px-3 py-2.5 transition-all duration-200 focus-within:border-primary/25 focus-within:shadow-sm focus-within:shadow-primary/5">
				<textarea
					aria-label="Comment"
					placeholder="Add a comment…"
					value={text}
					onChange={(e) => setText(e.target.value)}
					onKeyDown={handleKeyDown}
					className="flex-1 resize-none bg-transparent text-[13px] outline-none placeholder:text-muted-foreground/55 leading-relaxed min-h-10"
				/>
				<button
					type="button"
					className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-sm hover:bg-primary/90 disabled:opacity-40 transition-all duration-150"
					disabled={!text.trim() || mutation.isPending}
					onClick={() => mutation.mutate(text.trim())}
				>
					<Send className="size-3" />
				</button>
			</div>
			<p className="text-[10px] text-muted-foreground/45 mt-1.5 px-1">
				Ctrl+Enter to send
			</p>
		</div>
	);
}

// ── Main pane — side panel structure per design system ─────────────────────────

export function DocActivityPane({ projectId, docId }: DocActivityPaneProps) {
	const { data: activities = [] } = useQuery(
		docActivitiesQueryOptions(projectId, docId),
	);

	// Sort ascending by created_at
	const sorted = [...activities].sort(
		(a, b) =>
			new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
	);

	return (
		<div className="flex w-full flex-col h-full bg-muted/10 border-l border-border/25">
			{/* Header — side panel pattern */}
			<div className="flex shrink-0 items-center gap-2.5 border-b border-border/25 px-5 py-3 bg-muted/20">
				<MessageSquare className="size-4 text-muted-foreground/70" />
				<span className="text-[13px] font-semibold text-foreground/80">
					Activity
				</span>
				{sorted.length > 0 && (
					<span className="rounded-full bg-muted/60 px-2 py-0.5 text-[10px] font-bold text-muted-foreground/70 tabular-nums ml-auto">
						{sorted.length}
					</span>
				)}
			</div>

			{/* Activity list */}
			<ScrollArea className="flex-1 px-4 py-4">
				<div className="space-y-4">
					{sorted.length === 0 && (
						<div className="flex flex-col items-center py-8 text-muted-foreground/40">
							<MessageSquare className="size-5 mb-2" />
							<p className="text-[12px] font-medium">No activity yet</p>
						</div>
					)}
					{sorted.map((a) => (
						<ActivityItem
							key={a.id}
							activity={a}
							projectId={projectId}
							docId={docId}
						/>
					))}
				</div>
			</ScrollArea>

			{/* Comment composer */}
			<CommentComposer projectId={projectId} docId={docId} />
		</div>
	);
}
