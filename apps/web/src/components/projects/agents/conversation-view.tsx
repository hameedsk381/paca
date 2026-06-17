import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
	Bot,
	ChevronDown,
	ChevronRight,
	Code,
	FileText,
	GitBranch,
	GitPullRequest,
	Loader2,
	Square,
	Terminal,
	User,
	Wand2,
	Zap,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import {
	type AgentConversation,
	type AgentConversationEvent,
	CONVERSATION_STATUS_COLORS,
	CONVERSATION_STATUS_LABELS,
	conversationEventsQueryOptions,
	conversationQueryOptions,
	getConversationSummary,
	reviewConversationPR,
	analyzeConversationError,
	stopConversation,
} from "@/lib/agent-api";
import { cn } from "@/lib/utils";

// ── Message extraction ────────────────────────────────────────────────────────

interface ChatMessage {
	id: string;
	role: "agent" | "user" | "system";
	text: string;
	eventType: string;
	isToolCall?: boolean;
	toolName?: string;
	eventIndex: number;
	createdAt: string;
}

const THINKING_TYPES = new Set([
	"ThinkingEvent",
	"agent.thinkingevent",
	"agent.thinking",
	"thinking",
]);

// Extract plain text from a content block array [{type:"text", text:"..."}] or a bare string.
function extractContentText(content: unknown): string | null {
	if (Array.isArray(content)) {
		const parts = (content as Array<unknown>)
			.map((c) => {
				if (typeof c === "object" && c !== null && "text" in c) {
					const t = (c as { text: unknown }).text;
					return typeof t === "string" ? t : null;
				}
				return null;
			})
			.filter((t): t is string => t !== null && t.trim().length > 0);
		return parts.length > 0 ? parts.join("\n\n").trim() : null;
	}
	if (typeof content === "string" && content.trim().length > 0) {
		return content.trim();
	}
	return null;
}

