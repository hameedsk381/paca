import { createReactInlineContentSpec } from "@blocknote/react";
import { useQuery } from "@tanstack/react-query";
import { useParams } from "@tanstack/react-router";
import { AtSign, FileText, Hash, Loader2, AlertCircle } from "lucide-react";

import { taskQueryOptions } from "@/lib/interaction-api";
import {
	projectMembersQueryOptions,
	projectQueryOptions,
	taskStatusesQueryOptions,
} from "@/lib/project-api";
import { Tooltip, TooltipContent, TooltipProvider } from "@/components/ui/tooltip";
import { getPriority } from "@/components/projects/interactions/priority";

// Helper component to render the rich preview inside the hover card
function TaskPreview({ taskId }: { taskId: string }) {
	const params = useParams({ strict: false }) as { projectId?: string };
	const projectId = params.projectId;

	const { data: task, isLoading, error } = useQuery({
		...taskQueryOptions(projectId ?? "", taskId),
		enabled: !!projectId && !!taskId,
	});

	const { data: project } = useQuery({
		...projectQueryOptions(projectId ?? ""),
		enabled: !!projectId,
	});

	const { data: statuses = [] } = useQuery({
		...taskStatusesQueryOptions(projectId ?? ""),
		enabled: !!projectId,
	});

	const { data: members = [] } = useQuery({
		...projectMembersQueryOptions(projectId ?? ""),
		enabled: !!projectId,
	});

	if (isLoading) {
		return (
			<div className="flex items-center gap-2 p-1 text-xs text-muted-foreground">
				<Loader2 className="size-3.5 animate-spin text-primary" />
				<span>Loading task...</span>
			</div>
		);
	}

	if (error || !task) {
		return (
			<div className="flex items-center gap-2 p-1 text-xs text-destructive">
				<AlertCircle className="size-3.5" />
				<span>Failed to load task</span>
			</div>
		);
	}

	const status = statuses.find((s) => s.id === task.status_id);
	const assignee = task.assignee_id ? members.find((m) => m.id === task.assignee_id) : null;
	const priority = getPriority(task.importance);

	const taskCode = project?.task_id_prefix
		? `${project.task_id_prefix}-${task.task_number}`
		: `#${task.task_number}`;

	return (
		<div className="flex flex-col gap-2 p-1 text-left">
			<div className="flex flex-col gap-0.5 border-b border-border/15 pb-2">
				<span className="font-[JetBrains_Mono,monospace] text-[10px] font-semibold text-muted-foreground/50 tracking-wide">
					{taskCode}
				</span>
				<span className="text-xs font-semibold leading-tight text-foreground line-clamp-2">
					{task.title}
				</span>
			</div>
			
			<div className="grid grid-cols-2 gap-x-4 gap-y-2.5 text-[11px] text-muted-foreground mt-0.5">
				<div className="flex flex-col gap-0.5">
					<span className="text-[9px] font-medium opacity-50 uppercase tracking-wider">Status</span>
					<span className="inline-flex items-center gap-1.5 font-medium text-foreground">
						<span
							className="size-1.5 rounded-full shrink-0"
							style={{ background: status?.color ?? "oklch(var(--muted-foreground))" }}
						/>
						{status?.name ?? "Open"}
					</span>
				</div>

				<div className="flex flex-col gap-0.5">
					<span className="text-[9px] font-medium opacity-50 uppercase tracking-wider">Priority</span>
					<span className="inline-flex items-center gap-1.5 font-medium" style={{ color: priority.color }}>
						<span
							className="size-1.5 rounded-full shrink-0"
							style={{ background: priority.color }}
						/>
						{priority.label}
					</span>
				</div>

				<div className="flex flex-col gap-0.5 col-span-2">
					<span className="text-[9px] font-medium opacity-50 uppercase tracking-wider">Assignee</span>
					<span className="flex items-center gap-1.5 font-medium text-foreground">
						{assignee ? (
							<>
								<div className="flex size-4.5 items-center justify-center rounded-full bg-linear-to-br from-primary/20 to-primary/10 text-primary text-[8px] font-bold">
									{(assignee.full_name || assignee.username).slice(0, 1).toUpperCase()}
								</div>
								<span className="truncate">{assignee.full_name || assignee.username}</span>
							</>
						) : (
							<span className="text-muted-foreground/60 italic">Unassigned</span>
						)}
					</span>
				</div>
			</div>
		</div>
	);
}

export const TeamMention = createReactInlineContentSpec(
	{
		type: "teamMention",
		propSchema: {
			id: {
				default: "",
			},
			name: {
				default: "Unknown",
			},
			avatar: {
				default: undefined,
				type: "string" as const,
			},
		},
		content: "none",
	},
	{
		render: (props) => (
			<span
				className="inline-flex items-center gap-1 rounded-full bg-blue-50/80 px-1.5 py-0.5 text-xs font-medium text-blue-700 dark:bg-blue-900/40 dark:text-blue-300 hover:bg-blue-100 dark:hover:bg-blue-900/60 transition-colors"
				data-mention-type="team"
			>
				<AtSign className="shrink-0" width={12} height={12} />
				{props.inlineContent.props.name}
			</span>
		),
	},
);

export const TaskReference = createReactInlineContentSpec(
	{
		type: "taskReference",
		propSchema: {
			id: {
				default: "",
			},
			title: {
				default: "Unknown",
			},
			status: {
				default: "open",
			},
		},
		content: "none",
	},
	{
		render: (props) => {
			const taskId = props.inlineContent.props.id;

			return (
				<TooltipProvider delay={200}>
					<Tooltip>
						<span
							className="inline-flex items-center gap-1 rounded-full bg-emerald-50/80 px-1.5 py-0.5 text-xs font-medium text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300 hover:bg-emerald-100 dark:hover:bg-emerald-900/60 transition-colors cursor-pointer select-none"
							data-mention-type="task"
						>
							<Hash className="shrink-0" width={12} height={12} />
							{props.inlineContent.props.title}
						</span>
						<TooltipContent className="bg-popover text-popover-foreground border border-border/40 p-3 w-60 shadow-lg pointer-events-auto">
							<TaskPreview taskId={taskId} />
						</TooltipContent>
					</Tooltip>
				</TooltipProvider>
			);
		},
	},
);

export const DocumentationReference = createReactInlineContentSpec(
	{
		type: "docReference",
		propSchema: {
			id: {
				default: "",
			},
			title: {
				default: "Unknown",
			},
		},
		content: "none",
	},
	{
		render: (props) => (
			<span
				className="inline-flex items-center gap-1 rounded-full bg-purple-50/80 px-1.5 py-0.5 text-xs font-medium text-purple-700 dark:bg-purple-900/40 dark:text-purple-300 hover:bg-purple-100 dark:hover:bg-purple-900/60 transition-colors"
				data-mention-type="doc"
			>
				<FileText className="shrink-0" width={12} height={12} />
				{props.inlineContent.props.title}
			</span>
		),
	},
);
