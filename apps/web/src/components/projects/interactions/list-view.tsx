import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Trash2 } from "lucide-react";
import { toast } from "@/components/ui/sonner";

import type { Sprint, Task, ViewConfig } from "@/lib/interaction-api";
import type {
	CustomFieldDefinition,
	ProjectMember,
	TaskStatus,
	TaskType,
} from "@/lib/project-api";

import { ListGroup } from "./list-group";
import {
	applyStatusFilterToColumnDefs,
	type ColumnGroupDef,
	DEFAULT_VISIBLE_FIELDS,
	getColumnGroupDefs,
	getSwimlaneDefs,
	getTaskColumnKeys,
	type TaskFieldUpdate,
} from "./view-utils";

// ── Props ─────────────────────────────────────────────────────────────────────

export interface ListViewProps {
	projectId: string;
	tasksQueryKey: unknown[];
	tasks: Task[];
	taskIdPrefix?: string;
	statuses: TaskStatus[];
	taskTypes: TaskType[];
	members?: ProjectMember[];
	customFields?: CustomFieldDefinition[];
	epics?: Task[];
	viewConfig?: ViewConfig;
	canCreate: boolean;
	searchQuery: string;
	onCreateTask: (
		statusId: string,
		title: string,
		taskTypeId?: string | null,
		extraFields?: TaskFieldUpdate,
	) => Promise<void>;
	onTaskClick: (task: Task) => void;
	manualSort?: boolean;
	onReorderTask?: (groupKey: string, taskId: string, newIndex: number) => void;
	onStatusChange?: (taskId: string, newStatusId: string) => void;
	canEdit?: boolean;
	sortBy?: string;
	onUpdateTaskField?: (taskId: string, update: TaskFieldUpdate) => void;
	sprints?: Sprint[];
	onStartSprint?: (
		sprintId: string,
		payload: {
			name: string;
			goal: string | null;
			start_date: string | null;
			end_date: string | null;
			status: "active";
		},
	) => Promise<void>;
	onCreateSprint?: () => void;
	onCollapseChange?: (collapsedColumns: string[]) => void;
	columnPagination?: Record<
		string,
		{
			hasMore: boolean;
			isLoadingMore: boolean;
			onLoadMore: () => void;
			totalCount?: number;
			fieldSum?: number;
		}
	>;
}

// ── Component ─────────────────────────────────────────────────────────────────

