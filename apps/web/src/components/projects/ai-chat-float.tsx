import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bot, Loader2, Plus, Search, Send, X } from "lucide-react";
import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
	agentsQueryOptions,
	conversationsQueryOptions,
	nlQuery,
	startChatSession,
	type Agent,
	type AgentConversation,
	type NLQueryResult,
} from "@/lib/agent-api";
import { cn } from "@/lib/utils";
import { ConversationView } from "./agents/conversation-view";

// ── Types ─────────────────────────────────────────────────────────────────────

type ChatPhase =
	| { kind: "compose" }
	| { kind: "conversation"; conversationId: string };

interface AIChatFloatProps {
	projectId: string;
}

// ── Component ─────────────────────────────────────────────────────────────────

export function AIChatFloat({ projectId }: AIChatFloatProps) {
	const [open, setOpen] = useState(false);
	const [phase, setPhase] = useState<ChatPhase>({ kind: "compose" });
	const [agentId, setAgentId] = useState<string>("");
	const [message, setMessage] = useState("");
	const [queryMode, setQueryMode] = useState(false);
	const [nlQueryResult, setNLQueryResult] = useState<NLQueryResult | null>(null);
	const textareaRef = useRef<HTMLTextAreaElement>(null);

	const qc = useQueryClient();
	const { data: agents = [], isLoading: agentsLoading } = useQuery(
		agentsQueryOptions(projectId),
	);

	const { data: conversations = [] } = useQuery(
		conversationsQueryOptions(projectId),
	);

	const sendMut = useMutation({
		mutationFn: () =>
			startChatSession(projectId, agentId, { message: message.trim() }),
		onSuccess: (result) => {
			setPhase({
				kind: "conversation",
				conversationId: result.conversation.id,
			});
			setMessage("");
			void qc.invalidateQueries({
				queryKey: ["projects", projectId, "conversations"],
			});
		},
	});

	const nlQueryMut = useMutation({
		mutationFn: () => nlQuery(projectId, message.trim()),
		onSuccess: (result) => {
			setNLQueryResult(result);
		},
	});

	function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
		if (e.key === "Enter" && !e.shiftKey) {
			e.preventDefault();
			if (queryMode) {
				if (message.trim()) nlQueryMut.mutate();
			} else if (canSend) {
				sendMut.mutate();
			}
		}
	}

	function handleNewConversation() {
		setPhase({ kind: "compose" });
		setMessage("");
		setNLQueryResult(null);
		setQueryMode(false);
		setTimeout(() => textareaRef.current?.focus(), 50);
	}

	const canSend = !!agentId && message.trim().length > 0 && !sendMut.isPending;

	return (
		<>
			{/* Floating trigger button */}
			<button
				type="button"
				aria-label="Chat with AI Agent"
				onClick={() => setOpen((o) => !o)}
				className={cn(
					"fixed bottom-6 right-6 z-40 flex size-12 items-center justify-center rounded-full shadow-lg transition-all hover:scale-105",
					open
						? "bg-muted text-foreground border border-border"
						: "bg-primary text-primary-foreground hover:bg-primary/90",
				)}
			>
				{open ? <X className="size-5" /> : <Bot className="size-5" />}
			</button>

			{/* Chat panel */}
			{open && (
				<div className="fixed bottom-20 right-6 z-40 flex w-95 flex-col overflow-hidden rounded-2xl border border-border/60 bg-background shadow-2xl">
					{/* Panel header */}
					<div className="flex shrink-0 items-center justify-between border-b border-border/40 bg-muted/30 px-4 py-3">
						<div className="flex items-center gap-2">
							<Bot className="size-4 text-primary" />
							<span className="text-sm font-semibold">
								{queryMode ? "Search Tasks" : "Chat with AI Agent"}
							</span>
						</div>
						<div className="flex items-center gap-1">
							{phase.kind === "compose" && (
								<button
									type="button"
									onClick={() => {
										setQueryMode((m) => !m);
										setNLQueryResult(null);
									}}
									className={cn(
										"flex size-7 items-center justify-center rounded-md transition-all duration-150",
										queryMode
											? "bg-primary/10 text-primary"
											: "text-muted-foreground/60 hover:text-foreground hover:bg-muted/60",
									)}
									title={queryMode ? "Switch to chat" : "Search tasks with natural language"}
								>
									<Search className="size-3.5" />
								</button>
							)}
							{phase.kind === "conversation" && (
								<Button
									size="sm"
									variant="outline"
									className="h-7 gap-1.5 text-xs"
									onClick={handleNewConversation}
								>
									<Plus className="size-3" />
									New conversation
								</Button>
							)}
						</div>
					</div>

					{phase.kind === "compose" ? (
					<>
							{queryMode && nlQueryResult && (
								<NLQueryResultPanel result={nlQueryResult} />
							)}
							{queryMode ? (
								<div className="flex flex-col gap-3 p-4">
									<div className="space-y-1.5">
										<p className="text-xs font-medium text-muted-foreground">
											Ask in plain English
											<span className="ml-1.5 font-normal opacity-50">
												(Enter to search, Shift+Enter for newline)
											</span>
										</p>
										<Textarea
											ref={textareaRef}
											placeholder='e.g. "Show high priority tasks without assignee"'
											value={message}
											onChange={(e) => setMessage(e.target.value)}
											onKeyDown={(e) => {
												if (e.key === "Enter" && !e.shiftKey) {
													e.preventDefault();
													if (message.trim()) nlQueryMut.mutate();
												}
											}}
											rows={3}
											className="resize-none text-sm"
										/>
									</div>
									{nlQueryMut.error && (
										<p className="text-xs text-destructive">{nlQueryMut.error.message}</p>
									)}
									<Button
										className="w-full"
										onClick={() => nlQueryMut.mutate()}
										disabled={!message.trim() || nlQueryMut.isPending}
									>
										{nlQueryMut.isPending ? (
											<Loader2 className="size-4 animate-spin" />
										) : (
											<Search className="size-4" />
										)}
										Search
									</Button>
								</div>
							) : (
								<ComposeForm
									agents={agents}
									conversations={conversations}
									agentsLoading={agentsLoading}
									agentId={agentId}
									onAgentChange={setAgentId}
									message={message}
									onMessageChange={setMessage}
									onKeyDown={handleKeyDown}
									textareaRef={textareaRef}
									canSend={canSend}
									isPending={sendMut.isPending}
									onSend={() => sendMut.mutate()}
									error={sendMut.error}
								/>
							)}
						/>
							)}
						</>
					) : (
						<div className="h-110">
							<ConversationView
								projectId={projectId}
								conversationId={phase.conversationId}
							/>
						</div>
					)}
				</div>
			)}
		</>
	);
}

