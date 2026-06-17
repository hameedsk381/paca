import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Task } from "@/lib/interaction-api";
import type { TaskStatus, TaskType } from "@/lib/project-api";
import { TaskCard } from "./task-card";

const { mockUseQuery } = vi.hoisted(() => ({
	mockUseQuery: vi.fn().mockReturnValue({ data: [] }),
}));

vi.mock("@tanstack/react-query", async (importOriginal) => {
	const actual = await importOriginal() as any;
	return {
		...actual,
		useQuery: mockUseQuery,
	};
});

// ── Fixtures ──────────────────────────────────────────────────────────────────

const makeTask = (overrides: Partial<Task> = {}): Task => ({
	id: "task-1",
	project_id: "proj-1",
	title: "Fix the login bug",
	task_number: 0,
	sprint_id: "sprint-1",
	status_id: "status-1",
	task_type_id: null,
	parent_task_id: null,
	description: null,
	importance: 0,
	assignee_id: null,
	reporter_id: null,
	custom_fields: {},
	view_position: null,
	view_group_key: null,
	created_at: "2026-01-01T00:00:00Z",
	updated_at: "2026-01-01T00:00:00Z",
	...overrides,
});

const NO_TYPES: TaskType[] = [];
const NO_STATUSES: TaskStatus[] = [];

