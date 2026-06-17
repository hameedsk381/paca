import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
	Bot,
	Check,
	Clock,
	Code2,
	GitBranch,
	GitPullRequest,
	Loader2,
	MessageSquare,
	Plus,
	Save,
	Server,
	Trash2,
	Wand2,
	Zap,
} from "lucide-react";
import { useMemo, useState } from "react";
import { ConversationView } from "@/components/projects/agents/conversation-view";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectSeparator,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "@/components/ui/sonner";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { useProjectPermissions } from "@/hooks/use-project-permissions";
import {
	type Agent,
	type AgentConversation,
	type AgentMCPServer,
	type AgentSkill,
	addMCPServer,
	addSkill,
	agentMCPServersQueryOptions,
	agentQueryOptions,
	agentSkillsQueryOptions,
	CONVERSATION_STATUS_COLORS,
	CONVERSATION_STATUS_LABELS,
	conversationsQueryOptions,
	deleteMCPServer,
	deleteSkill,
	llmModelsQueryOptions,
	updateAgent,
	updateMCPServer,
	updateSkill,
} from "@/lib/agent-api";
import { cn } from "@/lib/utils";

export const Route = createFileRoute(
	"/_authenticated/projects/$projectId/agents/$agentId/",
)({
	validateSearch: (search: Record<string, unknown>): { tab?: string } => {
		return {
			tab: (search.tab as string) || undefined,
		};
	},
	loader: async ({
		context: { queryClient },
		params: { projectId, agentId },
	}) => {
		await Promise.all([
			queryClient.ensureQueryData(agentQueryOptions(projectId, agentId)),
			queryClient.ensureQueryData(
				agentMCPServersQueryOptions(projectId, agentId),
			),
			queryClient.ensureQueryData(agentSkillsQueryOptions(projectId, agentId)),
			queryClient.ensureQueryData(
				conversationsQueryOptions(projectId, agentId),
			),
			queryClient.ensureQueryData(llmModelsQueryOptions),
		]);
	},
	component: AgentDetailPage,
});

type Tab = "overview" | "mcp-servers" | "skills" | "conversations";

const CUSTOM = "__custom__";

// ── Overview Tab ──────────────────────────────────────────────────────────────