// Returns 0, 1, or 2 messages for one event.
// ActionEvent may emit a thought bubble + a tool-call row.
function eventToChatMessages(ev: AgentConversationEvent): ChatMessage[] {
	const p = ev.payload;
	const t = ev.event_type;

	// Skip events that carry no user-visible content.
	if (
		t === "ConversationStateUpdateEvent" ||
		t === "SystemPromptEvent" ||
		t === "StreamingDeltaEvent"
	) {
		return [];
	}

	// ── User / agent text messages ─────────────────────────────────────────────
	if (t === "MessageEvent") {
		const llmMsg = p.llm_message as { content?: unknown } | undefined;
		const text =
			extractContentText(llmMsg?.content) ?? extractContentText(p.content);
		if (!text) return [];
		const role =
			ev.event_source === "user"
				? "user"
				: ev.event_source === "system"
					? "system"
					: "agent";
		return [
			{
				id: ev.id,
				role,
				text,
				eventType: t,
				isToolCall: false,
				eventIndex: ev.event_index,
				createdAt: ev.created_at,
			},
		];
	}

	// ── Agent action (tool call + optional visible thought) ────────────────────
	if (t === "ActionEvent") {
		const messages: ChatMessage[] = [];

		// The "thought" array contains what the agent says before the tool call.
		const thoughtText = extractContentText(p.thought);
		if (thoughtText) {
			messages.push({
				id: `${ev.id}-thought`,
				role: "agent",
				text: thoughtText,
				eventType: "MessageEvent",
				isToolCall: false,
				eventIndex: ev.event_index,
				createdAt: ev.created_at,
			});
		}

		// Tool-call row (always shown, even when thought is empty).
		const toolCall = p.tool_call as
			| { name?: string; arguments?: unknown }
			| undefined;
		const toolName =
			toolCall?.name ??
			(typeof p.tool_name === "string" ? p.tool_name : undefined);
		const expandedText =
			(typeof toolCall?.arguments === "string" ? toolCall.arguments : null) ??
			JSON.stringify(toolCall, null, 2) ??
			(typeof p.summary === "string" ? p.summary : null) ??
			toolName ??
			t;

		messages.push({
			id: ev.id,
			role: "agent",
			text: expandedText,
			eventType: t,
			isToolCall: true,
			toolName,
			eventIndex: ev.event_index,
			createdAt: ev.created_at,
		});

		return messages;
	}

	// ── Tool observation ───────────────────────────────────────────────────────
	if (t === "ObservationEvent") {
		const obs = p.observation as Record<string, unknown> | undefined;
		let text: string | null = null;
		if (obs) {
			text =
				extractContentText(obs.content) ??
				(typeof obs.message === "string" ? obs.message : null);
		}
		if (!text) {
			text =
				extractContentText(p.content) ??
				(typeof p.message === "string" ? p.message : null) ??
				(typeof p.output === "string" ? p.output : null);
		}
		if (!text) return [];
		return [
			{
				id: ev.id,
				role: "agent",
				text,
				eventType: "agent.observation",
				isToolCall: true,
				toolName: typeof p.tool_name === "string" ? p.tool_name : undefined,
				eventIndex: ev.event_index,
				createdAt: ev.created_at,
			},
		];
	}

	// ── Fallback for other / legacy event types ────────────────────────────────
	const text =
		extractContentText(p.content) ??
		extractContentText(p.thought) ??
		(typeof p.message === "string" ? p.message : null) ??
		(p.tool_call ? JSON.stringify(p.tool_call, null, 2) : null) ??
		(p.args ? JSON.stringify(p.args, null, 2) : null) ??
		(typeof p.output === "string" ? p.output : null);
	if (!text) return [];

	const role =
		ev.event_source === "user"
			? "user"
			: ev.event_source === "system"
				? "system"
				: "agent";
	const isObservation =
		t === "ObservationEvent" ||
		t === "agent.observation" ||
		t === "observation";
	const isToolCall =
		t === "ActionEvent" ||
		t === "agent.action" ||
		t === "action" ||
		isObservation;
	const toolCallObj = p.tool_call as { name?: string } | undefined;
	const toolName =
		toolCallObj?.name ??
		(typeof p.action === "string" ? p.action : undefined) ??
		(typeof p.tool === "string" ? p.tool : undefined) ??
		(typeof p.tool_name === "string" ? p.tool_name : undefined);

	return [
		{
			id: ev.id,
			role,
			text,
			eventType: isObservation ? "agent.observation" : t,
			isToolCall,
			toolName,
			eventIndex: ev.event_index,
			createdAt: ev.created_at,
		},
	];
}

// ── Sub-components ────────────────────────────────────────────────────────────

function ToolCallMessage({ msg }: { msg: ChatMessage }) {
	const [expanded, setExpanded] = useState(false);
	const isObservation =
		msg.eventType === "agent.observation" || msg.eventType === "observation";

	return (
		<div className="flex gap-3 my-1">
			<div className="flex size-6 shrink-0 items-center justify-center rounded-md bg-muted/60 text-muted-foreground mt-0.5">
				<Terminal className="size-3" />
			</div>
			<div className="flex-1 min-w-0">
				<button
					type="button"
					onClick={() => setExpanded((p) => !p)}
					className="flex items-center gap-1.5 text-[11px] text-muted-foreground/70 hover:text-foreground/70 transition-colors"
				>
					{expanded ? (
						<ChevronDown className="size-3" />
					) : (
						<ChevronRight className="size-3" />
					)}
					<span className="font-mono">
						{isObservation
							? "observation"
							: msg.toolName
								? `tool: ${msg.toolName}`
								: msg.eventType}
					</span>
				</button>
				{expanded && (
					<pre className="mt-1.5 rounded-lg border border-border/40 bg-muted/30 px-3 py-2 text-[11px] font-mono text-muted-foreground/80 overflow-x-auto whitespace-pre-wrap wrap-break-word">
						{msg.text}
					</pre>
				)}
			</div>
		</div>
	);
}