// ── NL Query Result Panel ──────────────────────────────────────────────────────

function NLQueryResultPanel({ result }: { result: NLQueryResult }) {
	return (
		<div className="p-4 space-y-3">
			<div className="rounded-lg border border-primary/20 bg-primary/5 px-3 py-2">
				<p className="text-[11px] font-semibold text-muted-foreground/70 uppercase tracking-wider mb-0.5">
					Interpretation
				</p>
				<p className="text-[13px] text-foreground leading-relaxed">
					{result.interpretation}
				</p>
			</div>

			{result.filters.length > 0 && (
				<div>
					<p className="text-[11px] font-semibold text-muted-foreground/70 uppercase tracking-wider mb-1.5">
						Filters
					</p>
					<div className="space-y-1">
						{result.filters.map((f, i) => (
							<div
								key={i}
								className="flex items-center gap-2 rounded-md border border-border/30 bg-card/50 px-2.5 py-1.5"
							>
								<span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-mono font-medium text-muted-foreground">
									{f.field}
								</span>
								<span className="text-[11px] text-muted-foreground">{f.operator}</span>
								<span className="text-[11px] font-medium text-foreground">
									{Array.isArray(f.value) ? f.value.join(", ") : String(f.value ?? "")}
								</span>
							</div>
						))}
					</div>
				</div>
			)}

			{result.sort_by && (
				<div className="flex items-center gap-2 text-xs text-muted-foreground">
					<span className="text-[11px] font-semibold text-muted-foreground/70 uppercase">
						Sort
					</span>
					<span className="rounded bg-muted px-1.5 py-0.5 font-mono text-[10px]">
						{result.sort_by}
					</span>
					<span>{result.sort_order === "desc" ? "↓" : "↑"}</span>
				</div>
			)}

			{result.summary && (
				<div className="rounded-lg border border-border/30 bg-card/50 px-3 py-2">
					<p className="text-[12px] text-muted-foreground leading-relaxed">
						{result.summary}
					</p>
				</div>
			)}
		</div>
	);
}

