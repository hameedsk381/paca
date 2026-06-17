import "@blocknote/core/fonts/inter.css";
import "@blocknote/shadcn/style.css";

import { SideMenuController, useCreateBlockNote } from "@blocknote/react";
import { BlockNoteView } from "@blocknote/shadcn";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Bot, Sparkles, Wand2 } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { CustomSideMenu } from "@/components/shared/blocknote-custom-side-menu";
import { customSchema } from "@/components/shared/blocknote-schema";
import { MentionSuggestionMenus } from "@/components/shared/mention-suggestion-menus";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { useThemeMode } from "@/hooks/use-theme-mode";
import {
	agentsQueryOptions,
	aiAssistTask,
	writeTaskDescriptionWithAI,
} from "@/lib/agent-api";
import {
	getAttachmentDownloadURL,
	uploadAttachment,
} from "@/lib/attachment-api";
import { useMentionData } from "@/lib/mention-api";
import { cleanBlocks, cn } from "@/lib/utils";

type UpdateFn = (payload: { description?: unknown[] | null }) => void;

interface DescriptionSectionProps {
	description?: unknown[] | null;
	canEdit?: boolean;
	projectId?: string;
	taskId?: string;
	onUpdate?: UpdateFn;
}

/** Custom URI scheme used to store attachment references in the markdown. */
const ATTACHMENT_SCHEME = "attachment://";