function ThinkingMessage({ msg }: { msg: ChatMessage }) {
	const [expanded, setExpanded] = useState(false);

	return (
		<div className="flex gap-3 my-1">
			<div className="flex size-6 shrink-0 items-center justify-center rounded-md bg-primary/5 text-primary/40 mt-0.5">
				<Zap className="size-3" />
			</div>
			<div className="flex-1 min-w-0">
				<button
					type="button"
					onClick={() => setExpanded((p) => !p)}
					className="flex items-center gap-1.5 text-[11px] text-muted-foreground/60 italic hover:text-foreground/60 transition-colors"
				>
					{expanded ? (
						<ChevronDown className="size-3" />
					) : (
						<ChevronRight className="size-3" />
					)}
					Thinking…
				</button>
				{expanded && (
					<p className="mt-1.5 text-[12px] text-muted-foreground/60 italic leading-relaxed border-l-2 border-border/30 pl-3">
						{msg.text}
					</p>
				)}
			</div>
		</div>
	);
}

function AgentBubble({ msg }: { msg: ChatMessage }) {
	return (
		<div className="flex gap-3">
			<div className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary mt-0.5">
				<Bot className="size-4" />
			</div>
			<div className="flex-1 min-w-0 max-w-[85%]">
				<div className="rounded-2xl rounded-tl-md bg-card border border-border/40 px-4 py-3 shadow-sm">
					<p className="text-[13px] leading-relaxed text-foreground whitespace-pre-wrap wrap-break-word">
						{msg.text}
					</p>
				</div>
				<p className="text-[10px] text-muted-foreground/40 mt-1 pl-1">
					{new Date(msg.createdAt).toLocaleTimeString([], {
						hour: "2-digit",
						minute: "2-digit",
					})}
				</p>
			</div>
		</div>
	);
}

function UserBubble({ msg }: { msg: ChatMessage }) {
	return (
		<div className="flex gap-3 flex-row-reverse">
			<div className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground mt-0.5">
				<User className="size-4" />
			</div>
			<div className="flex-1 min-w-0 max-w-[85%] flex flex-col items-end">
				<div className="rounded-2xl rounded-tr-md bg-primary text-primary-foreground px-4 py-3 shadow-sm">
					<p className="text-[13px] leading-relaxed whitespace-pre-wrap wrap-break-word">
						{msg.text}
					</p>
				</div>
				<p className="text-[10px] text-muted-foreground/40 mt-1 pr-1">
					{new Date(msg.createdAt).toLocaleTimeString([], {
						hour: "2-digit",
						minute: "2-digit",
					})}
				</p>
			</div>
		</div>
	);
}

function SystemNote({ msg }: { msg: ChatMessage }) {
	return (
		<div className="flex justify-center">
			<span className="text-[11px] text-muted-foreground/50 bg-muted/30 rounded-full px-3 py-0.5">
				{msg.text}
			</span>
		</div>
	);
}

function MessageItem({ msg }: { msg: ChatMessage }) {
	if (msg.isToolCall) return <ToolCallMessage msg={msg} />;
	if (THINKING_TYPES.has(msg.eventType)) return <ThinkingMessage msg={msg} />;
	if (msg.role === "user") return <UserBubble msg={msg} />;
	if (msg.role === "system") return <SystemNote msg={msg} />;
	return <AgentBubble msg={msg} />;
}

function TypingIndicator() {
	return (
		<div className="flex gap-3">
			<div className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
				<Bot className="size-4" />
			</div>
			<div className="rounded-2xl rounded-tl-md bg-card border border-border/40 px-4 py-3 shadow-sm">
				<div className="flex items-center gap-1">
					<span className="size-1.5 rounded-full bg-muted-foreground/40 animate-bounce [animation-delay:0ms]" />
					<span className="size-1.5 rounded-full bg-muted-foreground/40 animate-bounce [animation-delay:150ms]" />
					<span className="size-1.5 rounded-full bg-muted-foreground/40 animate-bounce [animation-delay:300ms]" />
				</div>
			</div>
		</div>
	);
}

