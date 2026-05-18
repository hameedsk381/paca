import {
	type QueryKey,
	useMutation,
	useQuery,
	useQueryClient,
} from "@tanstack/react-query";
import {
	MessageSquare,
	MoreHorizontal,
	Pencil,
	Send,
	Trash2,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import {
	blocksToText,
	CommentDisplay,
	CommentEditor,
	type CommentEditorHandle,
} from "@/components/shared/comment-blocknote";
import { Button } from "@/components/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";

export interface ActivityEntry {
	id: string;
	actor_id?: string | null;
	actor_name: string;
	actor_username: string;
	activity_type: string;
	content: Record<string, unknown> | unknown[] | string | null;
	created_at: string;
	updated_at: string;
}

export interface ActivityPaneConfig<T extends ActivityEntry> {
	projectId: string;
	entityId: string;
	queryKey: QueryKey;
	queryFn: () => Promise<T[]>;
	addComment?: (blocks: unknown[]) => Promise<unknown>;
	updateComment?: (commentId: string, blocks: unknown[]) => Promise<unknown>;
	deleteComment?: (commentId: string) => Promise<void>;
	describeActivity: (entry: T) => string;
	getCommentBlocks: (content: T["content"]) => unknown[] | null;
	sortAscending?: boolean;
	nameMaps?: Record<string, Record<string, string>>;
}

export function ActivityPane<T extends ActivityEntry>({
	projectId,
	queryKey,
	queryFn,
	addComment,
	updateComment,
	deleteComment,
	describeActivity,
	getCommentBlocks,
	sortAscending = false,
}: ActivityPaneConfig<T>) {
	const editorRef = useRef<CommentEditorHandle>(null);
	const scrollAreaRef = useRef<HTMLDivElement>(null);
	const [editorFocused, setEditorFocused] = useState(false);
	const qc = useQueryClient();

	const { data: activities = [] } = useQuery({
		queryKey,
		queryFn,
	});

	const sorted = useMemo(() => {
		if (!sortAscending) return activities;
		return [...activities].sort(
			(a, b) =>
				new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
		);
	}, [activities, sortAscending]);

	useEffect(() => {
		const viewport = scrollAreaRef.current?.querySelector(
			'[data-slot="scroll-area-viewport"]',
		) as HTMLElement;
		if (viewport) {
			viewport.scrollTop = viewport.scrollHeight;
		}
	}, []);

	const addMutation = useMutation({
		mutationFn: (blocks: unknown[]) => {
			if (!addComment) return Promise.resolve();
			return addComment(blocks);
		},
		onSuccess: () => {
			editorRef.current?.clear();
			setEditorFocused(false);
			qc.invalidateQueries({ queryKey });
		},
	});

	const handleSend = () => {
		const blocks = editorRef.current?.getBlocks();
		if (!blocks || blocks.length === 0) return;
		const text = blocksToText(blocks).trim();
		if (!text) return;
		addMutation.mutate(blocks);
	};

	return (
		<div className="flex w-full lg:w-80 lg:shrink-0 flex-col h-full lg:overflow-hidden border-t lg:border-t-0 lg:border-l border-border/25 bg-muted/10">
			<div className="flex shrink-0 items-center gap-2.5 border-b border-border/25 px-5 py-3 bg-muted/20">
				<MessageSquare className="size-3.5 text-muted-foreground/70" />
				<span className="text-[12px] font-semibold text-muted-foreground uppercase tracking-wide">
					Activity
				</span>
				{sorted.length > 0 && (
					<span className="ml-auto rounded-full bg-muted/60 px-2 py-0.5 text-[10px] font-bold text-muted-foreground/70 tabular-nums">
						{sorted.length}
					</span>
				)}
			</div>

			<ScrollArea
				ref={scrollAreaRef}
				className="lg:flex-1 lg:min-h-0 px-4 py-4"
			>
				<div className="space-y-3">
					{sorted.length === 0 && (
						<div className="flex flex-col items-center py-8 text-muted-foreground/40">
							<MessageSquare className="size-6 mb-2" />
							<p className="text-[12px] font-medium">No activity yet</p>
						</div>
					)}
					{sorted.map((entry) => (
						<ActivityItemInner
							key={entry.id}
							entry={entry}
							describeActivity={describeActivity}
							getCommentBlocks={getCommentBlocks}
							updateComment={updateComment}
							deleteComment={deleteComment}
							queryKey={queryKey}
							projectId={projectId}
						/>
					))}
				</div>
			</ScrollArea>

			{addComment && (
				<div className="shrink-0 border-t border-border/25 p-3 space-y-1 bg-background/50">
					{/* biome-ignore lint/a11y/noStaticElementInteractions: wrapper captures focus/blur from BlockNote rich-text editor */}
					<div
						className={cn(
							"rounded-xl border border-border/30 bg-card/80 transition-all duration-200 overflow-hidden",
							editorFocused && "border-primary/25 shadow-sm shadow-primary/5",
							"[&_.bn-editor]:min-h-6 [&_.bn-editor]:max-h-48 [&_.bn-editor]:overflow-y-auto [&_.bn-editor]:py-1.5 [&_.bn-editor]:px-3 [&_.bn-editor]:text-[13px] [&_.bn-editor]:leading-relaxed",
						)}
						onFocus={() => setEditorFocused(true)}
						onBlur={(e) => {
							if (!e.currentTarget.contains(e.relatedTarget as Node)) {
								const blocks = editorRef.current?.getBlocks() ?? [];
								const text = blocksToText(blocks).trim();
								if (!text) setEditorFocused(false);
							}
						}}
					>
						<CommentEditor ref={editorRef} onSubmit={handleSend} projectId={projectId} />
					</div>
					<div className="flex items-center justify-between">
						{editorFocused && (
							<p className="text-[10px] text-muted-foreground/40 pl-1">
								⌘↵ to send
							</p>
						)}
						<button
							type="button"
							onClick={handleSend}
							disabled={addMutation.isPending}
							className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground disabled:opacity-40 hover:bg-primary/90 transition-all duration-150 shadow-sm disabled:shadow-none ml-auto"
						>
							<Send className="size-3" />
						</button>
					</div>
				</div>
			)}
		</div>
	);
}

function timeAgo(iso: string): string {
	const diff = Date.now() - new Date(iso).getTime();
	const mins = Math.floor(diff / 60000);
	if (mins < 1) return "just now";
	if (mins < 60) return `${mins}m ago`;
	const hrs = Math.floor(mins / 60);
	if (hrs < 24) return `${hrs}h ago`;
	return `${Math.floor(hrs / 24)}d ago`;
}

interface ActivityItemInnerProps<T extends ActivityEntry> {
	entry: T;
	describeActivity: (entry: T) => string;
	getCommentBlocks: (content: T["content"]) => unknown[] | null;
	updateComment?: (commentId: string, blocks: unknown[]) => Promise<unknown>;
	deleteComment?: (commentId: string) => Promise<void>;
	queryKey: QueryKey;
	projectId: string;
}

function ActivityItemInner<T extends ActivityEntry>({
	entry,
	describeActivity,
	getCommentBlocks,
	updateComment,
	deleteComment,
	queryKey,
	projectId,
}: ActivityItemInnerProps<T>) {
	const qc = useQueryClient();
	const [editing, setEditing] = useState(false);
	const editEditorRef = useRef<CommentEditorHandle>(null);
	const commentBlocks = getCommentBlocks(entry.content);

const isComment = entry.activity_type === "comment";
const displayName = entry.actor_name || entry.actor_username || "System";
const initial = displayName.slice(0, 1).toUpperCase();

const canEdit = isComment && !!updateComment;
const canDelete = isComment && !!deleteComment;

	const updateMutation = useMutation({
		mutationFn: (blocks: unknown[]) => {
			// biome-ignore lint/style/noNonNullAssertion: guarded by canEdit
			return updateComment!(entry.id, blocks);
		},
		onSuccess: () => {
			qc.invalidateQueries({ queryKey });
			setEditing(false);
		},
	});

	const deleteMutation = useMutation({
		mutationFn: () => {
			// biome-ignore lint/style/noNonNullAssertion: guarded by canDelete
			return deleteComment!(entry.id);
		},
		onSuccess: () => {
			qc.invalidateQueries({ queryKey });
		},
	});

	const handleSaveEdit = () => {
		const blocks = editEditorRef.current?.getBlocks();
		if (!blocks) return;
		const text = blocksToText(blocks).trim();
		if (!text) return;
		updateMutation.mutate(blocks);
	};

	return (
		<div className="flex gap-3">
			<div
				className={cn(
					"flex size-6 shrink-0 items-center justify-center rounded-full text-[10px] font-bold mt-0.5 ring-1",
					isComment
						? "bg-linear-to-br from-primary/20 to-primary/10 text-primary ring-primary/15"
						: "bg-muted/40 text-muted-foreground/80 ring-border/20",
				)}
			>
				{initial}
			</div>
			<div className="flex-1 min-w-0">
				{isComment ? (
					<div className="group rounded-xl rounded-tl-lg border border-border/25 bg-card/70 px-3.5 py-2.5">
						<div className="mb-1 flex items-center gap-2">
							<span className="text-[12px] font-semibold text-foreground">
								{displayName}
							</span>
							<span className="text-[10px] text-muted-foreground/50">
								{timeAgo(entry.created_at)}
							</span>
							{canEdit && canDelete && (
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
								<div className="rounded-lg border border-border/30 bg-muted/15 overflow-hidden [&_.bn-editor]:min-h-16 [&_.bn-editor]:text-[13px] [&_.bn-editor]:leading-relaxed">
									<CommentEditor
										ref={editEditorRef}
										initialBlocks={commentBlocks ?? []}
										onSubmit={handleSaveEdit}
										projectId={projectId}
									/>
								</div>
								<div className="flex gap-1.5">
									<Button
										size="sm"
										className="h-6 text-[11px] gap-1 rounded-md"
										onClick={handleSaveEdit}
										disabled={updateMutation.isPending}
									>
										Save
									</Button>
									<Button
										variant="ghost"
										size="sm"
										className="h-6 text-[11px] rounded-md"
										onClick={() => setEditing(false)}
									>
										Cancel
									</Button>
								</div>
							</div>
						) : commentBlocks && commentBlocks.length > 0 ? (
							<div className="[&_.bn-editor]:text-[13px] [&_.bn-editor]:leading-relaxed [&_.bn-editor]:p-0">
								<CommentDisplay blocks={commentBlocks} />
							</div>
						) : (
							<p className="text-[13px] text-foreground leading-relaxed">
								{blocksToText(commentBlocks ?? [])}
							</p>
						)}
					</div>
				) : (
					<div className="flex flex-wrap items-baseline gap-1.5 py-0.5">
						<span className="text-[12px] font-medium text-foreground/80">
							{displayName}
						</span>
						<span className="text-[12px] text-muted-foreground/70">
							{describeActivity(entry)}
						</span>
						<span className="text-[10px] text-muted-foreground/45">
							{timeAgo(entry.created_at)}
						</span>
					</div>
				)}
			</div>
		</div>
	);
}