function OverviewTab({
	agent,
	projectId,
	canWrite,
}: {
	agent: Agent;
	projectId: string;
	canWrite: boolean;
}) {
	const qc = useQueryClient();
	const { data: llmModels = {} } = useQuery(llmModelsQueryOptions);

	const providers = Object.keys(llmModels);

	// Provider select: if agent's provider is known, use it directly; otherwise custom mode
	const knownProvider =
		providers.length > 0 && providers.includes(agent.llm_provider);
	const [providerSelect, setProviderSelect] = useState(
		knownProvider
			? agent.llm_provider
			: agent.llm_provider
				? CUSTOM
				: "anthropic",
	);
	const [customProvider, setCustomProvider] = useState(
		knownProvider ? "" : agent.llm_provider,
	);

	// Model select: check against the provider's model list once loaded
	const initialModels = llmModels[agent.llm_provider]?.models ?? [];
	const knownModel = initialModels.includes(agent.llm_model);
	const [modelSelect, setModelSelect] = useState(
		knownModel ? agent.llm_model : agent.llm_model ? CUSTOM : "",
	);
	const [customModel, setCustomModel] = useState(
		knownModel ? "" : agent.llm_model,
	);

	const [name, setName] = useState(agent.name);
	const [llmApiKey, setLlmApiKey] = useState("");
	const [llmBaseUrl, setLlmBaseUrl] = useState(agent.llm_base_url ?? "");
	const [systemPrompt, setSystemPrompt] = useState(agent.system_prompt);
	const [taskTriggerPrompt, setTaskTriggerPrompt] = useState(
		agent.task_trigger_prompt,
	);
	const [docCommentTriggerPrompt, setDocCommentTriggerPrompt] = useState(
		agent.doc_comment_trigger_prompt,
	);
	const [chatTriggerPrompt, setChatTriggerPrompt] = useState(
		agent.chat_trigger_prompt,
	);
	const [descriptionWriteTriggerPrompt, setDescriptionWriteTriggerPrompt] =
		useState(agent.description_write_trigger_prompt);
	const [canClone, setCanClone] = useState(agent.can_clone_repos);
	const [committerName, setCommitterName] = useState(agent.git_committer_name);
	const [committerEmail, setCommitterEmail] = useState(
		agent.git_committer_email,
	);

	// Derived final values sent to the API
	const llmProvider =
		providerSelect === CUSTOM ? customProvider.trim() : providerSelect;
	const llmModel = modelSelect === CUSTOM ? customModel.trim() : modelSelect;

	const handleProviderChange = (v: string | null) => {
		if (!v) return;
		setProviderSelect(v);
		if (v !== CUSTOM) {
			const info = llmModels[v];
			setLlmBaseUrl(info?.base_url ?? "");
			const firstModel = info?.models?.[0] ?? "";
			setModelSelect(firstModel || CUSTOM);
			if (!firstModel) setCustomModel("");
		} else {
			setModelSelect(CUSTOM);
			setCustomModel("");
		}
	};

	const availableModels: string[] =
		providerSelect !== CUSTOM ? (llmModels[providerSelect]?.models ?? []) : [];

	const isDirty =
		name !== agent.name ||
		llmProvider !== agent.llm_provider ||
		llmModel !== agent.llm_model ||
		llmApiKey !== "" ||
		llmBaseUrl !== (agent.llm_base_url ?? "") ||
		systemPrompt !== agent.system_prompt ||
		taskTriggerPrompt !== agent.task_trigger_prompt ||
		docCommentTriggerPrompt !== agent.doc_comment_trigger_prompt ||
		chatTriggerPrompt !== agent.chat_trigger_prompt ||
		descriptionWriteTriggerPrompt !== agent.description_write_trigger_prompt ||
		canClone !== agent.can_clone_repos ||
		committerName !== agent.git_committer_name ||
		committerEmail !== agent.git_committer_email;

	const saveMutation = useMutation({
		mutationFn: () =>
			updateAgent(projectId, agent.id, {
				name: name.trim(),
				llm_provider: llmProvider,
				llm_model: llmModel,
				...(llmApiKey ? { llm_api_key: llmApiKey } : {}),
				llm_base_url: llmBaseUrl,
				system_prompt: systemPrompt,
				task_trigger_prompt: taskTriggerPrompt,
				doc_comment_trigger_prompt: docCommentTriggerPrompt,
				chat_trigger_prompt: chatTriggerPrompt,
				description_write_trigger_prompt: descriptionWriteTriggerPrompt,
				can_clone_repos: canClone,
				git_committer_name: committerName.trim(),
				git_committer_email: committerEmail.trim(),
			}),
		onSuccess: (updated) => {
			qc.setQueryData(["projects", projectId, "agents", agent.id], updated);
			setLlmApiKey("");
		},
	});

	const canSave =
		isDirty &&
		!!llmProvider &&
		!!llmModel &&
		!!llmBaseUrl.trim() &&
		!saveMutation.isPending;

	return (
		<div className="space-y-6 max-w-2xl">
			<div className="space-y-1.5">
				<Label>Name</Label>
				<Input
					value={name}
					onChange={(e) => setName(e.target.value)}
					disabled={!canWrite}
				/>
			</div>

			<Separator />

			<div>
				<p className="text-sm font-medium mb-3">LLM Configuration</p>
				<div className="grid grid-cols-2 gap-3">
					<div className="space-y-1.5">
						<Label>Provider</Label>
						<Select
							value={providerSelect}
							onValueChange={handleProviderChange}
							disabled={!canWrite}
						>
							<SelectTrigger>
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								{providers.map((p) => (
									<SelectItem key={p} value={p}>
										{p}
									</SelectItem>
								))}
								<SelectSeparator />
								<SelectItem value={CUSTOM}>Custom…</SelectItem>
							</SelectContent>
						</Select>
						{providerSelect === CUSTOM && (
							<Input
								placeholder="my-provider"
								value={customProvider}
								onChange={(e) => setCustomProvider(e.target.value)}
								disabled={!canWrite}
							/>
						)}
					</div>
					<div className="space-y-1.5">
						<Label>Model</Label>
						{providerSelect === CUSTOM ? (
							<Input
								placeholder="my-model-name"
								value={customModel}
								onChange={(e) => setCustomModel(e.target.value)}
								disabled={!canWrite}
							/>
						) : (
							<>
								<Select
									value={modelSelect}
									onValueChange={(v) => v && setModelSelect(v)}
									disabled={!canWrite}
								>
									<SelectTrigger>
										<SelectValue />
									</SelectTrigger>
									<SelectContent>
										{availableModels.map((m) => (
											<SelectItem key={m} value={m}>
												{m}
											</SelectItem>
										))}
										<SelectSeparator />
										<SelectItem value={CUSTOM}>Custom…</SelectItem>
									</SelectContent>
								</Select>
								{modelSelect === CUSTOM && (
									<Input
										placeholder="my-model-name"
										value={customModel}
										onChange={(e) => setCustomModel(e.target.value)}
										disabled={!canWrite}
									/>
								)}
							</>
						)}
					</div>
				</div>
				<div className="space-y-1.5 mt-3">
					<Label>
						API Key Update{" "}
						<span className="text-muted-foreground font-normal text-xs">
							(leave blank to keep current)
						</span>
					</Label>
					<Input
						type="password"
						placeholder="sk-ant-…"
						value={llmApiKey}
						onChange={(e) => setLlmApiKey(e.target.value)}
						disabled={!canWrite}
					/>
				</div>
				<div className="space-y-1.5 mt-3">
					<Label>
						Base URL <span className="text-destructive">*</span>
					</Label>
					<Input
						placeholder="https://api.openai.com/v1"
						value={llmBaseUrl}
						onChange={(e) => setLlmBaseUrl(e.target.value)}
						disabled={!canWrite}
					/>
				</div>
			</div>

			<Separator />

			<div className="space-y-1.5">
				<Label>System Prompt</Label>
				<Textarea
					value={systemPrompt}
					onChange={(e) => setSystemPrompt(e.target.value)}
					rows={5}
					disabled={!canWrite}
					className="font-mono text-xs"
				/>
			</div>

			<div className="space-y-2">
				<div>
					<Label className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
						Auto-appended trigger prompts
					</Label>
					<p className="mt-1 text-[10px] text-muted-foreground">
						Automatically appended to the system prompt at runtime based on how
						the agent is invoked.
					</p>
				</div>
				{(
					[
						[
							"Task assignment / task comment",
							taskTriggerPrompt,
							setTaskTriggerPrompt,
						],
						[
							"Documentation comment @mention",
							docCommentTriggerPrompt,
							setDocCommentTriggerPrompt,
						],
						["Direct chat", chatTriggerPrompt, setChatTriggerPrompt],
						[
							"Write task description with AI",
							descriptionWriteTriggerPrompt,
							setDescriptionWriteTriggerPrompt,
						],
					] as [string, string, (v: string) => void][]
				).map(([label, value, setValue]) => (
					<details
						key={label}
						className="group rounded-md border border-border/60 bg-muted/20"
					>
						<summary className="flex cursor-pointer select-none items-center gap-2 px-3 py-2 text-xs font-medium">
							{label}
						</summary>
						<div className="border-t border-border/60 px-3 py-2">
							<Textarea
								value={value}
								onChange={(e) => setValue(e.target.value)}
								rows={6}
								disabled={!canWrite}
								className="font-mono text-[10px] leading-relaxed"
							/>
						</div>
					</details>
				))}
			</div>

			<Separator />

			<div>
				<p className="text-sm font-medium mb-3">Capabilities</p>
				<div className="space-y-3">
					<div className="flex items-center justify-between">
						<div>
							<p className="text-sm">Clone repositories</p>
							<p className="text-xs text-muted-foreground">
								Allow agent to git clone repos locally
							</p>
						</div>
						<Switch
							checked={canClone}
							onCheckedChange={setCanClone}
							disabled={!canWrite}
						/>
					</div>
				</div>
			</div>

			<Separator />

			<div>
				<p className="text-sm font-medium mb-1">Git committer identity</p>
				<p className="text-xs text-muted-foreground mb-3">
					Name and email used for commits made by this agent.
				</p>
				<div className="grid grid-cols-2 gap-3">
					<div className="space-y-1.5">
						<Label>Committer name</Label>
						<Input
							value={committerName}
							onChange={(e) => setCommitterName(e.target.value)}
							disabled={!canWrite}
							placeholder="paca-agent"
						/>
					</div>
					<div className="space-y-1.5">
						<Label>Committer email</Label>
						<Input
							type="email"
							value={committerEmail}
							onChange={(e) => setCommitterEmail(e.target.value)}
							disabled={!canWrite}
							placeholder="paca-agent@users.noreply.github.com"
						/>
					</div>
				</div>
			</div>

			{canWrite && (
				<div className="flex items-center gap-3 pt-2">
					<Button onClick={() => saveMutation.mutate()} disabled={!canSave}>
						{saveMutation.isPending ? (
							<Loader2 className="size-4 mr-2 animate-spin" />
						) : (
							<Save className="size-4 mr-2" />
						)}
						Save changes
					</Button>
					{saveMutation.isSuccess && (
						<span className="flex items-center gap-1 text-xs text-emerald-600">
							<Check className="size-3" />
							Saved
						</span>
					)}
					{saveMutation.isError && (
						<span className="text-xs text-destructive">
							Failed to save. Please try again.
						</span>
					)}
				</div>
			)}
		</div>
	);
}