const bugType: TaskType = {
	id: "type-bug",
	project_id: "proj-1",
	name: "Bug",
	icon: null,
	color: "#FF0000",
	description: null,
	created_at: "2026-01-01T00:00:00Z",
	updated_at: "2026-01-01T00:00:00Z",
};

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("TaskCard", () => {
	beforeEach(() => {
		mockUseQuery.mockReset();
		mockUseQuery.mockReturnValue({ data: [] });
	});

	it("renders the task title", () => {
		render(
			<TaskCard
				task={makeTask()}
				statuses={NO_STATUSES}
				taskTypes={NO_TYPES}
			/>,
		);
		expect(screen.getByText("Fix the login bug")).toBeInTheDocument();
	});

	it("does not render a type badge when task has no task_type_id", () => {
		render(
			<TaskCard
				task={makeTask({ task_type_id: null })}
				statuses={NO_STATUSES}
				taskTypes={[bugType]}
			/>,
		);
		expect(screen.queryByText("Bug")).not.toBeInTheDocument();
	});

	it("renders the task type badge when a matching type exists", () => {
		render(
			<TaskCard
				task={makeTask({ task_type_id: "type-bug" })}
				statuses={NO_STATUSES}
				taskTypes={[bugType]}
			/>,
		);
		expect(screen.getByText("Bug")).toBeInTheDocument();
	});

	it("calls onClick when the card is clicked", () => {
		const onClick = vi.fn();
		render(
			<TaskCard
				task={makeTask()}
				statuses={NO_STATUSES}
				taskTypes={NO_TYPES}
				onClick={onClick}
			/>,
		);
		fireEvent.click(screen.getByText("Fix the login bug"));
		expect(onClick).toHaveBeenCalledOnce();
	});

	it("is draggable when canEdit=true", () => {
		const { container } = render(
			<TaskCard
				task={makeTask()}
				statuses={NO_STATUSES}
				taskTypes={NO_TYPES}
				canEdit={true}
			/>,
		);
		const card = container.querySelector("[data-task-id='task-1']");
		expect(card).toHaveAttribute("draggable", "true");
	});

	it("is not draggable when canEdit=false", () => {
		const { container } = render(
			<TaskCard
				task={makeTask()}
				statuses={NO_STATUSES}
				taskTypes={NO_TYPES}
				canEdit={false}
			/>,
		);
		const card = container.querySelector("[data-task-id='task-1']");
		expect(card).toHaveAttribute("draggable", "false");
	});

	it("calls onDragStart with the drag event", () => {
		const onDragStart = vi.fn();
		const { container } = render(
			<TaskCard
				task={makeTask()}
				statuses={NO_STATUSES}
				taskTypes={NO_TYPES}
				canEdit={true}
				onDragStart={onDragStart}
			/>,
		);
		const card = container.querySelector("[data-task-id='task-1']") as Element;
		fireEvent.dragStart(card);
		expect(onDragStart).toHaveBeenCalledOnce();
	});

	it("calls onDragEnd when drag ends", () => {
		const onDragEnd = vi.fn();
		const { container } = render(
			<TaskCard
				task={makeTask()}
				statuses={NO_STATUSES}
				taskTypes={NO_TYPES}
				canEdit={true}
				onDragEnd={onDragEnd}
			/>,
		);
		const card = container.querySelector("[data-task-id='task-1']") as Element;
		fireEvent.dragEnd(card);
		expect(onDragEnd).toHaveBeenCalledOnce();
	});

	it("applies dragging styles when isDragging=true", () => {
		const { container } = render(
			<TaskCard
				task={makeTask()}
				statuses={NO_STATUSES}
				taskTypes={NO_TYPES}
				isDragging={true}
			/>,
		);
		const card = container.querySelector("[data-task-id='task-1']") as Element;
		// isDragging adds opacity-50 class
		expect(card.className).toMatch(/opacity-50/);
	});

	it("shows the assignee icon when task has an assignee", () => {
		const { container } = render(
			<TaskCard
				task={makeTask({ assignee_id: "user-1" })}
				statuses={NO_STATUSES}
				taskTypes={NO_TYPES}
			/>,
		);
		// assigned state: filled avatar circle with ring-primary/20
		const assigneeEl = container.querySelector(".ring-primary\\/20");
		expect(assigneeEl).toBeInTheDocument();
	});

	it("renders Epic progress bar when task is Epic and has subtasks", () => {
		const epicType: TaskType = {
			id: "type-epic",
			project_id: "proj-1",
			name: "Epic",
			icon: null,
			color: "#8B5CF6",
			description: null,
			is_system: true,
			created_at: "2026-01-01T00:00:00Z",
			updated_at: "2026-01-01T00:00:00Z",
		};
		const subtasks: Task[] = [
			makeTask({ id: "st-1", status_id: "status-done" }),
			makeTask({ id: "st-2", status_id: "status-todo" }),
		];
		const statuses: TaskStatus[] = [
			{ id: "status-done", project_id: "proj-1", name: "Done", position: 1, category: "done", created_at: "2026-01-01", updated_at: "2026-01-01" },
			{ id: "status-todo", project_id: "proj-1", name: "Todo", position: 2, category: "todo", created_at: "2026-01-01", updated_at: "2026-01-01" },
		];

		mockUseQuery.mockImplementation(({ queryKey }) => {
			if (queryKey.includes("subtasks") || queryKey.includes("children")) {
				return { data: subtasks };
			}
			return { data: [] };
		});

		render(
			<TaskCard
				task={makeTask({ task_type_id: "type-epic" })}
				statuses={statuses}
				taskTypes={[epicType]}
			/>
		);

		expect(screen.getByText("Subtasks")).toBeInTheDocument();
		expect(screen.getByText("1/2 (50%)")).toBeInTheDocument();
	});

	it("renders comment and attachment counts when present", () => {
		mockUseQuery.mockImplementation(({ queryKey }) => {
			if (queryKey.includes("activities")) {
				return { data: [{ id: "act-1", activity_type: "comment" }] };
			}
			if (queryKey.includes("attachments")) {
				return { data: [{ id: "att-1" }] };
			}
			return { data: [] };
		});

		render(
			<TaskCard
				task={makeTask()}
				statuses={NO_STATUSES}
				taskTypes={NO_TYPES}
			/>
		);

		expect(screen.getByTitle("1 attachment")).toBeInTheDocument();
		expect(screen.getByTitle("1 comment")).toBeInTheDocument();
		expect(screen.getAllByText("1")).toHaveLength(2);
	});
});
