import { useQuery } from "@tanstack/react-query";
import {
	Check,
	GripVertical,
	Layers,
	Link,
	MessageSquare,
	Paperclip,
	User,
} from "lucide-react";
import { useState } from "react";

import { getTaskTypeIconComponent } from "@/components/projects/task-types/task-type-icons";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@/components/ui/popover";
import { conversationsQueryOptions } from "@/lib/agent-api";
import { taskAttachmentsQueryOptions } from "@/lib/attachment-api";
import {
	epicChildTasksQueryOptions,
	type Task,
	taskActivitiesQueryOptions,
} from "@/lib/interaction-api";
import {
	type CustomFieldDefinition,
	isEpicType,
	type ProjectMember,
	type TaskStatus,
	type TaskType,
} from "@/lib/project-api";
import { cn } from "@/lib/utils";

import {
	getPriority,
	IMPORTANCE_BUCKET_VALUES,
	PRIORITY_LEVELS,
} from "./priority";
import { DEFAULT_VISIBLE_FIELDS, type TaskFieldUpdate } from "./view-utils";

type UpdatePayload = TaskFieldUpdate;

interface TaskCardProps {
	task: Task;
	taskIdPrefix?: string;
	statuses: TaskStatus[];
	taskTypes: TaskType[];
	members?: ProjectMember[];
	epics?: Task[];
	visibleFields?: string[];
	customFields?: CustomFieldDefinition[];
	onClick?: () => void;
	onDragStart?: (e: React.DragEvent) => void;
	onDragEnd?: (e: React.DragEvent) => void;
	isDragging?: boolean;
	canEdit?: boolean;
	onUpdate?: (taskId: string, payload: UpdatePayload) => void;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatDate(iso: string): string {
	const d = new Date(iso);
	return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export function TaskCard({
	task,
	taskIdPrefix = "",
	statuses,
	taskTypes,
	members = [],
	epics = [],
	visibleFields = DEFAULT_VISIBLE_FIELDS,
	customFields = [],
	onClick,
	onDragStart,
	onDragEnd,
	isDragging,
	canEdit,
	onUpdate,
}: TaskCardProps) {
	const [typePopoverOpen, setTypePopoverOpen] = useState(false);
	const taskType = taskTypes.find((t) => t.id === task.task_type_id);
	const assignee = task.assignee_id
		? members.find((m) => m.id === task.assignee_id)
		: undefined;
	const status = statuses.find((s) => s.id === task.status_id);

	const isEpic = isEpicType(taskType);

	// Fetch child subtasks to calculate progress if this task is an Epic
	const { data: subtasks = [] } = useQuery({
		...epicChildTasksQueryOptions(task.project_id, task.id),
		enabled: isEpic,
	});

	const isAgent = assignee?.member_type === "agent";
	const { data: conversations = [] } = useQuery({
		...conversationsQueryOptions(task.project_id),
		enabled: isAgent,
	});

	const isAgentWorking =
		isAgent &&
		conversations.some(
			(c) => c.agent_id === assignee?.agent_id && c.status === "running",
		);

	// Fetch activities and attachments for counts
	const { data: activities = [] } = useQuery({
		...taskActivitiesQueryOptions(task.project_id, task.id),
		staleTime: 30_000,
	});

	const { data: attachments = [] } = useQuery({
		...taskAttachmentsQueryOptions(task.project_id, task.id),
		staleTime: 30_000,
	});

	const commentsCount = activities.filter(
		(a) => a.activity_type === "comment",
	).length;
	const attachmentsCount = attachments.length;

	const totalSubtasks = subtasks.length;
	const completedSubtasks = subtasks.filter((st) => {
		const stStatus = statuses.find((s) => s.id === st.status_id);
		return stStatus?.category === "done";
	}).length;
	const subtaskProgressPercent =
		totalSubtasks > 0
			? Math.round((completedSubtasks / totalSubtasks) * 100)
			: 0;

	/** Renders the chip/indicator for a single field key. */
	const renderField = (fieldKey: string) => {
		switch (fieldKey) {
			case "assignee":
				return canEdit && members.length > 0 ? (
					<Popover key="assignee">
						<PopoverTrigger
							type="button"
							onClick={(e) => e.stopPropagation()}
							className="flex size-5 items-center justify-center rounded-full transition-all duration-150 hover:ring-2 hover:ring-primary/30"
						>
							{assignee ? (
								<div className="flex size-5 items-center justify-center rounded-full bg-linear-to-br from-primary/20 to-primary/15 text-primary text-[10px] font-bold ring-1 ring-primary/20">
									{(assignee.full_name || assignee.username)
										.slice(0, 1)
										.toUpperCase()}
								</div>
							) : (
								<div className="flex size-5 items-center justify-center rounded-full bg-linear-to-br from-muted/80 to-muted/40 text-muted-foreground text-[10px] font-bold ring-1 ring-border/25">
									<User className="size-2.5" />
								</div>
							)}
						</PopoverTrigger>
						<PopoverContent
							className="w-48 p-1 rounded-xl border border-border/40 shadow-lg"
							align="start"
						>
							<button
								type="button"
								className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-[13px] text-muted-foreground hover:bg-muted/60 transition-colors duration-100"
								onClick={(e) => {
									e.stopPropagation();
									onUpdate?.(task.id, { assignee_id: null });
								}}
							>
								<User className="size-3.5 opacity-60" />
								<span className="flex-1 text-left">Unassigned</span>
								{!assignee && <Check className="size-3.5 text-primary" />}
							</button>
							{members.map((m) => (
								<button
									key={m.id}
									type="button"
									className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-[13px] hover:bg-muted/60 transition-colors duration-100"
									onClick={(e) => {
										e.stopPropagation();
										onUpdate?.(task.id, { assignee_id: m.id });
									}}
								>
									<div className="flex size-5 items-center justify-center rounded-full bg-linear-to-br from-primary/20 to-primary/10 text-primary text-[9px] font-bold">
										{(m.full_name || m.username).slice(0, 1).toUpperCase()}
									</div>
									<span className="flex-1 text-left truncate">
										{m.full_name || m.username}
									</span>
									{m.id === task.assignee_id && (
										<Check className="size-3.5 text-primary" />
									)}
								</button>
							))}
						</PopoverContent>
					</Popover>
				) : (
					<div
						key="assignee"
						className={cn(
							"flex size-5 items-center justify-center rounded-full text-[10px] font-bold ring-1 relative",
							task.assignee_id
								? "bg-linear-to-br from-primary/20 to-primary/15 text-primary ring-primary/20"
								: "bg-linear-to-br from-muted/80 to-muted/40 text-muted-foreground ring-border/25",
						)}
					>
						{assignee ? (
							<>
								{(assignee.full_name || assignee.username)
									.slice(0, 1)
									.toUpperCase()}
								{assignee.member_type === "agent" && (
									<span
										className={cn(
											"absolute -bottom-0.5 -right-0.5 size-1.5 rounded-full border border-background",
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
								)}
							</>
						) : (
							<User className="size-2.5" />
						)}
					</div>
				);

			case "type":
				return canEdit && taskTypes.length > 0 ? (
					<Popover
						key="type"
						open={typePopoverOpen}
						onOpenChange={setTypePopoverOpen}
					>
						<PopoverTrigger
							type="button"
							onClick={(e) => e.stopPropagation()}
							className="flex items-center justify-center rounded-md p-0.5 transition-all duration-150 hover:bg-muted/60"
						>
							{taskType ? (
								(() => {
									const Icon = getTaskTypeIconComponent(taskType.icon);
									return Icon ? (
										<Icon
											className="size-3.5"
											style={
												taskType.color ? { color: taskType.color } : undefined
											}
										/>
									) : (
										<span
											className="text-[10px] font-bold"
											style={
												taskType.color ? { color: taskType.color } : undefined
											}
										>
											{taskType.name.slice(0, 2)}
										</span>
									);
								})()
							) : (
								<span className="text-[10px] text-muted-foreground/50">--</span>
							)}
						</PopoverTrigger>
						<PopoverContent
							className="w-44 p-1 rounded-xl border border-border/40 shadow-lg"
							align="start"
						>
							{taskTypes.map((tt) => {
								const TtIcon = getTaskTypeIconComponent(tt.icon);
								return (
									<button
										key={tt.id}
										type="button"
										className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-[13px] hover:bg-muted/60 transition-colors duration-100"
										onClick={(e) => {
											e.stopPropagation();
											onUpdate?.(task.id, { task_type_id: tt.id });
											setTypePopoverOpen(false);
										}}
									>
										{TtIcon && (
											<TtIcon
												className="size-3.5 text-muted-foreground/80 shrink-0"
												style={tt.color ? { color: tt.color } : undefined}
											/>
										)}
										<span className="flex-1 text-left">{tt.name}</span>
										{tt.id === taskType?.id && (
											<Check className="size-3.5 text-primary" />
										)}
									</button>
								);
							})}
						</PopoverContent>
					</Popover>
				) : taskType ? (
					(() => {
						const Icon = getTaskTypeIconComponent(taskType.icon);
						return Icon ? (
							<Icon
								key="type"
								className="size-3.5 shrink-0"
								style={taskType.color ? { color: taskType.color } : undefined}
							/>
						) : (
							<span
								key="type"
								className="inline-flex items-center rounded-md px-1.5 py-0.5 text-[10px] font-bold leading-tight border shrink-0"
								style={{
									borderColor: taskType.color
										? `${taskType.color}44`
										: "var(--border)",
									backgroundColor: taskType.color
										? `${taskType.color}15`
										: "var(--muted)",
									color: taskType.color ?? "inherit",
								}}
							>
								{taskType.name}
							</span>
						);
					})()
				) : null;

			case "status":
				return canEdit && statuses.length > 0 ? (
					<DropdownMenu key="status">
						<DropdownMenuTrigger
							onClick={(e) => e.stopPropagation()}
							className="inline-flex items-center gap-1 rounded-full border border-border/40 bg-muted/40 px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground hover:opacity-80 transition-opacity cursor-pointer"
						>
							{status ? (
								<>
									<span
										className="size-1.5 rounded-full shrink-0"
										style={{ background: status.color ?? undefined }}
									/>
									{status.name}
								</>
							) : (
								<span className="text-[10px] text-muted-foreground/50">—</span>
							)}
						</DropdownMenuTrigger>
						<DropdownMenuContent align="start">
							{statuses.map((s) => (
								<DropdownMenuItem
									key={s.id}
									onClick={(e) => {
										e.stopPropagation();
										onUpdate?.(task.id, { status_id: s.id });
									}}
								>
									<span
										className="size-2 rounded-full shrink-0 mr-2"
										style={{ background: s.color ?? undefined }}
									/>
									{s.name}
									{s.id === task.status_id && (
										<Check className="size-3.5 text-primary ml-auto" />
									)}
								</DropdownMenuItem>
							))}
						</DropdownMenuContent>
					</DropdownMenu>
				) : status ? (
					<span
						key="status"
						className="inline-flex items-center gap-1 rounded-full border border-border/40 bg-muted/40 px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground"
					>
						<span
							className="size-1.5 rounded-full shrink-0"
							style={{ background: status.color ?? undefined }}
						/>
						{status.name}
					</span>
				) : null;

			case "story_points": {
				if (task.story_points == null) return null;
				return (
					<span
						key="story_points"
						title="Story Points"
						className="inline-flex items-center rounded-md bg-primary/10 px-1.5 py-0.5 text-[10px] font-bold text-primary/80 shrink-0 tabular-nums"
					>
						{task.story_points}
					</span>
				);
			}

			case "importance": {
				if (!task.importance && !canEdit) return null;
				const p = getPriority(task.importance);
				return canEdit ? (
					<DropdownMenu key="importance">
						<DropdownMenuTrigger
							onClick={(e) => e.stopPropagation()}
							className="inline-flex items-center gap-1 text-[10px] font-medium shrink-0 hover:opacity-80 transition-opacity cursor-pointer"
							style={task.importance > 0 ? { color: p.color } : undefined}
						>
							{task.importance > 0 ? (
								<>
									<span
										className="size-1.5 rounded-full shrink-0"
										style={{ background: p.color }}
									/>
									{p.label}
								</>
							) : (
								<span className="text-[10px] text-muted-foreground/40">
									Priority
								</span>
							)}
						</DropdownMenuTrigger>
						<DropdownMenuContent align="start">
							{PRIORITY_LEVELS.map((level) => (
								<DropdownMenuItem
									key={level.value}
									onClick={(e) => {
										e.stopPropagation();
										onUpdate?.(task.id, {
											importance: IMPORTANCE_BUCKET_VALUES[level.value] ?? 0,
										});
									}}
								>
									<span
										className="size-2 rounded-full shrink-0 mr-2"
										style={{ background: level.color }}
									/>
									<span style={{ color: level.color }}>{level.label}</span>
									{getPriority(task.importance).label === level.label &&
										task.importance > 0 === level.value > 0 && (
											<Check className="size-3.5 text-primary ml-auto" />
										)}
								</DropdownMenuItem>
							))}
						</DropdownMenuContent>
					</DropdownMenu>
				) : task.importance > 0 ? (
					<span
						key="importance"
						className="inline-flex items-center gap-1 text-[10px] font-medium shrink-0"
						style={{ color: p.color }}
					>
						<span
							className="size-1.5 rounded-full shrink-0"
							style={{ background: p.color }}
						/>
						{p.label}
					</span>
				) : null;
			}

			case "reporter": {
				const reporter = task.reporter_id
					? members.find((m) => m.id === task.reporter_id)
					: undefined;
				return (
					<div
						key="reporter"
						title={
							reporter ? reporter.full_name || reporter.username : "Reporter"
						}
						className="flex size-5 items-center justify-center rounded-full bg-linear-to-br from-muted/80 to-muted/40 text-muted-foreground text-[10px] font-bold ring-1 ring-border/25"
					>
						{reporter ? (
							(reporter.full_name || reporter.username)
								.slice(0, 1)
								.toUpperCase()
						) : (
							<User className="size-2.5" />
						)}
					</div>
				);
			}

			case "start_date":
				return task.start_date ? (
					<span
						key="start_date"
						className="text-[10px] text-muted-foreground/70 shrink-0"
					>
						{formatDate(task.start_date)}
					</span>
				) : null;

			case "due_date":
				return task.due_date ? (
					<span
						key="due_date"
						className="text-[10px] text-muted-foreground/70 shrink-0"
					>
						{formatDate(task.due_date)}
					</span>
				) : null;

			case "created":
				return (
					<span
						key="created"
						className="text-[10px] text-muted-foreground/50 shrink-0"
					>
						{formatDate(task.created_at)}
					</span>
				);

			case "epic": {
				const epic = task.parent_task_id
					? epics.find((e) => e.id === task.parent_task_id)
					: undefined;
				return canEdit ? (
					<Popover key="epic">
						<PopoverTrigger
							type="button"
							onClick={(e) => e.stopPropagation()}
							className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-medium border border-violet-500/30 bg-violet-500/10 text-violet-600 dark:text-violet-400 hover:opacity-80 transition-opacity shrink-0"
						>
							<Layers className="size-2.5 shrink-0 opacity-70" />
							{epic ? (
								<span className="max-w-20 truncate">{epic.title}</span>
							) : (
								<span className="text-muted-foreground/40">Epic</span>
							)}
						</PopoverTrigger>
						<PopoverContent
							className="w-56 p-1 rounded-xl border border-border/40 shadow-lg"
							align="start"
						>
							<button
								type="button"
								className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-[13px] text-muted-foreground hover:bg-muted/60 transition-colors duration-100"
								onClick={(e) => {
									e.stopPropagation();
									onUpdate?.(task.id, { parent_task_id: null });
								}}
							>
								<span className="flex-1 text-left">No Epic</span>
								{!task.parent_task_id && (
									<Check className="size-3.5 text-primary" />
								)}
							</button>
							{epics.map((e) => (
								<button
									key={e.id}
									type="button"
									className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-[13px] hover:bg-muted/60 transition-colors duration-100"
									onClick={(ev) => {
										ev.stopPropagation();
										onUpdate?.(task.id, { parent_task_id: e.id });
									}}
								>
									<Layers className="size-3.5 shrink-0 text-violet-500 opacity-70" />
									<span className="flex-1 text-left truncate">{e.title}</span>
									{e.id === task.parent_task_id && (
										<Check className="size-3.5 text-primary" />
									)}
								</button>
							))}
						</PopoverContent>
					</Popover>
				) : epic ? (
					<span
						key="epic"
						className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-medium border border-violet-500/30 bg-violet-500/10 text-violet-600 dark:text-violet-400 shrink-0"
					>
						<Layers className="size-2.5 shrink-0 opacity-70" />
						<span className="max-w-20 truncate">{epic.title}</span>
					</span>
				) : null;
			}

			default: {
				// Custom field
				const cf = customFields.find((f) => f.field_key === fieldKey);
				if (!cf) return null;
				const val = task.custom_fields[cf.field_key];
				if (val === null || val === undefined || val === "")
					return (
						<span
							key={fieldKey}
							className="text-[10px] text-muted-foreground/30"
						>
							—
						</span>
					);

				switch (cf.field_type) {
					case "boolean":
						return val ? (
							<Check key={fieldKey} className="size-3 text-primary shrink-0" />
						) : (
							<span
								key={fieldKey}
								className="text-[10px] text-muted-foreground/40"
							>
								✗
							</span>
						);
					case "number":
						return (
							<span
								key={fieldKey}
								className="text-[10px] font-medium text-foreground/70 shrink-0"
							>
								{String(val)}
							</span>
						);
					case "date":
						return (
							<span
								key={fieldKey}
								className="text-[10px] text-muted-foreground/70 shrink-0"
							>
								{formatDate(String(val))}
							</span>
						);
					case "select":
						return (
							<span
								key={fieldKey}
								className="inline-flex items-center rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary/80 shrink-0"
							>
								{String(val)}
							</span>
						);
					case "multi_select": {
						const arr = Array.isArray(val) ? (val as string[]) : [String(val)];
						return (
							<span key={fieldKey} className="inline-flex gap-0.5 flex-wrap">
								{arr.map((v) => (
									<span
										key={v}
										className="inline-flex items-center rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary/80"
									>
										{v}
									</span>
								))}
							</span>
						);
					}
					case "url":
						return (
							<Link
								key={fieldKey}
								className="size-3 text-primary/60 shrink-0"
							/>
						);
					default:
						return (
							<span
								key={fieldKey}
								className="text-[10px] text-foreground/60 truncate max-w-24"
							>
								{String(val)}
							</span>
						);
				}
			}
		}
	};

	// Collect rendered fields (filter nulls)
	const fieldChips = visibleFields.map(renderField).filter(Boolean);

	return (
		// biome-ignore lint/a11y/noStaticElementInteractions: draggable kanban card; converting to button breaks drag-and-drop
		// biome-ignore lint/a11y/useKeyWithClickEvents: drag-and-drop card; keyboard nav handled by parent
		<div
			data-task-id={task.id}
			draggable={canEdit}
			onDragStart={onDragStart}
			onDragEnd={onDragEnd}
			onClick={onClick}
			className={cn(
				"group relative rounded-xl border border-border/30 bg-card p-3 shadow-xs cursor-pointer transition-all duration-150 select-none overflow-hidden",
				"hover:border-border/50 hover:shadow-sm",
				isDragging && "opacity-50 ring-2 ring-primary/30 shadow-lg rotate-1",
				canEdit && "cursor-grab active:cursor-grabbing",
			)}
		>
			{task.importance > 0 && (
				<div
					className="absolute left-0 top-0 bottom-0 w-1.25 z-10"
					style={{ backgroundColor: getPriority(task.importance).color }}
				/>
			)}
			{canEdit && (
				<div className="absolute left-1.5 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
					<GripVertical className="size-3.5 text-muted-foreground/60" />
				</div>
			)}

			{(taskIdPrefix || task.task_number > 0) && (
				<div className="mb-1 flex items-center">
					<span className="font-[JetBrains_Mono,monospace] text-[10px] font-semibold text-muted-foreground/50 tracking-wide">
						{taskIdPrefix
							? `${taskIdPrefix}-${task.task_number}`
							: `#${task.task_number}`}
					</span>
				</div>
			)}

			<span className="text-sm font-medium leading-snug text-foreground line-clamp-2">
				{task.title}
			</span>

			{isEpic && totalSubtasks > 0 && (
				<div className="mt-2.5 flex flex-col gap-1.5 rounded-lg border border-violet-500/10 bg-violet-500/5 p-2 dark:border-violet-500/20 dark:bg-violet-950/20">
					<div className="flex items-center justify-between text-[10px] font-semibold text-violet-600 dark:text-violet-400">
						<span className="flex items-center gap-1">
							<Layers className="size-2.5 shrink-0 opacity-70" />
							Subtasks
						</span>
						<span className="tabular-nums font-bold">
							{completedSubtasks}/{totalSubtasks} ({subtaskProgressPercent}%)
						</span>
					</div>
					<div className="h-1.5 w-full rounded-full bg-violet-100 dark:bg-violet-950/60 overflow-hidden">
						<div
							className="h-full rounded-full bg-violet-500 dark:bg-violet-400 transition-all duration-300"
							style={{ width: `${subtaskProgressPercent}%` }}
						/>
					</div>
				</div>
			)}

			{(fieldChips.length > 0 || commentsCount > 0 || attachmentsCount > 0) && (
				<div className="mt-2.5 flex items-center justify-between gap-1.5">
					<div className="flex flex-wrap items-center gap-1.5">
						{fieldChips}
					</div>
					{(commentsCount > 0 || attachmentsCount > 0) && (
						<div className="flex items-center gap-2 text-muted-foreground/60 shrink-0 ml-auto">
							{attachmentsCount > 0 && (
								<div
									className="flex items-center gap-1 text-[11px] font-medium"
									title={`${attachmentsCount} attachment${attachmentsCount === 1 ? "" : "s"}`}
								>
									<Paperclip className="size-3 shrink-0" />
									<span className="tabular-nums">{attachmentsCount}</span>
								</div>
							)}
							{commentsCount > 0 && (
								<div
									className="flex items-center gap-1 text-[11px] font-medium"
									title={`${commentsCount} comment${commentsCount === 1 ? "" : "s"}`}
								>
									<MessageSquare className="size-3 shrink-0" />
									<span className="tabular-nums">{commentsCount}</span>
								</div>
							)}
						</div>
					)}
				</div>
			)}
		</div>
	);
}