// ── MCP Servers Tab ───────────────────────────────────────────────────────────

function AddMCPServerDialog({
	projectId,
	agentId,
	open,
	onOpenChange,
}: {
	projectId: string;
	agentId: string;
	open: boolean;
	onOpenChange: (open: boolean) => void;
}) {
	const qc = useQueryClient();
	const [serverName, setServerName] = useState("");
	const [transport, setTransport] = useState<"stdio" | "sse" | "http">("stdio");
	const [command, setCommand] = useState("");
	const [args, setArgs] = useState("");
	const [url, setUrl] = useState("");

	const addMutation = useMutation({
		mutationFn: () =>
			addMCPServer(projectId, agentId, {
				server_name: serverName.trim(),
				transport,
				command: transport === "stdio" ? command.trim() || null : null,
				args:
					transport === "stdio"
						? args
								.split(/\s+/)
								.map((a) => a.trim())
								.filter(Boolean)
						: [],
				url: transport !== "stdio" ? url.trim() || null : null,
			}),
		onSuccess: () => {
			qc.invalidateQueries({
				queryKey: ["projects", projectId, "agents", agentId, "mcp-servers"],
			});
			onOpenChange(false);
			setServerName("");
			setCommand("");
			setArgs("");
			setUrl("");
		},
	});

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="max-w-md">
				<DialogHeader>
					<DialogTitle className="flex items-center gap-2">
						<Server className="size-4 text-primary" />
						Add MCP Server
					</DialogTitle>
					<DialogDescription>
						Connect an MCP server to extend the agent's capabilities.
					</DialogDescription>
				</DialogHeader>
				<div className="space-y-4 py-2">
					<div className="space-y-1.5">
						<Label>Server name</Label>
						<Input
							placeholder="filesystem"
							value={serverName}
							onChange={(e) => setServerName(e.target.value)}
						/>
					</div>
					<div className="space-y-1.5">
						<Label>Transport</Label>
						<Select
							value={transport}
							onValueChange={(v) => setTransport(v as typeof transport)}
						>
							<SelectTrigger>
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								<SelectItem value="stdio">stdio</SelectItem>
								<SelectItem value="sse">SSE</SelectItem>
								<SelectItem value="http">HTTP</SelectItem>
							</SelectContent>
						</Select>
					</div>
					{transport === "stdio" ? (
						<>
							<div className="space-y-1.5">
								<Label>Command</Label>
								<Input
									placeholder="npx"
									value={command}
									onChange={(e) => setCommand(e.target.value)}
								/>
							</div>
							<div className="space-y-1.5">
								<Label>
									Args{" "}
									<span className="text-muted-foreground font-normal text-xs">
										(space-separated)
									</span>
								</Label>
								<Input
									placeholder="-y @modelcontextprotocol/server-filesystem /tmp"
									value={args}
									onChange={(e) => setArgs(e.target.value)}
								/>
							</div>
						</>
					) : (
						<div className="space-y-1.5">
							<Label>URL</Label>
							<Input
								placeholder="https://mcp.example.com/sse"
								value={url}
								onChange={(e) => setUrl(e.target.value)}
							/>
						</div>
					)}
				</div>
				<DialogFooter>
					<Button variant="outline" onClick={() => onOpenChange(false)}>
						Cancel
					</Button>
					<Button
						onClick={() => addMutation.mutate()}
						disabled={!serverName.trim() || addMutation.isPending}
					>
						{addMutation.isPending ? (
							<Loader2 className="size-4 animate-spin" />
						) : (
							"Add server"
						)}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}

function MCPServersTab({
	projectId,
	agentId,
	canWrite,
}: {
	projectId: string;
	agentId: string;
	canWrite: boolean;
}) {
	const qc = useQueryClient();
	const { data: servers = [] } = useQuery(
		agentMCPServersQueryOptions(projectId, agentId),
	);
	const [addOpen, setAddOpen] = useState(false);

	const toggleMutation = useMutation({
		mutationFn: (s: AgentMCPServer) =>
			updateMCPServer(projectId, agentId, s.id, {
				is_enabled: !s.is_enabled,
			}),
		onSuccess: () => {
			qc.invalidateQueries({
				queryKey: ["projects", projectId, "agents", agentId, "mcp-servers"],
			});
		},
	});

	const [serverToDelete, setServerToDelete] = useState<AgentMCPServer | null>(
		null,
	);

	const deleteMutation = useMutation({
		mutationFn: (id: string) => deleteMCPServer(projectId, agentId, id),
		onSuccess: () => {
			qc.invalidateQueries({
				queryKey: ["projects", projectId, "agents", agentId, "mcp-servers"],
			});
			toast.success("MCP server deleted");
			setServerToDelete(null);
		},
		onError: () => {
			toast.error("Failed to delete MCP server");
		},
	});

	return (
		<div className="space-y-4">
			<div className="flex items-center justify-between">
				<p className="text-sm text-muted-foreground">
					{servers.length} server{servers.length !== 1 && "s"} configured
				</p>
				{canWrite && (
					<Button size="sm" onClick={() => setAddOpen(true)}>
						<Plus className="size-4 mr-1.5" />
						Add server
					</Button>
				)}
			</div>

			{servers.length === 0 ? (
				<div className="flex flex-col items-center justify-center gap-3 py-14 rounded-xl border border-dashed border-border">
					<Server className="size-8 text-muted-foreground/40" />
					<p className="text-sm text-muted-foreground">No MCP servers added</p>
					{canWrite && (
						<Button
							size="sm"
							variant="outline"
							onClick={() => setAddOpen(true)}
						>
							<Plus className="size-3.5 mr-1" />
							Add your first server
						</Button>
					)}
				</div>
			) : (
				<div className="space-y-2">
					{servers.map((s) => (
						<div
							key={s.id}
							className="flex items-center justify-between gap-3 rounded-lg border border-border/60 bg-card px-4 py-3"
						>
							<div className="flex items-center gap-3 min-w-0">
								<Server className="size-4 text-muted-foreground shrink-0" />
								<div className="min-w-0">
									<p className="text-sm font-medium truncate">
										{s.server_name}
									</p>
									<p className="text-xs text-muted-foreground font-mono truncate">
										{s.transport}
										{s.command ? ` · ${s.command}` : ""}
										{s.url ? ` · ${s.url}` : ""}
									</p>
								</div>
							</div>
							<div className="flex items-center gap-2 shrink-0">
								<Switch
									checked={s.is_enabled}
									onCheckedChange={() => canWrite && toggleMutation.mutate(s)}
									disabled={!canWrite || toggleMutation.isPending}
								/>
								{canWrite && (
									<Button
										variant="ghost"
										size="icon"
										className="size-7 text-muted-foreground hover:text-destructive"
										onClick={() => setServerToDelete(s)}
										disabled={deleteMutation.isPending}
									>
										<Trash2 className="size-3.5" />
									</Button>
								)}
							</div>
						</div>
					))}
				</div>
			)}

			<AddMCPServerDialog
				projectId={projectId}
				agentId={agentId}
				open={addOpen}
				onOpenChange={setAddOpen}
			/>

			<ConfirmDialog
				open={!!serverToDelete}
				onOpenChange={(open) => !open && setServerToDelete(null)}
				title="Delete MCP Server"
				description={
					serverToDelete
						? `Are you sure you want to delete the MCP server "${serverToDelete.server_name}"? This permanently removes it from the agent.`
						: ""
				}
				confirmText="Delete"
				onConfirm={() =>
					serverToDelete && deleteMutation.mutate(serverToDelete.id)
				}
				isPending={deleteMutation.isPending}
			/>
		</div>
	);
}