// ── ComposeForm ───────────────────────────────────────────────────────────────

interface ComposeFormProps {
	agents: Agent[];
	conversations: AgentConversation[];
	agentsLoading: boolean;
	agentId: string;
	onAgentChange: (id: string) => void;
	message: string;
	onMessageChange: (msg: string) => void;
	onKeyDown: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void;
	textareaRef: React.RefObject<HTMLTextAreaElement | null>;
	canSend: boolean;
	isPending: boolean;
	onSend: () => void;
	error: Error | null;
}

function ComposeForm({
	agents,
	conversations,
	agentsLoading,
	agentId,
	onAgentChange,
	message,
	onMessageChange,
	onKeyDown,
	textareaRef,
	canSend,
	isPending,
	onSend,
	error,
}: ComposeFormProps) {
	const getAgentStatus = (aId: string) => {
		const working = conversations.some(
			(c) => c.agent_id === aId && c.status === "running",
		);
		return working ? "working" : "idle";
	};

	return (
		<div className="flex flex-col gap-3 p-4">
			{/* Agent selector */}
			<div className="space-y-1.5">
				<p className="text-xs font-medium text-muted-foreground">Agent</p>
				{agentsLoading ? (
					<div className="h-9 animate-pulse rounded-md bg-muted" />
				) : agents.length === 0 ? (
					<p className="text-xs text-muted-foreground">
						No agents configured for this project.
					</p>
				) : (
					<Select
						value={agentId}
						onValueChange={(v) => v && onAgentChange(v)}
						items={agents.map((a) => ({ value: a.id, label: a.name }))}
					>
						<SelectTrigger className="h-9 text-sm">
							<SelectValue placeholder="Select an agent…">
								{agentId && (() => {
									const selectedAgent = agents.find((a) => a.id === agentId);
									if (!selectedAgent) return undefined;
									const status = getAgentStatus(selectedAgent.id);
									return (
										<div className="flex items-center gap-2">
											<span
												className={cn(
													"size-1.5 rounded-full shrink-0",
													status === "working"
														? "bg-violet-500 animate-pulse"
														: "bg-emerald-500",
												)}
											/>
											<span>{selectedAgent.name}</span>
										</div>
									);
								})()}
							</SelectValue>
						</SelectTrigger>
						<SelectContent>
							{agents.map((agent) => {
								const status = getAgentStatus(agent.id);
								return (
									<SelectItem key={agent.id} value={agent.id}>
										<div className="flex items-center gap-2">
											<span
												className={cn(
													"size-1.5 rounded-full",
													status === "working"
														? "bg-violet-500 animate-pulse"
														: "bg-emerald-500",
												)}
											/>
											{agent.name}
										</div>
									</SelectItem>
								);
							})}
						</SelectContent>
					</Select>
				)}
			</div>

			{/* Message input */}
			<div className="space-y-1.5">
				<label
					htmlFor="chat-message"
					className="text-xs font-medium text-muted-foreground"
				>
					Message
					<span className="ml-1.5 font-normal opacity-50">
						(Enter to send, Shift+Enter for newline)
					</span>
				</label>
				<Textarea
					id="chat-message"
					ref={textareaRef}
					placeholder="What would you like the agent to help with?"
					value={message}
					onChange={(e) => onMessageChange(e.target.value)}
					onKeyDown={onKeyDown}
					rows={5}
					className="resize-none text-sm"
				/>
			</div>

			{/* Error */}
			{error && <p className="text-xs text-destructive">{error.message}</p>}

			{/* Send button */}
			<Button className="w-full" onClick={onSend} disabled={!canSend}>
				{isPending ? (
					<Loader2 className="size-4 animate-spin" />
				) : (
					<Send className="size-4" />
				)}
				Send
			</Button>
		</div>
	);
}