// ── Controls ──────────────────────────────────────────────────────────────────

function ConversationControls({
	projectId,
	conversation,
}: {
	projectId: string;
	conversation: AgentConversation;
}) {
	const qc = useQueryClient();

	const invalidate = () => {
		qc.invalidateQueries({
			queryKey: ["projects", projectId, "conversations", conversation.id],
		});
		qc.invalidateQueries({
			queryKey: ["projects", projectId, "conversations"],
		});
	};

	const stopMut = useMutation({
		mutationFn: () => stopConversation(projectId, conversation.id),
		onSuccess: invalidate,
	});

	const isRunning = conversation.status === "running";

	if (!isRunning) return null;

	return (
		<div className="flex items-center gap-2">
			<Button
				size="sm"
				variant="outline"
				className="h-7 text-xs gap-1.5 text-destructive border-destructive/30 hover:bg-destructive/10"
				onClick={() => stopMut.mutate()}
				disabled={stopMut.isPending}
			>
				{stopMut.isPending ? (
					<Loader2 className="size-3 animate-spin" />
				) : (
					<Square className="size-3" />
				)}
				Stop
			</Button>
		</div>
	);
}

// ── Summary ────────────────────────────────────────────────────────────────────

function ConversationSummary({
	projectId,
	conversationId,
}: {
	projectId: string;
	conversationId: string;
}) {
	const { data, isLoading, error, refetch } = useQuery({
		queryKey: ["projects", projectId, "conversations", conversationId, "summary"],
		queryFn: () => getConversationSummary(projectId, conversationId),
		staleTime: 5 * 60 * 1000,
		retry: false,
	});

	if (isLoading) {
		return (
			<div className="px-5 py-3 border-b border-border/40 bg-muted/20 animate-pulse">
				<div className="h-4 w-48 rounded bg-muted-foreground/10" />
			</div>
		);
	}

	if (error || !data) {
		return (
			<div className="px-5 py-3 border-b border-border/40 bg-muted/20">
				<p className="text-xs text-muted-foreground">
					Failed to load summary.{" "}
					<button
						type="button"
						onClick={() => refetch()}
						className="underline hover:text-foreground"
					>
						Retry
					</button>
				</p>
			</div>
		);
	}

	return (
		<div className="border-b border-border/40 bg-muted/20 px-5 py-3 space-y-2.5 animate-rise-in">
			<p className="text-xs text-muted-foreground leading-relaxed">
				{data.summary}
			</p>
			{data.key_decisions.length > 0 && (
				<div>
					<p className="text-[11px] font-semibold text-muted-foreground/70 uppercase tracking-wider mb-1">
						Key Decisions
					</p>
					<ul className="space-y-0.5">
						{data.key_decisions.map((d, i) => (
							<li
								key={i}
								className="text-xs text-muted-foreground flex items-start gap-1.5"
							>
								<span className="text-primary/60 mt-0.5">•</span>
								{d}
							</li>
						))}
					</ul>
				</div>
			)}
			{data.files_changed.length > 0 && (
				<div>
					<p className="text-[11px] font-semibold text-muted-foreground/70 uppercase tracking-wider mb-1">
						Files Changed
					</p>
					<div className="flex flex-wrap gap-1">
						{data.files_changed.map((f, i) => (
							<span
								key={i}
								className="rounded-md bg-muted/80 px-2 py-0.5 text-[11px] font-mono text-muted-foreground"
							>
								{f}
							</span>
						))}
					</div>
				</div>
			)}
			{data.status && (
				<p className="text-[11px] text-muted-foreground/60">
					Status: {data.status}
				</p>
			)}
		</div>
	);
}