// ── Skills Tab ────────────────────────────────────────────────────────────────

function AddSkillDialog({
	projectId,
	agentId,
	open,
	onOpenChange,
}: {
	projectId: string;
	agentId: string;
	open: boolean;
	onOpenChange: (open: boolean) => void;
}) {
	const qc = useQueryClient();
	const [skillName, setSkillName] = useState("");
	const [source, setSource] = useState<"inline" | "marketplace" | "github_url">(
		"inline",
	);
	const [skillContent, setSkillContent] = useState("");
	const [sourceUrl, setSourceUrl] = useState("");

	const addMutation = useMutation({
		mutationFn: () =>
			addSkill(projectId, agentId, {
				skill_name: skillName.trim(),
				skill_source: source,
				skill_content: source === "inline" ? skillContent : undefined,
				source_url: source !== "inline" ? sourceUrl.trim() : null,
			}),
		onSuccess: () => {
			qc.invalidateQueries({
				queryKey: ["projects", projectId, "agents", agentId, "skills"],
			});
			onOpenChange(false);
			setSkillName("");
			setSkillContent("");
			setSourceUrl("");
		},
	});

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="max-w-md">
				<DialogHeader>
					<DialogTitle className="flex items-center gap-2">
						<Wand2 className="size-4 text-primary" />
						Add Skill
					</DialogTitle>
					<DialogDescription>
						Give the agent specialised instructions or capabilities.
					</DialogDescription>
				</DialogHeader>
				<div className="space-y-4 py-2">
					<div className="space-y-1.5">
						<Label>Skill name</Label>
						<Input
							placeholder="code-reviewer"
							value={skillName}
							onChange={(e) => setSkillName(e.target.value)}
						/>
					</div>
					<div className="space-y-1.5">
						<Label>Source</Label>
						<Select
							value={source}
							onValueChange={(v) => setSource(v as typeof source)}
						>
							<SelectTrigger>
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								<SelectItem value="inline">
									Inline (write content here)
								</SelectItem>
								<SelectItem value="marketplace">Marketplace</SelectItem>
								<SelectItem value="github_url">GitHub URL</SelectItem>
							</SelectContent>
						</Select>
					</div>
					{source === "inline" ? (
						<div className="space-y-1.5">
							<Label>Skill content (Markdown)</Label>
							<Textarea
								placeholder="# Code Reviewer&#10;&#10;You review pull requests for security, performance…"
								value={skillContent}
								onChange={(e) => setSkillContent(e.target.value)}
								rows={5}
								className="font-mono text-xs"
							/>
						</div>
					) : (
						<div className="space-y-1.5">
							<Label>URL</Label>
							<Input
								placeholder={
									source === "marketplace"
										? "paca/code-reviewer@1.0.0"
										: "https://github.com/org/skills/blob/main/SKILL.md"
								}
								value={sourceUrl}
								onChange={(e) => setSourceUrl(e.target.value)}
							/>
						</div>
					)}
				</div>
				<DialogFooter>
					<Button variant="outline" onClick={() => onOpenChange(false)}>
						Cancel
					</Button>
					<Button
						onClick={() => addMutation.mutate()}
						disabled={!skillName.trim() || addMutation.isPending}
					>
						{addMutation.isPending ? (
							<Loader2 className="size-4 animate-spin" />
						) : (
							"Add skill"
						)}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}

