import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Check, Trash2, Users, Layers } from "lucide-react";
import { toast } from "@/components/ui/sonner";
import { useIsMobile } from "@/hooks/use-mobile";
import {
	type Sprint,
	type Task,
	updateTask,
	type ViewConfig,
} from "@/lib/interaction-api";
import type {
	CustomFieldDefinition,
	ProjectMember,
	TaskStatus,
	TaskType,
} from "@/lib/project-api";
import { cn } from "@/lib/utils";

import { AddTaskRow } from "./add-task-row";
import { TaskCard } from "./task-card";
import {
	getPriority,
	IMPORTANCE_BUCKET_VALUES,
	PRIORITY_LEVELS,
} from "./priority";
import {
	applyStatusFilterToColumnDefs,
	buildColumnDropUpdate,
	type ColumnGroupDef,
	DEFAULT_VISIBLE_FIELDS,
	getColumnGroupDefs,
	getSwimlaneDefs,
	getTaskColumnKeys,
	getTaskSwimlaneKey,
	type TaskFieldUpdate,
} from "./view-utils";

function getUndoUpdate(task: Task, update: TaskFieldUpdate): TaskFieldUpdate {
	const undo: TaskFieldUpdate = {};
	if ("status_id" in update) {
		undo.status_id = task.status_id;
	}
	if ("sprint_id" in update) {
		undo.sprint_id = task.sprint_id;
	}
	if ("assignee_id" in update) {
		undo.assignee_id = task.assignee_id;
	}
	if ("importance" in update) {
		undo.importance = task.importance;
	}
	if ("task_type_id" in update) {
		undo.task_type_id = task.task_type_id;
	}
	if ("custom_fields" in update && update.custom_fields) {
		const customUndo: Record<string, any> = {};
		for (const key of Object.keys(update.custom_fields)) {
			customUndo[key] = task.custom_fields?.[key] ?? null;
		}
		undo.custom_fields = customUndo;
	}
	return undo;
}

// ── Props ────────────────────────────────────────────────────────────────────