// ── Code Review ────────────────────────────────────────────────────────────────

function CodeReviewPanel({
	projectId,
	conversationId,
}: {
	projectId: string;
	conversationId: string;
}) {
	const { data, isLoading, error, refetch } = useQuery({
		queryKey: ["projects", projectId, "conversations", conversationId, "review"],
		queryFn: () => reviewConversationPR(projectId, conversationId),
		staleTime: 5 * 60 * 1000,
		retry: false,
	});

	if (isLoading) {
		return (
			<div className="px-5 py-3 border-b border-border/40 bg-muted/20 animate-pulse">
				<div className="h-4 w-48 rounded bg-muted-foreground/10" />
			</div>
		);
	}

	if (error || !data) {
		return (
			<div className="px-5 py-3 border-b border-border/40 bg-muted/20">
				<p className="text-xs text-muted-foreground">
					Failed to load code review.{" "}
					<button
						type="button"
						onClick={() => refetch()}
						className="underline hover:text-foreground"
					>
						Retry
					</button>
				</p>
			</div>
		);
	}

	const scoreColor =
		data.overall_score === "pass"
			? "text-emerald-500 border-emerald-500/30 bg-emerald-500/10"
			: data.overall_score === "pass_with_suggestions"
				? "text-amber-500 border-amber-500/30 bg-amber-500/10"
				: "text-destructive border-destructive/30 bg-destructive/10";

	return (
		<div className="border-b border-border/40 bg-muted/20 px-5 py-3 space-y-3 animate-rise-in">
			<div className="flex items-center gap-2">
				<p className="text-xs text-muted-foreground leading-relaxed flex-1">
					{data.summary}
				</p>
				{data.overall_score && (
					<span
						className={cn(
							"shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-semibold",
							scoreColor,
						)}
					>
						{data.overall_score.replace(/_/g, " ")}
					</span>
				)}
			</div>

			{data.issues.length > 0 && (
				<div className="space-y-1.5">
					{data.issues.map((issue, i) => (
						<div key={i} className="rounded-lg border border-border/30 bg-card/50 px-3 py-2 space-y-1">
							<div className="flex items-center gap-2">
								<span
									className={cn(
										"text-[10px] font-semibold uppercase shrink-0",
										issue.severity === "critical" && "text-destructive",
										issue.severity === "major" && "text-amber-500",
										issue.severity === "minor" && "text-blue-500",
										issue.severity === "suggestion" && "text-muted-foreground",
									)}
								>
									{issue.severity}
								</span>
								<span className="text-[11px] font-mono text-muted-foreground/70 truncate">
									{issue.file}
									{issue.line != null && `:${issue.line}`}
								</span>
							</div>
							<p className="text-[12px] text-muted-foreground leading-relaxed pl-1">
								{issue.description}
							</p>
							{issue.suggestion && (
								<p className="text-[11px] text-muted-foreground/70 pl-1 italic">
									Suggestion: {issue.suggestion}
								</p>
							)}
						</div>
					))}
				</div>
			)}

			{data.positive_feedback.length > 0 && (
				<div>
					<p className="text-[11px] font-semibold text-muted-foreground/70 uppercase tracking-wider mb-1">
						Positive Feedback
					</p>
					<ul className="space-y-0.5">
						{data.positive_feedback.map((fb, i) => (
							<li
								key={i}
								className="text-xs text-emerald-600 dark:text-emerald-400 flex items-start gap-1.5"
							>
								<span className="mt-0.5">✓</span>
								{fb}
							</li>
						))}
					</ul>
				</div>
			)}
		</div>
	);
}

// ── Error Analysis ────────────────────────────────────────────────────────────