function SkillsTab({
	projectId,
	agentId,
	canWrite,
}: {
	projectId: string;
	agentId: string;
	canWrite: boolean;
}) {
	const qc = useQueryClient();
	const { data: skills = [] } = useQuery(
		agentSkillsQueryOptions(projectId, agentId),
	);
	const [addOpen, setAddOpen] = useState(false);

	const toggleMutation = useMutation({
		mutationFn: (s: AgentSkill) =>
			updateSkill(projectId, agentId, s.id, { is_enabled: !s.is_enabled }),
		onSuccess: () => {
			qc.invalidateQueries({
				queryKey: ["projects", projectId, "agents", agentId, "skills"],
			});
		},
	});

	const [skillToDelete, setSkillToDelete] = useState<AgentSkill | null>(null);

	const deleteMutation = useMutation({
		mutationFn: (id: string) => deleteSkill(projectId, agentId, id),
		onSuccess: () => {
			qc.invalidateQueries({
				queryKey: ["projects", projectId, "agents", agentId, "skills"],
			});
			toast.success("Agent skill deleted");
			setSkillToDelete(null);
		},
		onError: () => {
			toast.error("Failed to delete agent skill");
		},
	});

	return (
		<div className="space-y-4">
			<div className="flex items-center justify-between">
				<p className="text-sm text-muted-foreground">
					{skills.length} skill{skills.length !== 1 && "s"} attached
				</p>
				{canWrite && (
					<Button size="sm" onClick={() => setAddOpen(true)}>
						<Plus className="size-4 mr-1.5" />
						Add skill
					</Button>
				)}
			</div>

			{skills.length === 0 ? (
				<div className="flex flex-col items-center justify-center gap-3 py-14 rounded-xl border border-dashed border-border">
					<Wand2 className="size-8 text-muted-foreground/40" />
					<p className="text-sm text-muted-foreground">No skills yet</p>
					{canWrite && (
						<Button
							size="sm"
							variant="outline"
							onClick={() => setAddOpen(true)}
						>
							<Plus className="size-3.5 mr-1" />
							Add first skill
						</Button>
					)}
				</div>
			) : (
				<div className="space-y-2">
					{skills.map((s) => (
						<div
							key={s.id}
							className="flex items-center justify-between gap-3 rounded-lg border border-border/60 bg-card px-4 py-3"
						>
							<div className="flex items-center gap-3 min-w-0">
								<Code2 className="size-4 text-muted-foreground shrink-0" />
								<div className="min-w-0">
									<p className="text-sm font-medium truncate">{s.skill_name}</p>
									<p className="text-xs text-muted-foreground">
										{s.skill_source}
										{s.source_url ? ` · ${s.source_url}` : ""}
									</p>
								</div>
							</div>
							<div className="flex items-center gap-2 shrink-0">
								<Switch
									checked={s.is_enabled}
									onCheckedChange={() => canWrite && toggleMutation.mutate(s)}
									disabled={!canWrite || toggleMutation.isPending}
								/>
								{canWrite && (
									<Button
										variant="ghost"
										size="icon"
										className="size-7 text-muted-foreground hover:text-destructive"
										onClick={() => setSkillToDelete(s)}
										disabled={deleteMutation.isPending}
									>
										<Trash2 className="size-3.5" />
									</Button>
								)}
							</div>
						</div>
					))}
				</div>
			)}

			<AddSkillDialog
				projectId={projectId}
				agentId={agentId}
				open={addOpen}
				onOpenChange={setAddOpen}
			/>

			<ConfirmDialog
				open={!!skillToDelete}
				onOpenChange={(open) => !open && setSkillToDelete(null)}
				title="Delete Agent Skill"
				description={
					skillToDelete
						? `Are you sure you want to delete the skill "${skillToDelete.skill_name}"? This permanently detaches it from the agent.`
						: ""
				}
				confirmText="Delete"
				onConfirm={() =>
					skillToDelete && deleteMutation.mutate(skillToDelete.id)
				}
				isPending={deleteMutation.isPending}
			/>
		</div>
	);
}

// ── Conversations Tab ─────────────────────────────────────────────────────────

function ConversationRow({
	conv,
	projectId,
	onClick,
}: {
	conv: AgentConversation;
	projectId: string;
	onClick: () => void;
}) {
	const statusColor = CONVERSATION_STATUS_COLORS[conv.status];
	const statusLabel = CONVERSATION_STATUS_LABELS[conv.status];

	return (
		<div className="w-full flex items-center gap-4 rounded-lg border border-border/60 bg-card px-4 py-3 transition-colors hover:border-border hover:bg-accent/30">
			<button
				type="button"
				onClick={onClick}
				className="flex flex-col gap-0.5 min-w-0 flex-1 text-left"
			>
				<div className="flex items-center gap-2">
					<span className="text-sm font-medium truncate">
						{conv.trigger_type === "chat_message"
							? "Chat"
							: conv.trigger_type === "description_write"
								? "Write description"
								: "Task"}{" "}
						· {conv.id.slice(0, 8)}
					</span>
					<Badge
						variant="outline"
						className={`text-[10px] font-semibold shrink-0 ${statusColor}`}
					>
						{statusLabel}
					</Badge>
				</div>
				<div className="flex items-center gap-3 text-xs text-muted-foreground">
					<span className="flex items-center gap-1">
						<Zap className="size-3" />
						{conv.iteration_count} iterations
					</span>
					{conv.branch_name && (
						<span className="flex items-center gap-1 truncate">
							<GitBranch className="size-3" />
							{conv.branch_name}
						</span>
					)}
					{conv.pr_url && (
						<span className="flex items-center gap-1">
							<GitPullRequest className="size-3" />
							PR opened
						</span>
					)}
					<span className="flex items-center gap-1 ml-auto">
						<Clock className="size-3" />
						{new Date(conv.created_at).toLocaleDateString()}
					</span>
				</div>
			</button>
			<Link
				to="/projects/$projectId/conversations/$conversationId"
				params={{ projectId, conversationId: conv.id }}
				className="shrink-0 text-xs font-medium text-primary/70 hover:text-primary transition-colors"
			>
				Watch
			</Link>
		</div>
	);
}

function ConversationModal({
	projectId,
	conversationId,
	open,
	onOpenChange,
}: {
	projectId: string;
	conversationId: string;
	open: boolean;
	onOpenChange: (open: boolean) => void;
}) {
	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="max-w-3xl sm:max-w-3xl h-[80vh] flex flex-col p-0 gap-0 overflow-hidden">
				<ConversationView
					projectId={projectId}
					conversationId={conversationId}
				/>
			</DialogContent>
		</Dialog>
	);
}