interface BoardViewProps {
	projectId: string;
	taskIdPrefix?: string;
	tasks: Task[];
	statuses: TaskStatus[];
	taskTypes: TaskType[];
	members?: ProjectMember[];
	customFields?: CustomFieldDefinition[];
	sprints?: Sprint[];
	viewConfig?: ViewConfig;
	canCreate: boolean;
	canEdit: boolean;
	searchQuery: string;
	tasksQueryKey: unknown[];
	onCreateTask: (
		statusId: string,
		title: string,
		taskTypeId?: string | null,
		extraFields?: TaskFieldUpdate,
	) => Promise<void>;
	onTaskClick: (task: Task) => void;
	epics?: Task[];
	onUpdateTask?: (taskId: string, payload: TaskFieldUpdate) => void;
	onMoveToColumn?: (taskId: string, update: TaskFieldUpdate) => void;
	manualSort?: boolean;
	onReorderTask?: (groupKey: string, taskId: string, newIndex: number) => void;
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

// ── Board view ────────────────────────────────────────────────────────────────

export function BoardView({
	projectId,
	taskIdPrefix = "",
	tasks,
	statuses,
	taskTypes,
	members = [],
	customFields = [],
	sprints = [],
	viewConfig,
	canCreate,
	canEdit,
	searchQuery,
	tasksQueryKey,
	epics = [],
	onCreateTask,
	onTaskClick,
	onUpdateTask,
	onMoveToColumn,
	manualSort,
	onReorderTask,
	onCollapseChange,
	columnPagination,
}: BoardViewProps) {
	const qc = useQueryClient();
	const columnBy = viewConfig?.column_by ?? "status";
	const swimlaneBy = viewConfig?.swimlanes;
	const fieldSum = viewConfig?.field_sum;
	const isStatusGrouping =
		!viewConfig?.column_by || viewConfig.column_by === "status";
	const visibleFields: string[] =
		viewConfig?.fields && viewConfig.fields.length > 0
			? viewConfig.fields
			: DEFAULT_VISIBLE_FIELDS;

	const viewCtx = useMemo(
		() => ({ statuses, taskTypes, members, customFields, sprints }),
		[statuses, taskTypes, members, customFields, sprints],
	);

	const [draggingId, setDraggingId] = useState<string | null>(null);
	const [overColumnKey, setOverColumnKey] = useState<string | null>(null);
	const [overCardId, setOverCardId] = useState<string | null>(null);
	// Tracks which swimlane band is being hovered: "colKey|swimKey"
	const [overSwimKey, setOverSwimKey] = useState<string | null>(null);
	const [collapsedColumns, setCollapsedColumns] = useState<Set<string>>(
		() => new Set(viewConfig?.collapsed_columns ?? []),
	);

	useEffect(() => {
		setCollapsedColumns(new Set(viewConfig?.collapsed_columns ?? []));
	}, [viewConfig?.collapsed_columns]);

	const toggleCollapse = (colKey: string) => {
		setCollapsedColumns((prev) => {
			const next = new Set(prev);
			if (next.has(colKey)) next.delete(colKey);
			else next.add(colKey);
			const cols = [...next];
			onCollapseChange?.(cols);
			return next;
		});
	};

	// Generic field-update for drag between columns
	const updateMutation = useMutation({
		mutationFn: ({
			taskId,
			update,
		}: {
			taskId: string;
			update: TaskFieldUpdate;
		}) => updateTask(projectId, taskId, update),
		onSuccess: () => qc.invalidateQueries({ queryKey: tasksQueryKey }),
	});

	const [keyboardDraggingId, setKeyboardDraggingId] = useState<string | null>(null);
	const [selectedTaskIds, setSelectedTaskIds] = useState<Set<string>>(new Set());
	const [contextMenu, setContextMenu] = useState<{ x: number; y: number; task: Task } | null>(null);

	const focusTaskIdRef = useRef<string | null>(null);

	// Focus restoration after keyboard drag moves
	useEffect(() => {
		if (focusTaskIdRef.current) {
			const taskId = focusTaskIdRef.current;
			focusTaskIdRef.current = null;
			setTimeout(() => {
				const el = document.querySelector(`[data-task-id="${taskId}"]`) as HTMLElement;
				if (el) el.focus();
			}, 50);
		}
	});

	// Close context menu on click elsewhere
	useEffect(() => {
		const handleWindowClick = () => {
			setContextMenu(null);
		};
		window.addEventListener("click", handleWindowClick);
		return () => window.removeEventListener("click", handleWindowClick);
	}, []);

	// Bulk Update Mutation
	const bulkUpdateMutation = useMutation({
		mutationFn: async ({ taskIds, update }: { taskIds: string[]; update: TaskFieldUpdate }) => {
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

	const handleKeyDownOnCard = (e: React.KeyboardEvent, task: Task) => {
		const activeEl = document.activeElement;
		if (
			activeEl &&
			(activeEl.tagName === "INPUT" ||
				activeEl.tagName === "TEXTAREA" ||
				activeEl.getAttribute("contenteditable") === "true")
		) {
			return;
		}

		if (e.key === "Enter") {
			e.preventDefault();
			onTaskClick(task);
		} else if (e.key === " ") {
			e.preventDefault();
			if (keyboardDraggingId === task.id) {
				setKeyboardDraggingId(null);
				toast.success("Task dropped");
			} else {
				setKeyboardDraggingId(task.id);
				toast.info(
					`Task picked up. Use ArrowLeft/Right to move columns, Space to drop, Escape to cancel.`,
				);
			}
		} else if (e.key === "Escape" && keyboardDraggingId === task.id) {
			e.preventDefault();
			setKeyboardDraggingId(null);
			toast.info("Task movement cancelled");
		} else if (
			keyboardDraggingId === task.id &&
			(e.key === "ArrowLeft" || e.key === "ArrowRight")
		) {
			e.preventDefault();
			const currentColKey = getTaskColumnKeys(task, columnBy, viewCtx)[0] || "__none";
			const currentIdx = effectiveColumnDefs.findIndex(
				(c) => c.key === currentColKey,
			);
			if (currentIdx !== -1) {
				let newIdx = currentIdx;
				if (e.key === "ArrowLeft") {
					newIdx = Math.max(0, currentIdx - 1);
				} else {
					newIdx = Math.min(effectiveColumnDefs.length - 1, currentIdx + 1);
				}
				if (newIdx !== currentIdx) {
					const targetCol = effectiveColumnDefs[newIdx];
					const update = buildColumnDropUpdate(
						columnBy,
						targetCol.fieldValue,
						customFields,
					);
					focusTaskIdRef.current = task.id;
					executeMoveWithUndo(task.id, update, task, targetCol.label);
				}
			}
		}
	};

	const executeMoveWithUndo = (
		taskId: string,
		update: TaskFieldUpdate,
		task: Task,
		newLabel: string,
	) => {
		const undoUpdate = getUndoUpdate(task, update);

		if (onMoveToColumn) {
			onMoveToColumn(taskId, update);
		} else {
			updateMutation.mutate({ taskId, update });
		}

		toast.success(`Task moved to "${newLabel}"`, {
			duration: 5000,
			action: {
				label: "Undo",
				onClick: () => {
					if (onMoveToColumn) {
						onMoveToColumn(taskId, undoUpdate);
					} else {
						updateMutation.mutate({ taskId, update: undoUpdate });
					}

					toast.success("Task movement undone", {
						duration: 5000,
						action: {
							label: "Redo",
							onClick: () => {
								if (onMoveToColumn) {
									onMoveToColumn(taskId, update);
								} else {
									updateMutation.mutate({ taskId, update });
								}
							},
						},
					});
				},
			},
		});
	};

	// Inline field update handler used by TaskCard — delegates to onMoveToColumn
	// (which does proper cache invalidation) or falls back to updateMutation.
	const handleInlineUpdate = (taskId: string, payload: TaskFieldUpdate) => {
		if (onUpdateTask) {
			onUpdateTask(taskId, payload);
		} else if (onMoveToColumn) {
			onMoveToColumn(taskId, payload);
		} else {
			updateMutation.mutate({ taskId, update: payload });
		}
	};

	// ── View context ──────────────────────────────────────────────────────────

	// Static column definitions (all possible values)
	const columnDefs = useMemo(
		() => getColumnGroupDefs(columnBy, viewCtx),
		[columnBy, viewCtx],
	);

	// Swimlane definitions
	const swimlaneDefs = useMemo(
		() => getSwimlaneDefs(swimlaneBy, viewCtx),
		[swimlaneBy, viewCtx],
	);

	// ── Filtering ─────────────────────────────────────────────────────────────

	const filteredTasks = useMemo(
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

	// ── Column tasks helper ───────────────────────────────────────────────────

	const getColumnTasks = (colKey: string): Task[] =>
		filteredTasks.filter((t) =>
			getTaskColumnKeys(t, columnBy, viewCtx).includes(colKey),
		);

	const getDisplayCount = (colKey: string): number => {
		const colPagination = columnPagination?.[colKey];
		if (fieldSum && fieldSum !== "count") return colPagination?.fieldSum ?? 0;
		return colPagination?.totalCount ?? getColumnTasks(colKey).length;
	};

	// ── Swimlane task helper ──────────────────────────────────────────────────

	const getSwimlaneColumnTasks = (colKey: string, swimKey: string): Task[] => {
		const colTasks = getColumnTasks(colKey);
		if (swimKey === "__all") return colTasks;
		return colTasks.filter(
			(t) => getTaskSwimlaneKey(t, swimlaneBy, viewCtx) === swimKey,
		);
	};

	// ── Drag handlers ────────────────────────────────────────────────────────

	const handleDragStart = (e: React.DragEvent, taskId: string) => {
		if (!canEdit) return;
		setDraggingId(taskId);
		e.dataTransfer.effectAllowed = "move";
		e.dataTransfer.setData("text/plain", taskId);
		e.dataTransfer.setData("application/x-paca-task-id", taskId);
	};

	const handleDragEnd = () => {
		setDraggingId(null);
		setOverColumnKey(null);
		setOverCardId(null);
		setOverSwimKey(null);
	};

	const handleDropOnColumn = (e: React.DragEvent, colDef: ColumnGroupDef) => {
		e.preventDefault();
		const taskId = e.dataTransfer.getData("text/plain");
		if (!taskId || !canEdit) return;

		const task = tasks.find((t) => t.id === taskId);
		if (!task) {
			setDraggingId(null);
			setOverColumnKey(null);
			return;
		}

		// Check if the task is already in this column
		const currentKeys = getTaskColumnKeys(task, columnBy, viewCtx);
		if (!currentKeys.includes(colDef.key)) {
			const update = buildColumnDropUpdate(
				columnBy,
				colDef.fieldValue,
				customFields,
			);
			// Preserve sprint_id when changing status so the task doesn't silently
			// get moved to the product backlog.
			if (isStatusGrouping) {
				update.sprint_id = task.sprint_id;
			}
			executeMoveWithUndo(taskId, update, task, colDef.label);
		}
		setDraggingId(null);
		setOverColumnKey(null);
		setOverCardId(null);
		setOverSwimKey(null);
	};

	const handleDropOnCard = (
		e: React.DragEvent,
		colDef: ColumnGroupDef,
		targetTaskId: string,
		targetIndex: number,
		swimDef?: ColumnGroupDef,
	) => {
		e.preventDefault();
		e.stopPropagation();
		const taskId = e.dataTransfer.getData("text/plain");
		if (!taskId || !canEdit) {
			setDraggingId(null);
			setOverCardId(null);
			setOverSwimKey(null);
			return;
		}
		const task = tasks.find((t) => t.id === taskId);
		if (!task) {
			setDraggingId(null);
			setOverCardId(null);
			setOverSwimKey(null);
			return;
		}

		const updates: TaskFieldUpdate = {};
		const currentColKeys = getTaskColumnKeys(task, columnBy, viewCtx);
		const colChanged = !currentColKeys.includes(colDef.key);

		if (colChanged) {
			const colUpdate = buildColumnDropUpdate(
				columnBy,
				colDef.fieldValue,
				customFields,
			);
			Object.assign(updates, colUpdate);
			// Preserve sprint_id when changing status so the task doesn't silently
			// get moved to the product backlog.
			if (isStatusGrouping) {
				updates.sprint_id = task.sprint_id;
			}
		}

		// Update swimlane field if task dropped onto a different band
		if (
			swimDef &&
			swimDef.key !== "__all" &&
			swimlaneBy &&
			swimlaneBy !== "none"
		) {
			const currentSwimKey = getTaskSwimlaneKey(task, swimlaneBy, viewCtx);
			if (currentSwimKey !== swimDef.key) {
				const swimUpdate = buildColumnDropUpdate(
					swimlaneBy,
					swimDef.fieldValue,
					customFields,
				);
				if (swimUpdate.custom_fields && updates.custom_fields) {
					updates.custom_fields = {
						...updates.custom_fields,
						...swimUpdate.custom_fields,
					};
				} else {
					Object.assign(updates, swimUpdate);
				}
			}
		}

		if (Object.keys(updates).length > 0) {
			executeMoveWithUndo(taskId, updates, task, colDef.label);
		} else if (manualSort && taskId !== targetTaskId && !colChanged) {
			// Reorder within same column
			const current = getColumnTasks(colDef.key);
			const srcIdx = current.findIndex((t) => t.id === taskId);
			if (srcIdx !== -1) {
				// After removing source, indices shift by -1 for elements past it.
				// Adjust so the item lands BEFORE the visual drop target.
				const adjustedTarget =
					srcIdx < targetIndex ? targetIndex - 1 : targetIndex;
				if (isStatusGrouping) {
					onReorderTask?.(colDef.key, taskId, adjustedTarget);
				}
			}
		}
		setDraggingId(null);
		setOverColumnKey(null);
		setOverCardId(null);
		setOverSwimKey(null);
	};

	/** Handles dropping a card directly onto a swimlane band (updates swimlane + column field). */
	const handleDropOnSwimlaneBand = (
		e: React.DragEvent,
		colDef: ColumnGroupDef,
		swimDef: ColumnGroupDef,
	) => {
		e.preventDefault();
		e.stopPropagation();
		const taskId = e.dataTransfer.getData("text/plain");
		if (!taskId || !canEdit) {
			setDraggingId(null);
			setOverSwimKey(null);
			return;
		}
		const task = tasks.find((t) => t.id === taskId);
		if (!task) {
			setDraggingId(null);
			setOverSwimKey(null);
			return;
		}

		const updates: TaskFieldUpdate = {};

		// Update column field if moved to a different column
		const currentColKeys = getTaskColumnKeys(task, columnBy, viewCtx);
		if (!currentColKeys.includes(colDef.key)) {
			const colUpdate = buildColumnDropUpdate(
				columnBy,
				colDef.fieldValue,
				customFields,
			);
			Object.assign(updates, colUpdate);
			// Preserve sprint_id when changing status so the task doesn't silently
			// get moved to the product backlog.
			if (isStatusGrouping) {
				updates.sprint_id = task.sprint_id;
			}
		}

		// Update swimlane field if moved to a different band
		if (swimDef.key !== "__all" && swimlaneBy && swimlaneBy !== "none") {
			const currentSwimKey = getTaskSwimlaneKey(task, swimlaneBy, viewCtx);
			if (currentSwimKey !== swimDef.key) {
				const swimUpdate = buildColumnDropUpdate(
					swimlaneBy,
					swimDef.fieldValue,
					customFields,
				);
				if (swimUpdate.custom_fields && updates.custom_fields) {
					updates.custom_fields = {
						...updates.custom_fields,
						...swimUpdate.custom_fields,
					};
				} else {
					Object.assign(updates, swimUpdate);
				}
			}
		}

		if (Object.keys(updates).length > 0) {
			executeMoveWithUndo(taskId, updates, task, colDef.label);
		}
		setDraggingId(null);
		setOverColumnKey(null);
		setOverCardId(null);
		setOverSwimKey(null);
	};

	// ── Dynamic column defs (for number/text/date fields with no preset values) ──

	const effectiveColumnDefs: ColumnGroupDef[] = useMemo(() => {
		let defs: ColumnGroupDef[];
		if (columnDefs.length > 0) {
			defs = columnDefs;
		} else {
			// Build columns from unique task values (for number/text fields)
			const seen = new Set<string>();
			const dynamic: ColumnGroupDef[] = [];
			for (const t of filteredTasks) {
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
		columnDefs,
		filteredTasks,
		columnBy,
		viewCtx,
		isStatusGrouping,
		viewConfig?.filters?.statuses,
		statuses,
	]);

	const isMobile = useIsMobile();
	const [activeColumnIndex, setActiveColumnIndex] = useState(0);

	const clampedActiveIndex = Math.max(
		0,
		Math.min(activeColumnIndex, effectiveColumnDefs.length - 1),
	);

	const mobileColumnDefs = useMemo(() => {
		if (isMobile && effectiveColumnDefs.length > 0) {
			return [effectiveColumnDefs[clampedActiveIndex]].filter(Boolean);
		}
		return effectiveColumnDefs;
	}, [isMobile, effectiveColumnDefs, clampedActiveIndex]);

	useEffect(() => {
		if (!isMobile) return;
		const handleKeyDown = (e: KeyboardEvent) => {
			const activeEl = document.activeElement;
			if (
				activeEl &&
				(activeEl.tagName === "INPUT" ||
					activeEl.tagName === "TEXTAREA" ||
					activeEl.getAttribute("contenteditable") === "true")
			) {
				return;
			}

			if (e.key === "ArrowLeft") {
				e.preventDefault();
				setActiveColumnIndex((prev) => Math.max(prev - 1, 0));
			} else if (e.key === "ArrowRight") {
				e.preventDefault();
				setActiveColumnIndex((prev) =>
					Math.min(prev + 1, effectiveColumnDefs.length - 1),
				);
			}
		};

		window.addEventListener("keydown", handleKeyDown);
		return () => window.removeEventListener("keydown", handleKeyDown);
	}, [isMobile, effectiveColumnDefs.length]);

	const [touchStartX, setTouchStartX] = useState<number | null>(null);

	const handleTouchStart = (e: React.TouchEvent) => {
		setTouchStartX(e.touches[0].clientX);
	};

	const handleTouchEnd = (e: React.TouchEvent) => {
		if (touchStartX === null) return;
		const touchEndX = e.changedTouches[0].clientX;
		const diffX = touchStartX - touchEndX;
		const swipeThreshold = 50;

		if (diffX > swipeThreshold) {
			// Swipe Left -> next column
			setActiveColumnIndex((prev) =>
				Math.min(prev + 1, effectiveColumnDefs.length - 1),
			);
		} else if (diffX < -swipeThreshold) {
			// Swipe Right -> previous column
			setActiveColumnIndex((prev) => Math.max(prev - 1, 0));
		}
		setTouchStartX(null);
	};

	// ── Helpers ───────────────────────────────────────────────────────────────

	const hasSwimlanes = Boolean(swimlaneBy && swimlaneBy !== "none");

	/** Renders the cards inside one [column × swimlane] cell. */
	const renderCellCards = (colDef: ColumnGroupDef, swimDef: ColumnGroupDef) => {
		const swimOverKey = `${colDef.key}|${swimDef.key}`;
		const laneTasks = getSwimlaneColumnTasks(colDef.key, swimDef.key);
		const isOver =
			overSwimKey === swimOverKey ||
			(!hasSwimlanes && overColumnKey === colDef.key);

		return (
			// biome-ignore lint/a11y/noStaticElementInteractions: drag-and-drop drop zone
			<div
				className={cn(
					"flex flex-col gap-2 rounded-xl p-2 min-h-28 transition-all duration-200",
					isOver
						? "bg-primary/8 ring-2 ring-primary/20"
						: "bg-muted/40 dark:bg-muted",
				)}
				onDragOver={(e) => {
					e.preventDefault();
					e.dataTransfer.dropEffect = "move";
					setOverColumnKey(colDef.key);
					setOverSwimKey(swimOverKey);
				}}
				onDragLeave={(e) => {
					if (!e.currentTarget.contains(e.relatedTarget as Node)) {
						setOverSwimKey(null);
					}
				}}
				onDrop={(e) =>
					hasSwimlanes
						? handleDropOnSwimlaneBand(e, colDef, swimDef)
						: handleDropOnColumn(e, colDef)
				}
			>
				{laneTasks.length === 0 && !columnPagination?.[colDef.key]?.hasMore && (
					<div className="flex flex-1 flex-col items-center justify-center py-6 text-muted-foreground/30">
						<p className="text-[11px]">No tasks</p>
					</div>
				)}
				{laneTasks.map((task, index) => (
					// biome-ignore lint/a11y/noStaticElementInteractions: drag-and-drop card slot
					<div
						key={task.id}
						className={cn(
							"relative",
							manualSort &&
								overCardId === task.id &&
								draggingId !== task.id &&
								"border-t-2 border-primary/60",
						)}
						onContextMenu={(e) => {
							if (!canEdit) return;
							e.preventDefault();
							setContextMenu({
								x: e.clientX,
								y: e.clientY,
								task,
							});
						}}
						onDragOver={(e) => {
							e.preventDefault();
							e.stopPropagation();
							setOverColumnKey(colDef.key);
							setOverSwimKey(swimOverKey);
							if (manualSort) setOverCardId(task.id);
						}}
						onDrop={(e) =>
							handleDropOnCard(
								e,
								colDef,
								task.id,
								index,
								hasSwimlanes ? swimDef : undefined,
							)
						}
					>
						<TaskCard
							task={task}
							taskIdPrefix={taskIdPrefix}
							statuses={statuses}
							taskTypes={taskTypes}
							members={members}
							customFields={customFields}
							epics={epics}
							visibleFields={visibleFields}
							canEdit={canEdit}
							isDragging={draggingId === task.id}
							onDragStart={(e) => handleDragStart(e, task.id)}
							onDragEnd={handleDragEnd}
							onClick={() => onTaskClick(task)}
							onUpdate={canEdit ? handleInlineUpdate : undefined}
							selected={selectedTaskIds.has(task.id)}
							onSelectChange={(val) => {
								setSelectedTaskIds((prev) => {
									const next = new Set(prev);
									if (val) next.add(task.id);
									else next.delete(task.id);
									return next;
								});
							}}
							showCheckbox={canEdit}
							isKeyboardDragging={keyboardDraggingId === task.id}
							onKeyDown={(e) => handleKeyDownOnCard(e, task)}
						/>
					</div>
				))}
				{(() => {
					const pg = columnPagination?.[colDef.key];
					if (!pg?.hasMore) return null;
					return (
						<button
							type="button"
							onClick={pg.onLoadMore}
							disabled={pg.isLoadingMore}
							className="mt-1 w-full rounded-lg border border-dashed border-border/40 py-1.5 text-[11px] font-medium text-muted-foreground/70 hover:border-primary/40 hover:text-primary transition-all duration-150 disabled:opacity-50"
						>
							{pg.isLoadingMore ? "Loading…" : "View more"}
						</button>
					);
				})()}
				{canCreate &&
					(isStatusGrouping || columnBy === "sprint") &&
					colDef.key !== "__none" && (
						<AddTaskRow
							variant="board"
							taskTypes={taskTypes}
							onAdd={(title, typeId) => {
								const extra: TaskFieldUpdate = {};
								if (!isStatusGrouping && columnBy === "sprint") {
									extra.sprint_id =
										colDef.key === "__backlog" ? null : (colDef.key as string);
								}
								if (
									hasSwimlanes &&
									swimDef.key !== "__all" &&
									swimlaneBy &&
									swimlaneBy !== "none"
								) {
									const swimUpdate = buildColumnDropUpdate(
										swimlaneBy,
										swimDef.fieldValue,
										customFields,
									);
									Object.assign(extra, swimUpdate);
								}
								const statusId = isStatusGrouping
									? colDef.key
									: (statuses.find((s) => s.category !== "done")?.id ??
										statuses[0]?.id ??
										"");
								onCreateTask(
									statusId,
									title,
									typeId,
									Object.keys(extra).length > 0 ? extra : undefined,
								);
							}}
						/>
					)}
			</div>
		);
	};

	// ── Render ────────────────────────────────────────────────────────────────

	/** Column header chip — used both in swimlane and non-swimlane layouts. */
	const renderColHeader = (colDef: ColumnGroupDef) => {
		const displayCount = getDisplayCount(colDef.key);
		const isCollapsed = collapsedColumns.has(colDef.key);
		return (
			<div className="flex items-center gap-2 px-2 pb-1 group">
				{colDef.color && (
					<span
						className="size-1.75 rounded-full shrink-0"
						style={{
							background: colDef.color,
							boxShadow: `0 0 6px ${colDef.color}40`,
						}}
					/>
				)}
				<span className="text-[11px] font-bold text-foreground/80 tracking-[0.08em] uppercase flex-1 truncate">
					{colDef.label}
				</span>
				<button
					type="button"
					onClick={() => toggleCollapse(colDef.key)}
					className="flex size-5 shrink-0 items-center justify-center rounded opacity-0 group-hover:opacity-100 transition-opacity hover:bg-muted/60"
					title={isCollapsed ? "Expand column" : "Collapse column"}
				>
					{isCollapsed ? (
						<ChevronRight className="size-3 text-muted-foreground" />
					) : (
						<ChevronLeft className="size-3 text-muted-foreground" />
					)}
				</button>
				<span className="rounded-full bg-muted/60 px-2 py-0.5 text-[10px] font-bold text-muted-foreground/70 tabular-nums">
					{displayCount}
				</span>
			</div>
		);
	};

	const boardContent = (() => {
		if (hasSwimlanes) {
			const noSwim: ColumnGroupDef = {
				key: "__all",
				label: "",
				fieldValue: null,
			};
			const visibleSwimDefs = swimlaneDefs.filter((s) => s.key !== "__all");

			return (
				<div className="flex flex-1 min-h-0 flex-col overflow-auto">
					<div className="min-w-max px-6 pt-5 pb-8 flex flex-col gap-0">
						{/* Sticky column-header row */}
						<div className="flex gap-4 pb-2 sticky top-0 z-10 bg-background border-b border-border/20 mb-1">
							{/* Swimlane label placeholder to align with row labels */}
							<div className="w-36 shrink-0" />
							{mobileColumnDefs.map((colDef) => {
								const isCollapsed = isMobile
									? false
									: collapsedColumns.has(colDef.key);
								const displayCount = getDisplayCount(colDef.key);

								if (isCollapsed) {
									return (
										<div
											key={colDef.key}
											className="w-10 shrink-0 flex flex-col items-center gap-1.5 pt-1"
										>
											<button
												type="button"
												onClick={() => toggleCollapse(colDef.key)}
												className="flex size-7 shrink-0 items-center justify-center rounded-lg hover:bg-muted/60 transition-colors"
												title="Expand column"
											>
												<ChevronRight className="size-3.5 text-muted-foreground" />
											</button>
											<span className="rounded-full bg-muted/60 px-2 py-0.5 text-[10px] font-bold text-muted-foreground/70 tabular-nums">
												{displayCount}
											</span>
											{colDef.color && (
												<span
													className="size-1.75 rounded-full shrink-0"
													style={{
														background: colDef.color,
														boxShadow: `0 0 6px ${colDef.color}40`,
													}}
												/>
											)}
											<div className="flex flex-1 items-start justify-center pt-1">
												<span
													className="text-[11px] font-bold text-foreground/60 tracking-[0.08em] uppercase whitespace-nowrap"
													style={{
														writingMode: "vertical-rl",
														transform: "rotate(180deg)",
													}}
												>
													{colDef.label}
												</span>
											</div>
										</div>
									);
								}

								return (
									<div
										key={colDef.key}
										className={cn(
											"shrink-0",
											isMobile ? "w-full flex-1" : "w-72",
										)}
									>
										{!isMobile && renderColHeader(colDef)}
									</div>
								);
							})}
						</div>

						{/* One row per swimlane */}
						{(visibleSwimDefs.length > 0 ? visibleSwimDefs : [noSwim]).map(
							(swimDef) => (
								<div
									key={swimDef.key}
									className="flex gap-4 py-3 border-b border-border/15 last:border-0"
								>
									{/* Swimlane label */}
									<div className="w-36 shrink-0 flex items-start pt-1 gap-2">
										{swimDef.color && (
											<span
												className="size-1.5 rounded-full mt-1.5 shrink-0"
												style={{ background: swimDef.color }}
											/>
										)}
										<span className="text-[11px] font-bold uppercase tracking-[0.08em] text-foreground/70 wrap-break-word leading-snug">
											{swimDef.label}
										</span>
									</div>

									{/* Column cells */}
									{mobileColumnDefs.map((colDef) => {
										const isCollapsed = isMobile
											? false
											: collapsedColumns.has(colDef.key);
										return (
											<div
												key={colDef.key}
												className={cn(
													"shrink-0",
													isMobile
														? "w-full flex-1"
														: isCollapsed
															? "w-10"
															: "w-72",
												)}
											>
												{!isCollapsed && renderCellCards(colDef, swimDef)}
											</div>
										);
									})}
								</div>
							),
						)}
					</div>
				</div>
			);
		}

		// ── No-swimlane layout ──
		const noSwimAll: ColumnGroupDef = {
			key: "__all",
			label: "",
			fieldValue: null,
		};

		return (
			<div className="flex flex-1 min-h-0 gap-4 overflow-x-auto px-6 py-5 pb-8">
				{mobileColumnDefs.map((colDef) => {
					const isCollapsed = isMobile
						? false
						: collapsedColumns.has(colDef.key);
					const displayCount = getDisplayCount(colDef.key);

					if (isCollapsed) {
						return (
							<div
								key={colDef.key}
								data-column-key={colDef.key}
								className="flex w-10 shrink-0 flex-col items-center gap-2 pt-1"
							>
								<button
									type="button"
									onClick={() => toggleCollapse(colDef.key)}
									className="flex size-7 shrink-0 items-center justify-center rounded-lg hover:bg-muted/60 transition-colors"
									title="Expand column"
								>
									<ChevronRight className="size-3.5 text-muted-foreground" />
								</button>
								<span className="rounded-full bg-muted/60 px-2 py-0.5 text-[10px] font-bold text-muted-foreground/70 tabular-nums">
									{displayCount}
								</span>
								{colDef.color && (
									<span
										className="size-1.75 rounded-full shrink-0"
										style={{
											background: colDef.color,
											boxShadow: `0 0 6px ${colDef.color}40`,
										}}
									/>
								)}
								<div className="flex flex-1 items-start justify-center pt-1">
									<span
										className="text-[11px] font-bold text-foreground/60 tracking-[0.08em] uppercase whitespace-nowrap"
										style={{
											writingMode: "vertical-rl",
											transform: "rotate(180deg)",
										}}
									>
										{colDef.label}
									</span>
								</div>
							</div>
						);
					}

					return (
						<div
							key={colDef.key}
							data-column-key={colDef.key}
							className={cn(
								"flex flex-col gap-2.5 shrink-0",
								isMobile ? "w-full flex-1" : "w-72",
							)}
						>
							{!isMobile && renderColHeader(colDef)}
							{renderCellCards(colDef, noSwimAll)}
						</div>
					);
				})}
			</div>
		);
	})();

	const overlayElements = (
		<>
			{contextMenu && (
				<div
					className="fixed z-50 bg-popover/95 border border-border/40 rounded-xl shadow-xl p-1.5 w-44 backdrop-blur-md text-[13px] text-foreground select-none"
					style={{
						top: `${contextMenu.y}px`,
						left: `${contextMenu.x}px`,
					}}
					onClick={(e) => e.stopPropagation()}
				>
					<div className="px-2.5 py-1.5 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider border-b border-border/15 mb-1">
						Task Actions
					</div>
					
					{/* Status Submenu */}
					<div className="group/status relative flex items-center justify-between px-2.5 py-1.5 rounded-lg hover:bg-muted/60 cursor-pointer transition-colors duration-100 font-medium">
						<span>Change Status</span>
						<span className="text-muted-foreground/60 text-[10px]">&gt;</span>
						<div className="absolute left-full top-0 ml-1 hidden group-hover/status:block bg-popover/95 border border-border/40 rounded-xl shadow-xl p-1 w-44 backdrop-blur-md">
							{statuses.map((s) => (
								<button
									key={s.id}
									type="button"
									onClick={() => {
										handleInlineUpdate(contextMenu.task.id, { status_id: s.id });
										setContextMenu(null);
									}}
									className="flex items-center gap-2 w-full px-2.5 py-1.5 rounded-lg hover:bg-muted/60 text-left transition-colors font-medium text-[12px] cursor-pointer"
								>
									<span className="size-1.5 rounded-full" style={{ background: s.color ?? undefined }} />
									<span className="flex-1 truncate text-left">{s.name}</span>
									{s.id === contextMenu.task.status_id && <Check className="size-3 text-primary ml-auto" />}
								</button>
							))}
						</div>
					</div>

					{/* Priority Submenu */}
					<div className="group/priority relative flex items-center justify-between px-2.5 py-1.5 rounded-lg hover:bg-muted/60 cursor-pointer transition-colors duration-100 font-medium">
						<span>Change Priority</span>
						<span className="text-muted-foreground/60 text-[10px]">&gt;</span>
						<div className="absolute left-full top-0 ml-1 hidden group-hover/priority:block bg-popover/95 border border-border/40 rounded-xl shadow-xl p-1 w-40 backdrop-blur-md">
							{PRIORITY_LEVELS.map((level) => (
								<button
									key={level.value}
									type="button"
									onClick={() => {
										handleInlineUpdate(contextMenu.task.id, {
											importance: IMPORTANCE_BUCKET_VALUES[level.value] ?? 0,
										});
										setContextMenu(null);
									}}
									className="flex items-center gap-2 w-full px-2.5 py-1.5 rounded-lg hover:bg-muted/60 text-left transition-colors font-medium text-[12px] cursor-pointer"
								>
									<span className="size-1.5 rounded-full" style={{ background: level.color }} />
									<span className="flex-1 text-left" style={{ color: level.color }}>{level.label}</span>
									{getPriority(contextMenu.task.importance).label === level.label &&
										contextMenu.task.importance > 0 === level.value > 0 && (
											<Check className="size-3 text-primary ml-auto" />
										)}
								</button>
							))}
						</div>
					</div>

					{/* Move to Sprint Submenu */}
					{(sprints || []).length > 0 && (
						<div className="group/sprint relative flex items-center justify-between px-2.5 py-1.5 rounded-lg hover:bg-muted/60 cursor-pointer transition-colors duration-100 font-medium">
							<span>Move to Sprint</span>
							<span className="text-muted-foreground/60 text-[10px]">&gt;</span>
							<div className="absolute left-full top-0 ml-1 hidden group-hover/sprint:block bg-popover/95 border border-border/40 rounded-xl shadow-xl p-1 w-48 backdrop-blur-md">
								<button
									type="button"
									onClick={() => {
										handleInlineUpdate(contextMenu.task.id, { sprint_id: null });
										setContextMenu(null);
									}}
									className="flex items-center w-full px-2.5 py-1.5 rounded-lg hover:bg-muted/60 text-left transition-colors text-[12px] cursor-pointer font-medium"
								>
									<span className="flex-1 text-muted-foreground">Product Backlog</span>
									{!contextMenu.task.sprint_id && <Check className="size-3 text-primary ml-auto" />}
								</button>
								{(sprints || []).map((s) => (
									<button
										key={s.id}
										type="button"
										onClick={() => {
											handleInlineUpdate(contextMenu.task.id, { sprint_id: s.id });
											setContextMenu(null);
										}}
										className="flex items-center gap-2 w-full px-2.5 py-1.5 rounded-lg hover:bg-muted/60 text-left transition-colors text-[12px] cursor-pointer font-medium"
									>
										<Layers className="size-3 text-violet-500 opacity-70" />
										<span className="flex-1 truncate text-left">{s.name}</span>
										{s.id === contextMenu.task.sprint_id && <Check className="size-3 text-primary ml-auto" />}
									</button>
								))}
							</div>
						</div>
					)}

					{/* Assign to Me / Unassign Option */}
					{(members || []).length > 0 && (
						<button
							type="button"
							onClick={() => {
								const myId = (members || []).find((m) => m.member_type === "human")?.id;
								const isAssignedToMe = contextMenu.task.assignee_id === myId;
								handleInlineUpdate(contextMenu.task.id, {
									assignee_id: isAssignedToMe ? null : (myId ?? null),
								});
								setContextMenu(null);
							}}
							className="flex items-center gap-2 w-full px-2.5 py-1.5 rounded-lg hover:bg-muted/60 text-left transition-colors font-medium cursor-pointer"
						>
							<Users className="size-3.5 text-muted-foreground/75" />
							<span>{contextMenu.task.assignee_id ? "Unassign" : "Assign to me"}</span>
						</button>
					)}

					<div className="border-t border-border/15 my-1" />

					{/* Delete Option */}
					<button
						type="button"
						onClick={async () => {
							const taskId = contextMenu.task.id;
							setContextMenu(null);
							if (confirm(`Are you sure you want to delete this task?`)) {
								const { deleteTask } = await import("@/lib/interaction-api");
								await deleteTask(projectId, taskId);
								qc.invalidateQueries({ queryKey: tasksQueryKey });
								toast.success("Task deleted");
							}
						}}
						className="flex items-center gap-2 w-full px-2.5 py-1.5 rounded-lg hover:bg-destructive/10 text-destructive text-left transition-colors font-semibold cursor-pointer"
					>
						<Trash2 className="size-3.5" />
						<span>Delete</span>
					</button>
				</div>
			)}

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
		</>
	);

	if (isMobile) {
		return (
			<div className="flex flex-1 flex-col min-h-0">
				{/* Mobile Column Tabs Header */}
				<div className="flex items-center gap-2 px-6 py-3 bg-muted/20 border-b border-border/40 overflow-x-auto shrink-0 select-none no-scrollbar">
					{effectiveColumnDefs.map((colDef, idx) => {
						const isActive = idx === clampedActiveIndex;
						const displayCount = getDisplayCount(colDef.key);
						return (
							<button
								key={colDef.key}
								type="button"
								onClick={() => setActiveColumnIndex(idx)}
								className={cn(
									"flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-all border cursor-pointer",
									isActive
										? "bg-background text-foreground border-border/60 shadow-sm"
										: "bg-transparent text-muted-foreground border-transparent hover:text-foreground hover:bg-muted/40",
								)}
							>
								{colDef.color && (
									<span
										className="size-1.5 rounded-full shrink-0"
										style={{ background: colDef.color }}
									/>
								)}
								<span>{colDef.label}</span>
								<span className="rounded-full bg-muted/60 px-1.5 py-0.25 text-[9px] font-bold text-muted-foreground/75 tabular-nums">
									{displayCount}
								</span>
							</button>
						);
					})}
				</div>

				{/* Single Swipeable Column Content wrapper */}
				<div
					onTouchStart={handleTouchStart}
					onTouchEnd={handleTouchEnd}
					className="flex flex-1 min-h-0 flex-col overflow-y-auto relative"
				>
					{boardContent}

					{/* Navigation Chevrons overlays on mobile */}
					{clampedActiveIndex > 0 && (
						<button
							type="button"
							onClick={() => setActiveColumnIndex((prev) => prev - 1)}
							className="absolute left-2 top-1/2 -translate-y-1/2 flex size-8 items-center justify-center rounded-full bg-background/80 backdrop-blur-sm border border-border shadow-md text-muted-foreground hover:text-foreground active:scale-95 transition-all z-20 cursor-pointer"
						>
							<ChevronLeft className="size-4" />
						</button>
					)}
					{clampedActiveIndex < effectiveColumnDefs.length - 1 && (
						<button
							type="button"
							onClick={() => setActiveColumnIndex((prev) => prev + 1)}
							className="absolute right-2 top-1/2 -translate-y-1/2 flex size-8 items-center justify-center rounded-full bg-background/80 backdrop-blur-sm border border-border shadow-md text-muted-foreground hover:text-foreground active:scale-95 transition-all z-20 cursor-pointer"
						>
							<ChevronRight className="size-4" />
						</button>
					)}
				</div>
				{overlayElements}
			</div>
		);
	}

	return (
		<>
			{boardContent}
			{overlayElements}
		</>
	);
}