function ErrorAnalysisPanel({
	projectId,
	conversationId,
}: {
	projectId: string;
	conversationId: string;
}) {
	const { data, isLoading, error, refetch } = useQuery({
		queryKey: ["projects", projectId, "conversations", conversationId, "error-analysis"],
		queryFn: () => analyzeConversationError(projectId, conversationId),
		staleTime: 5 * 60 * 1000,
		retry: false,
	});

	if (isLoading) {
		return (
			<div className="px-5 py-3 border-b border-border/40 bg-destructive/5 animate-pulse">
				<div className="h-4 w-48 rounded bg-muted-foreground/10" />
			</div>
		);
	}

	if (error || !data) {
		return (
			<div className="px-5 py-3 border-b border-border/40 bg-destructive/5">
				<p className="text-xs text-muted-foreground">
					Failed to analyze error.{" "}
					<button
						type="button"
						onClick={() => refetch()}
						className="underline hover:text-foreground"
					>
						Retry
					</button>
				</p>
			</div>
		);
	}

	const errorTypeColors: Record<string, string> = {
		timeout: "text-amber-500 border-amber-500/30 bg-amber-500/10",
		permission: "text-orange-500 border-orange-500/30 bg-orange-500/10",
		code_error: "text-destructive border-destructive/30 bg-destructive/10",
		infrastructure: "text-purple-500 border-purple-500/30 bg-purple-500/10",
		unknown: "text-muted-foreground border-border/40 bg-muted/30",
	};

	return (
		<div className="border-b border-border/40 bg-destructive/5 px-5 py-3 space-y-3 animate-rise-in">
			<div className="flex items-center gap-2">
				<span
					className={cn(
						"rounded-full border px-2 py-0.5 text-[10px] font-semibold",
						errorTypeColors[data.error_type] || errorTypeColors.unknown,
					)}
				>
					{data.error_type.replace(/_/g, " ")}
				</span>
				<p className="text-xs text-muted-foreground leading-relaxed flex-1">
					{data.error_summary}
				</p>
			</div>

			{data.root_cause && (
				<div className="rounded-lg border border-border/30 bg-card/50 px-3 py-2">
					<p className="text-[11px] font-semibold text-muted-foreground/70 uppercase tracking-wider mb-0.5">
						Root Cause
					</p>
					<p className="text-[12px] text-muted-foreground leading-relaxed">
						{data.root_cause}
					</p>
				</div>
			)}

			{data.suggested_actions.length > 0 && (
				<div className="space-y-1.5">
					<p className="text-[11px] font-semibold text-muted-foreground/70 uppercase tracking-wider">
						Suggested Actions
					</p>
					{data.suggested_actions.map((action, i) => (
						<div
							key={i}
							className="rounded-lg border border-border/30 bg-card/50 px-3 py-2 flex items-center gap-3"
						>
							<div className="flex-1 min-w-0">
								<p className="text-[12px] font-medium text-foreground leading-snug">
									{action.label}
								</p>
								<p className="text-[11px] text-muted-foreground leading-relaxed mt-0.5">
									{action.description}
								</p>
							</div>
							<span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground shrink-0">
								{action.type.replace(/_/g, " ")}
							</span>
						</div>
					))}
				</div>
			)}
		</div>
	);
}

// ── Main component ────────────────────────────────────────────────────────────

interface ConversationViewProps {
	projectId: string;
	conversationId: string;
}