function AgentGanttChart({
	conversations,
	onSelectConversation,
}: {
	conversations: AgentConversation[];
	onSelectConversation: (id: string) => void;
}) {
	const [timeRange, setTimeRange] = useState<"24h" | "7d">("24h");

	const { startTime, endTime } = useMemo(() => {
		const end = Date.now();
		const start = end - (timeRange === "24h" ? 24 : 7 * 24) * 60 * 60 * 1000;
		return { startTime: start, endTime: end };
	}, [timeRange]);

	const formatDuration = (ms: number) => {
		if (ms < 1000) return `${ms}ms`;
		const sec = Math.floor(ms / 1000);
		if (sec < 60) return `${sec}s`;
		const min = Math.floor(sec / 60);
		const hrs = Math.floor(min / 60);
		if (hrs === 0) return `${min}m ${sec % 60}s`;
		return `${hrs}h ${min % 60}m`;
	};

	const activeConversations = useMemo(() => {
		return conversations.filter((c) => {
			const cStart = new Date(c.started_at || c.created_at).getTime();
			const cEnd =
				c.status === "running"
					? Date.now()
					: new Date(c.finished_at || c.updated_at).getTime();
			return cStart <= endTime && cEnd >= startTime;
		});
	}, [conversations, startTime, endTime]);

	const ticks = useMemo(() => {
		const result = [];
		const steps = timeRange === "24h" ? 6 : 7;
		const stepMs = (timeRange === "24h" ? 4 : 24) * 60 * 60 * 1000;
		for (let i = 0; i <= steps; i++) {
			const time = startTime + i * stepMs;
			let label = "";
			if (timeRange === "24h") {
				if (i === steps) label = "Now";
				else {
					const date = new Date(time);
					label = date.toLocaleTimeString(undefined, {
						hour: "numeric",
						hour12: true,
					});
				}
			} else {
				if (i === steps) label = "Now";
				else {
					const date = new Date(time);
					label = date.toLocaleDateString(undefined, { weekday: "short" });
				}
			}
			result.push({ time, label, pct: (i / steps) * 100 });
		}
		return result;
	}, [startTime, timeRange]);

	return (
		<div className="rounded-xl border border-border/60 bg-card p-5 mb-6">
			<div className="flex items-center justify-between mb-4">
				<div>
					<h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
						Agent Work Timeline
					</h3>
					<p className="text-[10px] text-muted-foreground mt-0.5">
						Visual timeline of the agent's work duration (running vs idle)
					</p>
				</div>
				<div className="flex items-center gap-1 border border-border/40 rounded-lg bg-muted/30 p-0.5">
					<button
						type="button"
						onClick={() => setTimeRange("24h")}
						className={cn(
							"px-2.5 py-1 text-[10px] font-semibold rounded-md transition-all cursor-pointer",
							timeRange === "24h"
								? "bg-background text-foreground shadow-xs"
								: "text-muted-foreground hover:text-foreground"
						)}
					>
						Last 24 Hours
					</button>
					<button
						type="button"
						onClick={() => setTimeRange("7d")}
						className={cn(
							"px-2.5 py-1 text-[10px] font-semibold rounded-md transition-all cursor-pointer",
							timeRange === "7d"
								? "bg-background text-foreground shadow-xs"
								: "text-muted-foreground hover:text-foreground"
						)}
					>
						Last 7 Days
					</button>
				</div>
			</div>

			{activeConversations.length === 0 ? (
				<div className="flex flex-col items-center justify-center py-10 border border-dashed border-border/40 rounded-lg text-center bg-muted/5">
					<Clock className="size-6 text-muted-foreground/30 mb-2" />
					<p className="text-xs font-medium text-muted-foreground">No activities recorded</p>
					<p className="text-[10px] text-muted-foreground/75 mt-0.5">
						No conversation sessions took place during the selected period.
					</p>
				</div>
			) : (
				<div className="space-y-2.5 relative">
					{/* The timeline bars */}
					<div className="relative">
						{/* Vertical gridlines */}
						<div className="absolute inset-0 pointer-events-none flex justify-between z-0">
							{ticks.map((tick, idx) => (
								<div
									key={idx}
									className="border-l border-dashed border-border/25 h-full relative"
									style={{ left: `${tick.pct}%` }}
								/>
							))}
						</div>

						{/* Gantt Rows */}
						<div className="space-y-1.5 relative z-10 max-h-56 overflow-y-auto pr-1">
							{activeConversations.map((conv) => {
								const convStart = new Date(conv.started_at || conv.created_at).getTime();
								const convEnd =
									conv.status === "running"
										? Date.now()
										: new Date(conv.finished_at || conv.updated_at).getTime();

								const durationMs = convEnd - convStart;

								const leftStart = Math.max(convStart, startTime);
								const rightEnd = Math.min(convEnd, endTime);

								const leftPercent = ((leftStart - startTime) / (endTime - startTime)) * 100;
								const widthPercent = Math.max(
									((rightEnd - leftStart) / (endTime - startTime)) * 100,
									1.5 // Ensure thin bars are still clickable
								);

								return (
									<div
										key={conv.id}
										className="flex items-center text-[11px] group/row py-0.5"
									>
										{/* Row Label */}
										<button
											type="button"
											onClick={() => onSelectConversation(conv.id)}
											className="w-40 shrink-0 text-left font-medium truncate pr-4 hover:text-primary transition-colors cursor-pointer text-muted-foreground/90"
										>
											{conv.trigger_type === "chat_message"
												? "Direct Chat"
												: conv.trigger_type === "description_write"
													? "Write Description"
													: "Task Assignment"}{" "}
											· <span className="font-[JetBrains_Mono,monospace] text-[10px] text-muted-foreground/50 font-semibold">#{conv.id.slice(0, 8)}</span>
										</button>

										{/* Row Bar Track */}
										<div className="flex-1 h-5 rounded-md relative bg-muted/15 border border-border/10 overflow-visible">
											{/* Gantt Bar */}
											<div
												onClick={() => onSelectConversation(conv.id)}
												style={{ left: `${leftPercent}%`, width: `${widthPercent}%` }}
												className={cn(
													"group/bar absolute h-full rounded-md shadow-xs opacity-90 hover:opacity-100 hover:scale-y-105 transition-all cursor-pointer z-10",
													conv.status === "finished"
														? "bg-emerald-500/80 hover:bg-emerald-500 border border-emerald-500/30"
														: conv.status === "failed"
															? "bg-destructive/80 hover:bg-destructive border border-destructive/30"
															: conv.status === "running"
																? "bg-blue-500/80 hover:bg-blue-500 border border-blue-500/30 animate-pulse"
																: "bg-muted-foreground/30 hover:bg-muted-foreground/45 border border-muted-foreground/20"
												)}
											>
												{/* CSS Tooltip */}
												<div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2.5 w-60 p-3 rounded-xl border border-border/40 bg-popover/95 text-popover-foreground shadow-lg opacity-0 group-hover/bar:opacity-100 pointer-events-none transition-all duration-150 z-50 text-[11px] space-y-1.5 backdrop-blur-md">
													<div className="flex items-center justify-between border-b border-border/15 pb-1">
														<span className="font-semibold text-xs text-foreground">
															{conv.trigger_type === "chat_message"
																? "Direct Chat"
																: conv.trigger_type === "description_write"
																	? "Write Description"
																	: "Task Assignment"}
														</span>
														<Badge
															variant="outline"
															className={cn("text-[9px] px-1.5 py-0 font-semibold", CONVERSATION_STATUS_COLORS[conv.status])}
														>
															{CONVERSATION_STATUS_LABELS[conv.status] || conv.status}
														</Badge>
													</div>
													<div className="grid grid-cols-3 gap-x-1 gap-y-0.5">
														<span className="text-muted-foreground">Session:</span>
														<span className="col-span-2 font-mono text-[10px] text-foreground font-semibold">{conv.id}</span>
														
														<span className="text-muted-foreground">Duration:</span>
														<span className="col-span-2 text-foreground font-medium">{formatDuration(durationMs)}</span>
														
														<span className="text-muted-foreground">Steps:</span>
														<span className="col-span-2 text-foreground font-medium">{conv.iteration_count} iterations</span>
														
														<span className="text-muted-foreground">Started:</span>
														<span className="col-span-2 text-foreground font-medium">
															{new Date(convStart).toLocaleString(undefined, {
																month: "short",
																day: "numeric",
																hour: "2-digit",
																minute: "2-digit",
																second: "2-digit",
															})}
														</span>
													</div>
													<div className="border-t border-border/15 pt-1.5 text-[9.5px] text-muted-foreground text-center font-medium">
														Click to open session chat logs
													</div>
												</div>
											</div>
										</div>
									</div>
								);
							})}
						</div>
					</div>

					{/* Timeline X Axis */}
					<div className="relative h-6 mt-2 border-t border-border/15 pt-1.5">
						<div className="absolute inset-0 flex justify-between">
							{ticks.map((tick, idx) => (
								<div
									key={idx}
									className="text-[9.5px] font-bold text-muted-foreground/60 tabular-nums flex flex-col items-center select-none"
									style={{
										position: "absolute",
										left: `${tick.pct}%`,
										transform: idx === 0 ? "none" : idx === ticks.length - 1 ? "translateX(-100%)" : "translateX(-50%)",
									}}
								>
									{tick.label}
								</div>
							))}
						</div>
					</div>
				</div>
			)}
		</div>
	);
}