export function DescriptionSection({
	description,
	canEdit = true,
	projectId,
	taskId,
	onUpdate,
}: DescriptionSectionProps) {
	const { resolvedMode } = useThemeMode();
	const { teamMembers, tasks, documents } = useMentionData(projectId);
	const [writeWithAIOpen, setWriteWithAIOpen] = useState(false);
	const [aiAssistOpen, setAIAssistOpen] = useState(false);
	const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);

	const { data: agents = [] } = useQuery({
		...agentsQueryOptions(projectId ?? ""),
		enabled: !!projectId && (writeWithAIOpen || aiAssistOpen),
	});

	const writeWithAIMutation = useMutation({
		mutationFn: () => {
			if (!projectId || !taskId || !selectedAgentId)
				throw new Error("missing context");
			return writeTaskDescriptionWithAI(projectId, taskId, selectedAgentId);
		},
		onSuccess: () => {
			setWriteWithAIOpen(false);
			setSelectedAgentId(null);
		},
	});

	const aiAssistMutation = useMutation({
		mutationFn: (title: string) => {
			if (!projectId) throw new Error("missing context");
			return aiAssistTask(projectId, title, selectedAgentId ?? undefined);
		},
		onSuccess: (result) => {
			setAIAssistOpen(false);
			setSelectedAgentId(null);
			const desc = result.description;
			if (desc && editor) {
				const blocks = editor.tryParseMarkdownToBlocks(desc);
				if (blocks) {
					editor.replaceBlocks(editor.document, blocks);
				}
			}
		},
	});

	// Tracks the last value we wrote to the API, to avoid redundant saves and
	// to skip external refetch updates that match what we already have.
	const lastSavedRef = useRef<string | null>(null);
	// Whether the editor has been initialized with the description content.
	const initializedRef = useRef(false);
	// Whether there are unsaved changes pending a blur-save.
	const pendingRef = useRef(false);
	// Whether the editor has finished initial content population.
	const readyRef = useRef(false);

	// Keep projectId / taskId in refs so the stable editor callbacks always
	// reference the latest prop values without recreating the editor.
	const projectIdRef = useRef(projectId);
	const taskIdRef = useRef(taskId);
	useEffect(() => {
		projectIdRef.current = projectId;
	}, [projectId]);
	useEffect(() => {
		taskIdRef.current = taskId;
	}, [taskId]);

	const editor = useCreateBlockNote({
		schema: customSchema,
		/**
		 * Called by BlockNote when the user inserts an image / file / video / audio.
		 * Uploads via the task attachment API and returns a stable custom URI.
		 */
		uploadFile: async (file: File) => {
			const pId = projectIdRef.current;
			const tId = taskIdRef.current;
			if (!pId || !tId) throw new Error("No project/task context for upload");
			const attachment = await uploadAttachment(pId, tId, file);
			// Store as a stable custom URI; presigned URL is fetched on-demand.
			return `${ATTACHMENT_SCHEME}${pId}/${tId}/${attachment.id}`;
		},

		/**
		 * Called by BlockNote whenever it needs to display a file URL.
		 * Converts our custom `attachment://` URI into a fresh presigned URL.
		 */
		resolveFileUrl: async (url: string) => {
			if (!url.startsWith(ATTACHMENT_SCHEME)) return url;
			// URI format: attachment://{projectId}/{taskId}/{attachmentId}
			const path = url.slice(ATTACHMENT_SCHEME.length);
			const [pId, tId, attachmentId] = path.split("/");
			if (!pId || !tId || !attachmentId) return url;
			return getAttachmentDownloadURL(pId, tId, attachmentId);
		},
	});

	// Populate the editor from BlockNote JSON whenever description changes
	// externally (initial load or server refetch that differs from what we saved).
	useEffect(() => {
		const normalized = description ?? null;
		const cleanedNormalized = cleanBlocks(normalized);
		// Stringify for stable comparison (array identity changes on every response)
		const normalizedStr = cleanedNormalized
			? JSON.stringify(cleanedNormalized)
			: null;
		if (initializedRef.current && normalizedStr === lastSavedRef.current)
			return;
		initializedRef.current = true;
		lastSavedRef.current = normalizedStr;
		readyRef.current = false;

		let blocks: Parameters<typeof editor.replaceBlocks>[1] | undefined;
		if (normalized && Array.isArray(normalized) && normalized.length > 0) {
			blocks = normalized as Parameters<typeof editor.replaceBlocks>[1];
		}
		editor.replaceBlocks(editor.document, blocks ?? []);
		queueMicrotask(() => {
			readyRef.current = true;
		});
	}, [description, editor]);

	const handleChange = useCallback(() => {
		if (!canEdit || !readyRef.current) return;
		// Track dirty state so blur can save without re-reading document
		pendingRef.current = true;
	}, [canEdit]);

	const save = useCallback(() => {
		if (!canEdit || !pendingRef.current) return;
		pendingRef.current = false;
		const blocks = editor.document;
		// Consider empty when there is only one empty paragraph block
		const isEmpty =
			blocks.length === 1 &&
			blocks[0].type === "paragraph" &&
			Array.isArray(blocks[0].content) &&
			blocks[0].content.length === 0;

		const value: unknown[] | null = isEmpty ? null : (blocks as unknown[]);
		const cleanedValue = cleanBlocks(value);
		const valueStr = cleanedValue ? JSON.stringify(cleanedValue) : null;
		if (valueStr !== lastSavedRef.current) {
			lastSavedRef.current = valueStr;
			onUpdate?.({ description: cleanedValue });
		}
	}, [canEdit, editor, onUpdate]);

	// Save when focus leaves the entire editor container (mirrors title onBlur).
	const handleBlur = useCallback(
		(e: React.FocusEvent<HTMLDivElement>) => {
			// relatedTarget is the element receiving focus next.
			// If it's still inside this container, it's an internal focus move — don't save.
			if (e.currentTarget.contains(e.relatedTarget as Node)) return;
			save();
		},
		[save],
	);

	return (
		<div className="space-y-3">
			<div className="flex items-center justify-between">
				<h3 className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground/70 flex items-center gap-2">
					<span>Description</span>
					<div className="flex-1 h-px bg-linear-to-r from-border/40 to-transparent" />
				</h3>
				{canEdit && (
					<div className="flex items-center gap-2">
						<button
							type="button"
							className="flex items-center gap-1.5 text-[11px] text-muted-foreground/60 hover:text-muted-foreground transition-colors duration-150 font-medium"
							onClick={() => setWriteWithAIOpen(true)}
						>
							<Sparkles className="size-3" />
							Write with AI
						</button>
						<span className="text-[11px] text-muted-foreground/30">·</span>
						<button
							type="button"
							className="flex items-center gap-1.5 text-[11px] text-muted-foreground/60 hover:text-muted-foreground transition-colors duration-150 font-medium"
							onClick={() => setAIAssistOpen(true)}
						>
							<Wand2 className="size-3" />
							AI Assist
						</button>
					</div>
				)}
			</div>

			{/* biome-ignore lint/a11y/noStaticElementInteractions: wrapper captures blur from BlockNote rich-text editor */}
			<div
				className="rounded-xl border border-border/25 bg-card/50 hover:border-border/50 transition-all duration-200 overflow-hidden [&_.bn-editor]:min-h-20 [&_.bn-editor]:py-3 [&_.bn-editor]:text-[14px] [&_.bn-editor]:leading-relaxed"
				onBlur={handleBlur}
			>
				<BlockNoteView
					editor={editor}
					editable={canEdit}
					onChange={handleChange}
					theme={resolvedMode}
					className="bn-shadcn"
					sideMenu={false}
				>
					<SideMenuController sideMenu={CustomSideMenu} />
					{canEdit && (
						<MentionSuggestionMenus
							editor={editor}
							teamMembers={teamMembers}
							tasks={tasks}
							documents={documents}
						/>
					)}
				</BlockNoteView>
			</div>

			<Dialog
				open={writeWithAIOpen}
				onOpenChange={(open) => {
					setWriteWithAIOpen(open);
					if (!open) setSelectedAgentId(null);
				}}
			>
				<DialogContent className="sm:max-w-md">
					<DialogHeader>
						<DialogTitle className="flex items-center gap-2">
							<Sparkles className="size-4 text-muted-foreground" />
							Write with AI
						</DialogTitle>
						<DialogDescription>
							Select an agent to write the task description.
						</DialogDescription>
					</DialogHeader>

					<div className="space-y-2 py-2">
						{agents.length === 0 ? (
							<p className="text-sm text-muted-foreground text-center py-4">
								No agents configured for this project.
							</p>
						) : (
							agents.map((agent) => (
								<button
									key={agent.id}
									type="button"
									onClick={() => setSelectedAgentId(agent.id)}
									className={cn(
										"w-full flex items-center gap-3 rounded-lg border px-3 py-2.5 text-left transition-all duration-150",
										selectedAgentId === agent.id
											? "border-primary/60 bg-primary/5 text-foreground"
											: "border-border/40 bg-card/50 hover:border-border/70 hover:bg-muted/30 text-muted-foreground hover:text-foreground",
									)}
								>
									<div className="flex size-7 shrink-0 items-center justify-center rounded-md bg-muted">
										<Bot className="size-3.5" />
									</div>
									<div className="min-w-0">
										<p className="text-sm font-medium leading-tight truncate">
											{agent.name}
										</p>
										<p className="text-[11px] text-muted-foreground/70 mt-0.5 truncate">
											@{agent.handle}
										</p>
									</div>
								</button>
							))
						)}
					</div>

					{writeWithAIMutation.error && (
						<p className="text-xs text-destructive">
							{writeWithAIMutation.error.message}
						</p>
					)}

					<DialogFooter>
						<Button
							variant="outline"
							size="sm"
							onClick={() => {
								setWriteWithAIOpen(false);
								setSelectedAgentId(null);
							}}
						>
							Cancel
						</Button>
						<Button
							size="sm"
							disabled={!selectedAgentId || writeWithAIMutation.isPending}
							onClick={() => writeWithAIMutation.mutate()}
						>
							{writeWithAIMutation.isPending ? (
								<>
									<Sparkles className="size-3 mr-1.5 animate-pulse" />
									Starting...
								</>
							) : (
								<>
									<Sparkles className="size-3 mr-1.5" />
									Write description
								</>
							)}
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>

			{/* AI Assist dialog — instant description generation */}
			<Dialog
				open={aiAssistOpen}
				onOpenChange={(open) => {
					setAIAssistOpen(open);
					if (!open) setSelectedAgentId(null);
				}}
			>
				<DialogContent className="sm:max-w-md">
					<DialogHeader>
						<DialogTitle className="flex items-center gap-2">
							<Wand2 className="size-4 text-muted-foreground" />
							AI Assist
						</DialogTitle>
						<DialogDescription>
							Instantly generate a description, acceptance criteria, and
							technical approach from the task title.
						</DialogDescription>
					</DialogHeader>

					{agents.length > 0 && (
						<div className="space-y-1.5 py-1">
							<p className="text-[11px] font-medium text-muted-foreground/60 uppercase tracking-wider">
								Agent (optional)
							</p>
							<div className="flex flex-wrap gap-1.5">
								<button
									type="button"
									onClick={() => setSelectedAgentId(null)}
									className={cn(
										"rounded-md border px-2.5 py-1 text-xs transition-all duration-150",
										!selectedAgentId
											? "border-primary/60 bg-primary/5 text-foreground"
											: "border-border/40 text-muted-foreground hover:border-border/70",
									)}
								>
									Auto
								</button>
								{agents.slice(0, 4).map((agent) => (
									<button
										key={agent.id}
										type="button"
										onClick={() => setSelectedAgentId(agent.id)}
										className={cn(
											"rounded-md border px-2.5 py-1 text-xs transition-all duration-150",
											selectedAgentId === agent.id
												? "border-primary/60 bg-primary/5 text-foreground"
												: "border-border/40 text-muted-foreground hover:border-border/70",
										)}
									>
										{agent.name}
									</button>
								))}
							</div>
						</div>
					)}

					{aiAssistMutation.error && (
						<p className="text-xs text-destructive">
							{aiAssistMutation.error.message}
						</p>
					)}

					{aiAssistMutation.data && (
						<div className="space-y-3 py-2 max-h-60 overflow-y-auto">
							{aiAssistMutation.data.acceptance_criteria.length > 0 && (
								<div>
									<p className="text-[11px] font-semibold text-muted-foreground/70 uppercase tracking-wider mb-1">
										Acceptance Criteria
									</p>
									<ul className="space-y-0.5">
										{aiAssistMutation.data.acceptance_criteria.map(
											(c, i) => (
												<li
													key={i}
													className="text-xs text-muted-foreground flex items-start gap-1.5"
												>
													<span className="text-primary/60 mt-0.5">•</span>
													{c}
												</li>
											),
										)}
									</ul>
								</div>
							)}
							{aiAssistMutation.data.technical_approach && (
								<div>
									<p className="text-[11px] font-semibold text-muted-foreground/70 uppercase tracking-wider mb-1">
										Technical Approach
									</p>
									<p className="text-xs text-muted-foreground leading-relaxed">
										{aiAssistMutation.data.technical_approach}
									</p>
								</div>
							)}
							{aiAssistMutation.data.suggested_labels.length > 0 && (
								<div>
									<p className="text-[11px] font-semibold text-muted-foreground/70 uppercase tracking-wider mb-1">
										Suggested Labels
									</p>
									<div className="flex flex-wrap gap-1">
										{aiAssistMutation.data.suggested_labels.map(
											(label, i) => (
												<span
													key={i}
													className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground"
												>
													{label}
												</span>
											),
										)}
									</div>
								</div>
							)}
						</div>
					)}

					<DialogFooter>
						<Button
							variant="outline"
							size="sm"
							onClick={() => {
								setAIAssistOpen(false);
								setSelectedAgentId(null);
							}}
						>
							Close
						</Button>
						<Button
							size="sm"
							disabled={aiAssistMutation.isPending}
							onClick={() => {
								const title =
									document.querySelector<HTMLTextAreaElement>(
										'[contenteditable]',
									)?.textContent ?? "";
								aiAssistMutation.mutate(title || "Task");
							}}
						>
							{aiAssistMutation.isPending ? (
								<>
									<Wand2 className="size-3 mr-1.5 animate-pulse" />
									Generating...
								</>
							) : aiAssistMutation.data ? (
								<>
									<Wand2 className="size-3 mr-1.5" />
									Regenerate
								</>
							) : (
								<>
									<Wand2 className="size-3 mr-1.5" />
									Generate
								</>
							)}
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</div>
	);
}