export function ConversationView({
	projectId,
	conversationId,
}: ConversationViewProps) {
	const scrollRef = useRef<HTMLDivElement>(null);

	const { data: conversation, isLoading: convLoading } = useQuery(
		conversationQueryOptions(projectId, conversationId),
	);
	const { data: events = [], isLoading: eventsLoading } = useQuery(
		conversationEventsQueryOptions(projectId, conversationId),
	);

	const messages: ChatMessage[] = events.flatMap(eventToChatMessages);

	const tokenStats = useMemo(() => {
		let inputChars = 0;
		let outputChars = 0;

		for (const ev of events) {
			const p = ev.payload;
			const source = ev.event_source; // "agent", "user", "system"

			// Stringify payload to estimate total event payload length
			const payloadStr = JSON.stringify(p);

			if (source === "agent") {
				outputChars += payloadStr.length;
			} else {
				inputChars += payloadStr.length;
			}
		}

		// 1 token is roughly 4.2 characters on average for English / JSON.
		const inputTokens = Math.round(inputChars / 4.2);
		const outputTokens = Math.round(outputChars / 4.2);
		const totalTokens = inputTokens + outputTokens;

		// Average cost per 1M tokens (e.g. Claude 3.5 Sonnet: $3/M input, $15/M output)
		const cost = (inputTokens * 3.0 + outputTokens * 15.0) / 1_000_000;

		return {
			inputTokens,
			outputTokens,
			totalTokens,
			cost,
		};
	}, [events]);

	const [summaryOpen, setSummaryOpen] = useState(false);
	const [reviewOpen, setReviewOpen] = useState(false);
	const [errorAnalysisOpen, setErrorAnalysisOpen] = useState(false);

	// Scroll to bottom when new messages arrive
	// biome-ignore lint/correctness/useExhaustiveDependencies: events is needed to trigger scroll
	useEffect(() => {
		requestAnimationFrame(() => {
			const viewport = scrollRef.current?.querySelector(
				'[data-slot="scroll-area-viewport"]',
			) as HTMLElement;
			if (viewport) {
				viewport.scrollTop = viewport.scrollHeight;
			}
		});
	}, [events]);

	if (convLoading || eventsLoading) {
		return (
			<div className="flex flex-col h-full gap-4 p-6">
				<Skeleton className="h-10 w-full rounded-xl" />
				<div className="space-y-4 flex-1">
					{Array.from({ length: 4 }).map((_, i) => (
						// biome-ignore lint/suspicious/noArrayIndexKey: skeleton
						<Skeleton key={i} className="h-16 w-3/4 rounded-2xl" />
					))}
				</div>
			</div>
		);
	}

	if (!conversation) {
		return (
			<div className="flex flex-col h-full items-center justify-center text-muted-foreground/50 gap-3">
				<Bot className="size-10" />
				<p className="text-sm">Conversation not found</p>
			</div>
		);
	}

	const statusColor = CONVERSATION_STATUS_COLORS[conversation.status];
	const statusLabel = CONVERSATION_STATUS_LABELS[conversation.status];
	const isRunning = conversation.status === "running";

	return (
		<div className="flex flex-col h-full min-h-0">
			{/* Header */}
			<div className="shrink-0 border-b border-border/40 px-5 py-3 flex items-center gap-3 bg-background/80 backdrop-blur-sm">
				<div className="flex items-center gap-2 min-w-0 flex-1">
					<Bot className="size-4 text-primary shrink-0" />
					<span className="text-sm font-medium truncate">
						{conversation.trigger_type === "chat_message"
							? "Chat session"
							: "Task session"}
					</span>
					<Badge
						variant="outline"
						className={cn("text-[10px] font-semibold shrink-0", statusColor)}
					>
						{statusLabel}
					</Badge>
					{tokenStats.totalTokens > 0 && (
						<Badge
							variant="secondary"
							className="text-[10px] font-medium bg-muted/60 text-muted-foreground shrink-0 flex items-center gap-1 cursor-help animate-rise-in"
							title={`Input: ${tokenStats.inputTokens.toLocaleString()} | Output: ${tokenStats.outputTokens.toLocaleString()}`}
						>
							<Zap className="size-2.5 text-amber-500 fill-amber-500 shrink-0" />
							<span>
								{tokenStats.totalTokens.toLocaleString()} tokens ($
								{tokenStats.cost.toFixed(3)})
							</span>
						</Badge>
					)}
				</div>

				<div className="flex items-center gap-1.5 shrink-0">
					<button
						type="button"
						onClick={() => setSummaryOpen((o) => !o)}
						className={cn(
							"flex items-center gap-1 rounded-md border px-2 py-1 text-xs transition-all duration-150",
							summaryOpen
								? "border-primary/40 bg-primary/5 text-foreground"
								: "border-border/40 text-muted-foreground hover:border-border/70",
						)}
					>
						<FileText className="size-3" />
						Summary
						{summaryOpen ? (
							<ChevronDown className="size-3" />
						) : (
							<ChevronRight className="size-3" />
						)}
					</button>
					{conversation.pr_url && (
						<button
							type="button"
							onClick={() => setReviewOpen((o) => !o)}
							className={cn(
								"flex items-center gap-1 rounded-md border px-2 py-1 text-xs transition-all duration-150",
								reviewOpen
									? "border-primary/40 bg-primary/5 text-foreground"
									: "border-border/40 text-muted-foreground hover:border-border/70",
							)}
						>
							<Code className="size-3" />
							Review
							{reviewOpen ? (
								<ChevronDown className="size-3" />
							) : (
								<ChevronRight className="size-3" />
							)}
						</button>
					)}
					{conversation.status === "failed" && (
						<button
							type="button"
							onClick={() => setErrorAnalysisOpen((o) => !o)}
							className={cn(
								"flex items-center gap-1 rounded-md border px-2 py-1 text-xs transition-all duration-150",
								errorAnalysisOpen
									? "border-destructive/40 bg-destructive/5 text-destructive"
									: "border-border/40 text-muted-foreground hover:border-destructive/30 hover:text-destructive",
							)}
						>
							<Wand2 className="size-3" />
							Analyze
							{errorAnalysisOpen ? (
								<ChevronDown className="size-3" />
							) : (
								<ChevronRight className="size-3" />
							)}
						</button>
					)}
					{conversation.branch_name && (
						<span className="flex items-center gap-1 text-xs text-muted-foreground">
							<GitBranch className="size-3" />
							{conversation.branch_name}
						</span>
					)}
					{conversation.pr_url && (
						<a
							href={conversation.pr_url}
							target="_blank"
							rel="noreferrer"
							className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
						>
							<GitPullRequest className="size-3" />
							PR
						</a>
					)}
					<ConversationControls
						projectId={projectId}
						conversation={conversation}
					/>
				</div>
			</div>

			{/* Summary */}
			{summaryOpen && (
				<ConversationSummary
					projectId={projectId}
					conversationId={conversationId}
				/>
			)}

			{/* Code Review */}
			{reviewOpen && conversation?.pr_url && (
				<CodeReviewPanel
					projectId={projectId}
					conversationId={conversationId}
				/>
			)}

			{/* Error Analysis */}
			{errorAnalysisOpen && conversation?.status === "failed" && (
				<ErrorAnalysisPanel
					projectId={projectId}
					conversationId={conversationId}
				/>
			)}

			{/* Messages */}
			<ScrollArea ref={scrollRef} className="flex-1 min-h-0">
				<div className="px-5 py-5 space-y-4 max-w-3xl mx-auto">
					{messages.length === 0 && !isRunning ? (
						<div className="flex flex-col items-center justify-center gap-3 py-16 text-muted-foreground/40">
							<Bot className="size-10" />
							<p className="text-sm">No messages yet</p>
						</div>
					) : (
						<>
							{messages.map((msg) => (
								<MessageItem key={msg.id} msg={msg} />
							))}
							{isRunning && <TypingIndicator />}
						</>
					)}
				</div>
			</ScrollArea>

			{/* Footer */}
			{conversation.error_message && (
				<div className="shrink-0 border-t border-destructive/20 bg-destructive/5 px-5 py-3">
					<p className="text-xs text-destructive">
						{conversation.error_message}
					</p>
				</div>
			)}
		</div>
	);
}