function ConversationsTab({
	projectId,
	agentId,
}: {
	projectId: string;
	agentId: string;
}) {
	const { data: conversations = [], isLoading } = useQuery(
		conversationsQueryOptions(projectId, agentId),
	);
	const [modalConvId, setModalConvId] = useState<string | null>(null);

	// Compute metrics
	const stats = useMemo(() => {
		if (conversations.length === 0) return null;

		const total = conversations.length;
		const finished = conversations.filter(
			(c) => c.status === "finished",
		).length;
		const failed = conversations.filter((c) => c.status === "failed").length;
		const running = conversations.filter((c) => c.status === "running").length;

		// Success rate excludes currently running conversations
		const successRate =
			total > 0 ? Math.round((finished / (total - running || 1)) * 100) : 0;
		const totalIterations = conversations.reduce(
			(sum, c) => sum + c.iteration_count,
			0,
		);

		// Estimate LLM tokens and cost (avg 16,000 tokens per iteration turn)
		// 16,000 tokens at average $0.0035/1k input + output tokens cost = ~$0.052 per iteration
		const estimatedCost = totalIterations * 0.052;

		return {
			total,
			finished,
			failed,
			running,
			successRate,
			totalIterations,
			estimatedCost,
		};
	}, [conversations]);

	if (isLoading) {
		return (
			<div className="space-y-2">
				{Array.from({ length: 3 }).map((_, i) => (
					// biome-ignore lint/suspicious/noArrayIndexKey: skeleton
					<Skeleton key={i} className="h-16 rounded-lg" />
				))}
			</div>
		);
	}

	if (conversations.length === 0) {
		return (
			<div className="flex flex-col items-center justify-center gap-3 py-14 rounded-xl border border-dashed border-border">
				<MessageSquare className="size-8 text-muted-foreground/40" />
				<p className="text-sm text-muted-foreground">No conversations yet</p>
				<p className="text-xs text-muted-foreground max-w-xs text-center">
					Conversations start when a task is assigned to this agent or someone
					messages it.
				</p>
			</div>
		);
	}

	// Get the last 5 conversations for the activity timeline
	const recentActivities = conversations.slice(0, 5);

	return (
		<>
			{/* Analytics Dashboard Grid */}
			{stats && (
				<div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
					<div className="rounded-xl border border-border/60 bg-card p-4 flex flex-col justify-between">
						<span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
							Total Sessions
						</span>
						<div className="flex items-baseline gap-2 mt-2">
							<span className="text-2xl font-bold">{stats.total}</span>
							{stats.running > 0 && (
								<span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-violet-500/10 text-violet-500 animate-pulse border border-violet-500/20">
									{stats.running} active
								</span>
							)}
						</div>
					</div>

					<div className="rounded-xl border border-border/60 bg-card p-4 flex flex-col justify-between">
						<span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
							Success Rate
						</span>
						<div className="flex items-baseline gap-2 mt-2">
							<span className="text-2xl font-bold">{stats.successRate}%</span>
							<span className="text-xs text-muted-foreground">
								{stats.finished} of {stats.total - stats.running}
							</span>
						</div>
					</div>

					<div className="rounded-xl border border-border/60 bg-card p-4 flex flex-col justify-between">
						<span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
							Total Run Steps
						</span>
						<div className="flex items-baseline gap-2 mt-2">
							<span className="text-2xl font-bold">
								{stats.totalIterations}
							</span>
							<span className="text-xs text-muted-foreground">iterations</span>
						</div>
					</div>

					<div className="rounded-xl border border-border/60 bg-card p-4 flex flex-col justify-between">
						<span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
							Est. Token Cost
						</span>
						<div className="flex items-baseline gap-2 mt-2">
							<span className="text-2xl font-bold text-amber-600 dark:text-amber-500">
								${stats.estimatedCost.toFixed(2)}
							</span>
							<span className="text-xs text-muted-foreground">USD</span>
						</div>
					</div>
				</div>
			)}

			<AgentGanttChart
				conversations={conversations}
				onSelectConversation={setModalConvId}
			/>

			<div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
				{/* Recent History List */}
				<div className="lg:col-span-2 space-y-4">
					<h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
						All Sessions
					</h3>
					<div className="space-y-2">
						{conversations.map((conv) => (
							<ConversationRow
								key={conv.id}
								conv={conv}
								projectId={projectId}
								onClick={() => setModalConvId(conv.id)}
							/>
						))}
					</div>
				</div>

				{/* Visual Activity Timeline */}
				<div className="space-y-4">
					<h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
						Recent Activity Timeline
					</h3>
					<div className="rounded-xl border border-border/60 bg-card p-5 space-y-5 relative">
						<div className="absolute left-7.5 top-8.5 bottom-8.5 w-0.5 bg-border/60" />

						{recentActivities.map((conv) => {
							const statusColors = {
								queued: "bg-muted-foreground/30 ring-muted-foreground/20",
								running: "bg-blue-500 ring-blue-500/20 animate-pulse",
								finished: "bg-emerald-500 ring-emerald-500/20",
								failed: "bg-destructive ring-destructive/20",
								stopped: "bg-muted-foreground/40 ring-muted-foreground/15",
							};

							const dotColor = statusColors[conv.status] || "bg-muted";

							return (
								<div
									key={conv.id}
									className="flex items-start gap-4 relative z-1"
								>
									<div
										className={cn(
											"size-5 rounded-full ring-4 flex items-center justify-center shrink-0",
											dotColor,
										)}
									>
										{conv.status === "running" && (
											<span className="size-2 rounded-full bg-white animate-ping" />
										)}
									</div>
									<div className="min-w-0 flex-1">
										<p className="text-xs font-semibold truncate">
											{conv.trigger_type === "chat_message"
												? "Direct Chat"
												: conv.trigger_type === "description_write"
													? "Write Description"
													: "Task Assignment"}
										</p>
										<p className="text-[10px] text-muted-foreground mt-0.5">
											ID: {conv.id.slice(0, 8)} · {conv.iteration_count} steps
										</p>
										<div className="flex items-center gap-2 mt-1.5">
											<span
												className={cn(
													"text-[9px] font-medium uppercase tracking-wider",
													conv.status === "finished"
														? "text-emerald-500"
														: conv.status === "failed"
															? "text-destructive"
															: conv.status === "running"
																? "text-blue-500"
																: "text-muted-foreground",
												)}
											>
												{conv.status}
											</span>
											<span className="text-[9px] text-muted-foreground/50">
												·
											</span>
											<span className="text-[9px] text-muted-foreground">
												{new Date(conv.created_at).toLocaleDateString(
													undefined,
													{
														month: "short",
														day: "numeric",
														hour: "2-digit",
														minute: "2-digit",
													},
												)}
											</span>
										</div>
									</div>
								</div>
							);
						})}
					</div>
				</div>
			</div>

			{modalConvId && (
				<ConversationModal
					projectId={projectId}
					conversationId={modalConvId}
					open
					onOpenChange={(open) => {
						if (!open) setModalConvId(null);
					}}
				/>
			)}
		</>
	);
}