export function ListView({
	projectId,
	tasksQueryKey,
	tasks,
	taskIdPrefix = "",
	statuses,
	taskTypes,
	members = [],
	customFields = [],
	epics = [],
	viewConfig,
	canCreate,
	searchQuery,
	onCreateTask,
	onTaskClick,
	manualSort,
	onReorderTask,
	onStatusChange,
	canEdit,
	sortBy,
	onUpdateTaskField,
	sprints,
	onStartSprint,
	onCreateSprint,
	onCollapseChange,
	columnPagination,
}: ListViewProps) {
	const columnBy = viewConfig?.column_by ?? "status";
	const swimlaneBy = viewConfig?.swimlanes;
	const fieldSum = viewConfig?.field_sum;
	const visibleFields: string[] =
		viewConfig?.fields && viewConfig.fields.length > 0
			? viewConfig.fields
			: DEFAULT_VISIBLE_FIELDS;
	const isStatusGrouping =
		!viewConfig?.column_by || viewConfig.column_by === "status";

	const qc = useQueryClient();
	const [selectedTaskIds, setSelectedTaskIds] = useState<Set<string>>(new Set());

	// Bulk Update Mutation
	const bulkUpdateMutation = useMutation({
		mutationFn: async ({ taskIds, update }: { taskIds: string[]; update: TaskFieldUpdate }) => {
			const { updateTask } = await import("@/lib/interaction-api");
			await Promise.all(taskIds.map((id) => updateTask(projectId, id, update)));
		},
		onSuccess: () => {
			qc.invalidateQueries({ queryKey: tasksQueryKey });
			setSelectedTaskIds(new Set());
			toast.success("Tasks updated successfully");
		},
		onError: () => {
			toast.error("Failed to update some tasks");
		},
	});

	// Bulk Delete Mutation
	const bulkDeleteMutation = useMutation({
		mutationFn: async (taskIds: string[]) => {
			const { deleteTask } = await import("@/lib/interaction-api");
			await Promise.all(taskIds.map((id) => deleteTask(projectId, id)));
		},
		onSuccess: () => {
			qc.invalidateQueries({ queryKey: tasksQueryKey });
			setSelectedTaskIds(new Set());
			toast.success("Tasks deleted successfully");
		},
		onError: () => {
			toast.error("Failed to delete some tasks");
		},
	});

	const handleSelectTask = (taskId: string, selected: boolean) => {
		setSelectedTaskIds((prev) => {
			const next = new Set(prev);
			if (selected) {
				next.add(taskId);
			} else {
				next.delete(taskId);
			}
			return next;
		});
	};

	const handleSelectGroupTasks = (taskIds: string[], selected: boolean) => {
		setSelectedTaskIds((prev) => {
			const next = new Set(prev);
			for (const id of taskIds) {
				if (selected) {
					next.add(id);
				} else {
					next.delete(id);
				}
			}
			return next;
		});
	};

	const viewCtx = useMemo(
		() => ({ statuses, taskTypes, members, customFields, sprints }),
		[statuses, taskTypes, members, customFields, sprints],
	);

	const filtered = useMemo(
		() =>
			tasks.filter((t) => {
				if (searchQuery) {
					const q = searchQuery.toLowerCase();
					const taskId = taskIdPrefix
						? `${taskIdPrefix}-${t.task_number}`
						: `#${t.task_number}`;
					if (
						!t.title.toLowerCase().includes(q) &&
						!taskId.toLowerCase().includes(q)
					)
						return false;
				}
				return true;
			}),
		[tasks, searchQuery, taskIdPrefix],
	);

	const groupDefs = useMemo(
		() => getColumnGroupDefs(columnBy, viewCtx),
		[columnBy, viewCtx],
	);

	const effectiveGroupDefs = useMemo((): ColumnGroupDef[] => {
		let defs: ColumnGroupDef[];
		if (groupDefs.length > 0) {
			defs = groupDefs;
		} else {
			const seen = new Set<string>();
			const dynamic: ColumnGroupDef[] = [];
			for (const t of filtered) {
				for (const k of getTaskColumnKeys(t, columnBy, viewCtx)) {
					if (!seen.has(k)) {
						seen.add(k);
						dynamic.push({
							key: k,
							label: k === "__none" ? "None" : k,
							fieldValue: k,
						});
					}
				}
			}
			if (!seen.has("__none")) {
				dynamic.push({ key: "__none", label: "None", fieldValue: null });
			}
			defs = dynamic;
		}

		return applyStatusFilterToColumnDefs(
			defs,
			isStatusGrouping,
			viewConfig?.filters?.statuses,
			statuses,
		);
	}, [
		groupDefs,
		filtered,
		columnBy,
		viewCtx,
		isStatusGrouping,
		viewConfig?.filters?.statuses,
		statuses,
	]);

	const swimlaneDefs = useMemo(
		() => getSwimlaneDefs(swimlaneBy, viewCtx),
		[swimlaneBy, viewCtx],
	);

	const getGroupTasks = (groupKey: string): Task[] =>
		filtered.filter((t) =>
			getTaskColumnKeys(t, columnBy, viewCtx).includes(groupKey),
		);

	const savedCollapsedColumns = viewConfig?.collapsed_columns;

	const handleGroupCollapseChange = (
		groupKey: string,
		isCollapsed: boolean,
	) => {
		// When no saved preference exists yet, seed from the current visual state
		// (done-category groups are auto-collapsed by isDone). This ensures the
		// first save captures the full actual state rather than an empty baseline.
		const current: string[] =
			savedCollapsedColumns !== undefined
				? savedCollapsedColumns
				: effectiveGroupDefs
						.filter((grp) => {
							const s = isStatusGrouping
								? statuses.find((st) => st.id === grp.key)
								: undefined;
							return s?.category === "done";
						})
						.map((grp) => grp.key);

		const next = isCollapsed
			? [...new Set([...current, groupKey])]
			: current.filter((k) => k !== groupKey);
		onCollapseChange?.(next);
	};

	return (
		<div className="flex flex-col flex-1 min-h-0 relative">
			<div className="flex flex-col overflow-auto flex-1">
				{effectiveGroupDefs.map((grp) => {
					const groupTasks = getGroupTasks(grp.key);
					const status = isStatusGrouping
						? statuses.find((s) => s.id === grp.key)
						: undefined;
					const isDone = status?.category === "done";
					const defaultCollapsed =
						savedCollapsedColumns !== undefined
							? savedCollapsedColumns.includes(grp.key)
							: isDone;

					return (
						<ListGroup
							key={grp.key}
							groupDef={grp}
							tasks={groupTasks}
							statuses={statuses}
							taskTypes={taskTypes}
							members={members}
							customFields={customFields}
							epics={epics}
							canCreate={canCreate}
							defaultCollapsed={defaultCollapsed}
							fieldSum={fieldSum}
							swimlaneDefs={swimlaneDefs}
							swimlaneBy={swimlaneBy}
							onCreateTask={onCreateTask}
							onTaskClick={onTaskClick}
							manualSort={manualSort}
							onReorderTask={onReorderTask}
							onStatusChange={onStatusChange}
							canEdit={canEdit}
							isStatusGrouping={isStatusGrouping}
							sortBy={sortBy}
							onUpdateTaskField={onUpdateTaskField}
							visibleFields={visibleFields}
							taskIdPrefix={taskIdPrefix}
							sprint={sprints?.find((s) => s.id === grp.key)}
							onStartSprint={onStartSprint}
							onCreateSprint={onCreateSprint}
							columnBy={columnBy}
							onCollapseChange={
								onCollapseChange
									? (isCollapsed) =>
											handleGroupCollapseChange(grp.key, isCollapsed)
									: undefined
							}
							groupPagination={columnPagination?.[grp.key]}
							totalCount={columnPagination?.[grp.key]?.totalCount}
							apiFieldSum={columnPagination?.[grp.key]?.fieldSum}
							extraCreateFields={
								!isStatusGrouping && columnBy === "sprint"
									? {
											sprint_id:
												grp.key === "__backlog" ? null : (grp.key as string),
										}
									: undefined
							}
							selectedTaskIds={selectedTaskIds}
							onSelectTask={handleSelectTask}
							onSelectGroupTasks={handleSelectGroupTasks}
						/>
					);
				})}
			</div>

			{selectedTaskIds.size > 0 && (
				<div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 bg-popover/90 backdrop-blur-md border border-border/40 rounded-2xl shadow-2xl px-5 py-3.5 flex items-center gap-5 transition-all duration-300 animate-in fade-in slide-in-from-bottom-4 text-xs font-semibold select-none ring-1 ring-black/5">
					<div className="flex items-center gap-2 pr-3 border-r border-border/20 text-foreground font-bold">
						<span className="flex size-5 items-center justify-center rounded-full bg-primary text-primary-foreground text-[10px] tabular-nums font-extrabold">
							{selectedTaskIds.size}
						</span>
						<span>selected</span>
					</div>

					{/* Bulk Status Select */}
					<div className="flex items-center gap-1.5">
						<span className="text-muted-foreground text-[10.5px]">Status:</span>
						<select
							onChange={(e) => {
								const statusId = e.target.value;
								if (statusId) {
									bulkUpdateMutation.mutate({
										taskIds: Array.from(selectedTaskIds),
										update: { status_id: statusId },
									});
								}
								e.target.value = "";
							}}
							className="bg-muted/60 hover:bg-muted border border-border/40 rounded-lg px-2.5 py-1.5 text-foreground cursor-pointer focus:outline-none focus:ring-1 focus:ring-primary"
						>
							<option value="">Choose...</option>
							{statuses.map((s) => (
								<option key={s.id} value={s.id}>
									{s.name}
								</option>
							))}
						</select>
					</div>

					{/* Bulk Assignee Select */}
					{(members || []).length > 0 && (
						<div className="flex items-center gap-1.5">
							<span className="text-muted-foreground text-[10.5px]">Assignee:</span>
							<select
								onChange={(e) => {
									const assigneeId = e.target.value;
									bulkUpdateMutation.mutate({
										taskIds: Array.from(selectedTaskIds),
										update: { assignee_id: assigneeId === "unassigned" ? null : assigneeId },
									});
									e.target.value = "";
								}}
								className="bg-muted/60 hover:bg-muted border border-border/40 rounded-lg px-2.5 py-1.5 text-foreground cursor-pointer focus:outline-none focus:ring-1 focus:ring-primary max-w-28 truncate"
							>
								<option value="">Choose...</option>
								<option value="unassigned">Unassigned</option>
								{(members || []).map((m) => (
									<option key={m.id} value={m.id}>
										{m.full_name || m.username}
									</option>
								))}
							</select>
						</div>
					)}

					{/* Bulk Sprint Select */}
					{(sprints || []).length > 0 && (
						<div className="flex items-center gap-1.5">
							<span className="text-muted-foreground text-[10.5px]">Sprint:</span>
							<select
								onChange={(e) => {
									const sprintId = e.target.value;
									bulkUpdateMutation.mutate({
										taskIds: Array.from(selectedTaskIds),
										update: { sprint_id: sprintId === "backlog" ? null : sprintId },
									});
									e.target.value = "";
								}}
								className="bg-muted/60 hover:bg-muted border border-border/40 rounded-lg px-2.5 py-1.5 text-foreground cursor-pointer focus:outline-none focus:ring-1 focus:ring-primary max-w-28 truncate"
							>
								<option value="">Choose...</option>
								<option value="backlog">Backlog</option>
								{(sprints || []).map((s) => (
									<option key={s.id} value={s.id}>
										{s.name}
									</option>
								))}
							</select>
						</div>
					)}

					{/* Bulk Delete */}
					<button
						type="button"
						onClick={() => {
							if (confirm(`Delete ${selectedTaskIds.size} tasks permanently?`)) {
								bulkDeleteMutation.mutate(Array.from(selectedTaskIds));
							}
						}}
						disabled={bulkDeleteMutation.isPending}
						className="inline-flex items-center gap-1.5 rounded-lg bg-destructive/10 hover:bg-destructive text-destructive hover:text-destructive-foreground px-3 py-1.5 text-xs transition-colors duration-150 cursor-pointer active:scale-95 disabled:opacity-50"
					>
						<Trash2 className="size-3.5" />
						Delete
					</button>

					{/* Cancel / Clear Selection */}
					<button
						type="button"
						onClick={() => setSelectedTaskIds(new Set())}
						className="text-muted-foreground hover:text-foreground text-[10.5px] cursor-pointer hover:underline pl-1"
					>
						Cancel
					</button>
				</div>
			)}
		</div>
	);
}