// ── Page ──────────────────────────────────────────────────────────────────────

const TABS: {
	id: Tab;
	label: string;
	icon: React.ComponentType<{ className?: string }>;
}[] = [
	{ id: "overview", label: "Overview", icon: Bot },
	{ id: "mcp-servers", label: "MCP Servers", icon: Server },
	{ id: "skills", label: "Skills", icon: Wand2 },
	{ id: "conversations", label: "Conversations", icon: MessageSquare },
];

function AgentDetailPage() {
	const { projectId, agentId } = Route.useParams();
	const { hasProjectPermission } = useProjectPermissions(projectId);
	const canWrite = hasProjectPermission("agents.write");

	const { data: agent } = useQuery(agentQueryOptions(projectId, agentId));
	const { tab } = Route.useSearch();
	const [activeTab, setActiveTab] = useState<Tab>(
		(tab as Tab) || "overview"
	);

	const { data: conversations = [] } = useQuery(
		conversationsQueryOptions(projectId, agentId),
	);
	const isAgentWorking = conversations.some((c) => c.status === "running");

	if (!agent) {
		return (
			<div className="flex flex-col gap-4 p-6">
				<Skeleton className="h-16 w-full rounded-xl" />
				<Skeleton className="h-64 w-full rounded-xl" />
			</div>
		);
	}

	const initials = agent.name
		.split(" ")
		.map((w) => w[0])
		.join("")
		.toUpperCase()
		.slice(0, 2);

	return (
		<div className="flex flex-col flex-1 min-h-0">
			{/* Agent header */}
			<div className="border-b border-border/50 px-6 py-5 shrink-0">
				<div className="flex items-center gap-4">
					<div className="relative shrink-0">
						<Avatar className="size-12 rounded-xl bg-primary/10">
							<AvatarFallback className="rounded-xl bg-primary/10 text-primary font-bold text-base">
								{initials}
							</AvatarFallback>
						</Avatar>
						<span
							className={cn(
								"absolute -bottom-0.5 -right-0.5 size-3 rounded-full border-2 border-background",
								isAgentWorking
									? "bg-violet-500 animate-pulse"
									: "bg-emerald-500",
							)}
							title={
								isAgentWorking
									? "Agent is working..."
									: "Agent is idle (online)"
							}
						/>
					</div>
					<div>
						<h1 className="text-lg font-semibold">{agent.name}</h1>
						<div className="flex items-center gap-2 mt-0.5">
							<span className="text-sm text-muted-foreground">
								@{agent.handle}
							</span>
							<span className="text-muted-foreground/40">·</span>
							<Badge variant="secondary" className="text-[10px]">
								{agent.llm_provider}
							</Badge>
							<span className="text-muted-foreground/40">·</span>
							<span
								className={cn(
									"text-[10px] font-medium px-2 py-0.5 rounded-full border flex items-center gap-1",
									isAgentWorking
										? "bg-violet-500/10 text-violet-500 border-violet-500/20"
										: "bg-emerald-500/10 text-emerald-500 border-emerald-500/20",
								)}
							>
								<span
									className={cn(
										"size-1 rounded-full",
										isAgentWorking
											? "bg-violet-500 animate-pulse"
											: "bg-emerald-500",
									)}
								/>
								{isAgentWorking ? "working" : "idle"}
							</span>
						</div>
					</div>
				</div>
			</div>

			{/* Tabs */}
			<div className="border-b border-border/50 px-6 shrink-0">
				<div className="flex items-center gap-1 -mb-px">
					{TABS.map((tab) => {
						const Icon = tab.icon;
						const isActive = activeTab === tab.id;
						return (
							<button
								key={tab.id}
								type="button"
								onClick={() => setActiveTab(tab.id)}
								className={`flex items-center gap-1.5 px-3 py-2.5 text-sm font-medium border-b-2 transition-colors ${
									isActive
										? "border-primary text-primary"
										: "border-transparent text-muted-foreground hover:text-foreground"
								}`}
							>
								<Icon className="size-3.5" />
								{tab.label}
							</button>
						);
					})}
				</div>
			</div>

			{/* Tab content */}
			<div className="flex-1 overflow-auto p-6">
				{activeTab === "overview" && (
					<OverviewTab
						agent={agent}
						projectId={projectId}
						canWrite={canWrite}
					/>
				)}
				{activeTab === "mcp-servers" && (
					<MCPServersTab
						projectId={projectId}
						agentId={agentId}
						canWrite={canWrite}
					/>
				)}
				{activeTab === "skills" && (
					<SkillsTab
						projectId={projectId}
						agentId={agentId}
						canWrite={canWrite}
					/>
				)}
				{activeTab === "conversations" && (
					<ConversationsTab projectId={projectId} agentId={agentId} />
				)}
			</div>
		</div>
	);
}
