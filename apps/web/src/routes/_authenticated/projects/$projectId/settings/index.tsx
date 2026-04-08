import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import {
	AlertTriangle,
	Check,
	Edit2,
	Key,
	LayoutList,
	Loader2,
	Lock,
	Plus,
	Settings,
	Shield,
	Tag,
	Trash2,
	X,
} from "lucide-react";
import { useEffect, useState } from "react";
import { DeleteProjectRoleDialog } from "@/components/projects/roles/DeleteProjectRoleDialog";
import { ProjectRoleFormDialog } from "@/components/projects/roles/ProjectRoleFormDialog";
import { DeleteTaskStatusDialog } from "@/components/projects/task-statuses/DeleteTaskStatusDialog";
import { TaskStatusFormDialog } from "@/components/projects/task-statuses/TaskStatusFormDialog";
import { DeleteTaskTypeDialog } from "@/components/projects/task-types/DeleteTaskTypeDialog";
import { TaskTypeFormDialog } from "@/components/projects/task-types/TaskTypeFormDialog";
import { getTaskTypeIconComponent } from "@/components/projects/task-types/task-type-icons";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogClose,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { usePermissions } from "@/hooks/use-permissions";
import { ApiErrorCode, getApiErrorCode } from "@/lib/api-error";
import { currentUserQueryOptions } from "@/lib/auth-api";
import { cn } from "@/lib/utils";
import {
	deleteProject,
	type ProjectMember,
	type ProjectRole,
	projectMembersQueryOptions,
	projectQueryOptions,
	projectRolesQueryOptions,
	STATUS_CATEGORY_LABELS,
	type TaskStatus,
	type TaskType,
	taskStatusesQueryOptions,
	taskTypesQueryOptions,
	updateProject,
} from "@/lib/project-api";

export const Route = createFileRoute(
	"/_authenticated/projects/$projectId/settings/",
)({
	loader: async ({ context: { queryClient }, params: { projectId } }) => {
		await Promise.all([
			queryClient.ensureQueryData(projectQueryOptions(projectId)),
			queryClient.ensureQueryData(projectRolesQueryOptions(projectId)),
			queryClient.ensureQueryData(projectMembersQueryOptions(projectId)),
			queryClient.ensureQueryData(taskStatusesQueryOptions(projectId)),
			queryClient.ensureQueryData(taskTypesQueryOptions(projectId)),
		]);
	},
	component: SettingsPage,
});

// ── General Settings ──────────────────────────────────────────────────────────

function GeneralSettings({
	projectId,
	canEdit,
}: {
	projectId: string;
	canEdit: boolean;
}) {
	const queryClient = useQueryClient();
	const { data: project } = useQuery(projectQueryOptions(projectId));

	const [name, setName] = useState(project?.name ?? "");
	const [description, setDescription] = useState(project?.description ?? "");
	const [nameError, setNameError] = useState<string | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [saved, setSaved] = useState(false);

	const mutation = useMutation({
		mutationFn: () =>
			updateProject(projectId, {
				name: name.trim(),
				description: description.trim(),
			}),
		onSuccess: async (updated) => {
			await queryClient.invalidateQueries({
				queryKey: projectQueryOptions(projectId).queryKey,
			});
			// Also update the projects list cache
			await queryClient.invalidateQueries({ queryKey: ["projects"] });
			setName(updated.name);
			setDescription(updated.description);
			setError(null);
			setNameError(null);
			setSaved(true);
			setTimeout(() => setSaved(false), 2500);
		},
		onError: (err: unknown) => {
			const code = getApiErrorCode(err);
			if (code === ApiErrorCode.ProjectNameTaken) {
				setNameError("A project with this name already exists.");
				return;
			}
			if (code === ApiErrorCode.ProjectNameInvalid) {
				setNameError("Project name is empty or invalid.");
				return;
			}
			setError("Failed to update project. Please try again.");
		},
	});

	const isDirty =
		name.trim() !== (project?.name ?? "") ||
		description.trim() !== (project?.description ?? "");

	return (
		<div className="rounded-xl border border-border/60 bg-card p-6">
			<h3 className="font-[Syne] text-base font-semibold mb-4">General</h3>
			<div className="space-y-4 max-w-md">
				<div className="space-y-1.5">
					<Label htmlFor="project-name">Project name</Label>
					<Input
						id="project-name"
						value={name}
						onChange={(e) => {
							setName(e.target.value);
							setNameError(null);
						}}
						placeholder="My awesome project"
						disabled={!canEdit}
						className={
							nameError
								? "border-destructive focus-visible:ring-destructive/30"
								: ""
						}
					/>
					{nameError ? (
						<p className="text-xs text-destructive">{nameError}</p>
					) : null}
				</div>

				<div className="space-y-1.5">
					<Label htmlFor="project-description">Description</Label>
					<Textarea
						id="project-description"
						value={description}
						onChange={(e) => setDescription(e.target.value)}
						placeholder="Describe what this project is about…"
						rows={3}
						disabled={!canEdit}
						className="resize-none"
					/>
				</div>

				{error ? (
					<p className="text-xs text-destructive bg-destructive/10 rounded-lg px-3 py-2">
						{error}
					</p>
				) : null}

				{canEdit ? (
					<div className="flex items-center gap-2 pt-1">
						<Button
							size="sm"
							disabled={!isDirty || mutation.isPending}
							onClick={() => mutation.mutate()}
							className="gap-1.5"
						>
							{mutation.isPending ? (
								<Loader2 className="size-3.5 animate-spin" />
							) : null}
							Save changes
						</Button>
						{saved ? (
							<span className="text-xs text-emerald-600 dark:text-emerald-400 font-medium">
								Saved ✓
							</span>
						) : null}
					</div>
				) : (
					<p className="text-xs text-muted-foreground">
						You don't have permission to edit this project.
					</p>
				)}
			</div>
		</div>
	);
}

// ── Roles Section ─────────────────────────────────────────────────────────────

function activePermissions(perms: Record<string, unknown>): string[] {
	return Object.entries(perms)
		.filter(([, v]) => Boolean(v))
		.map(([k]) => k);
}

function formatDate(iso: string) {
	return new Date(iso).toLocaleDateString("en-US", {
		year: "numeric",
		month: "short",
		day: "numeric",
	});
}

function projectPermissionBadgeClass(key: string): string {
	const domain = key.split(".").slice(0, 2).join(".");
	if (domain === "projects") {
		return "bg-primary/10 text-primary border-primary/20 dark:bg-primary/20";
	}
	if (domain === "project.members") {
		return "bg-violet-50 text-violet-700 border-violet-200 dark:bg-violet-900/20 dark:text-violet-400 dark:border-violet-700/30";
	}
	if (domain === "project.roles") {
		return "bg-sky-50 text-sky-700 border-sky-200 dark:bg-sky-900/20 dark:text-sky-400 dark:border-sky-700/30";
	}
	if (domain === "tasks") {
		return "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-900/20 dark:text-amber-400 dark:border-amber-700/30";
	}
	if (domain === "sprints") {
		return "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-900/20 dark:text-emerald-400 dark:border-emerald-700/30";
	}
	return "bg-muted text-muted-foreground border-border";
}

function RolesTableSkeleton() {
	return (
		<div className="rounded-xl border overflow-hidden">
			<div className="border-b bg-muted/40 px-5 py-3">
				<div className="flex gap-4">
					<Skeleton className="h-3.5 w-16" />
					<Skeleton className="h-3.5 w-24" />
					<Skeleton className="ml-auto h-3.5 w-14" />
				</div>
			</div>
			{["row-1", "row-2", "row-3"].map((rowKey) => (
				<div
					key={rowKey}
					className="flex items-center gap-4 border-b px-5 py-4 last:border-0"
				>
					<Skeleton className="h-5 w-36 rounded-md" />
					<div className="flex flex-1 gap-1.5">
						<Skeleton className="h-5 w-28 rounded-full" />
						<Skeleton className="h-5 w-24 rounded-full" />
					</div>
					<Skeleton className="h-4 w-20" />
					<div className="flex gap-1.5">
						<Skeleton className="size-7 rounded-md" />
						<Skeleton className="size-7 rounded-md" />
					</div>
				</div>
			))}
		</div>
	);
}

interface RoleRowProps {
	role: ProjectRole;
	canManageRoles: boolean;
	onEdit: (role: ProjectRole) => void;
	onDelete: (role: ProjectRole) => void;
}

function RoleTableRow({
	role,
	canManageRoles,
	onEdit,
	onDelete,
}: RoleRowProps) {
	const isSystem = !role.project_id;
	const active = activePermissions(role.permissions);

	return (
		<TableRow className="group">
			<TableCell className="px-5">
				<div className="flex items-center gap-2">
					<Lock className="size-3.5 shrink-0 text-muted-foreground/40" />
					<span className="font-mono text-sm font-medium">
						{role.role_name}
					</span>
				</div>
			</TableCell>
			<TableCell className="px-5">
				{active.length === 0 ? (
					<span className="text-xs italic text-muted-foreground/60">
						No permissions assigned
					</span>
				) : (
					<div className="flex flex-wrap gap-1">
						{active.map((permission) => (
							<span
								key={permission}
								className={`inline-flex items-center rounded-full border px-2 py-0.5 font-mono text-[0.68rem] font-medium leading-none ${projectPermissionBadgeClass(permission)}`}
							>
								{permission}
							</span>
						))}
					</div>
				)}
			</TableCell>
			<TableCell className="px-5 text-sm text-muted-foreground">
				{formatDate(role.created_at)}
			</TableCell>
			<TableCell className="px-5">
				{!isSystem && canManageRoles ? (
					<div className="flex items-center justify-end gap-0.5 opacity-100 transition-opacity sm:opacity-0 sm:group-hover:opacity-100">
						<Button
							variant="ghost"
							size="icon-sm"
							onClick={() => onEdit(role)}
							title="Edit role"
						>
							<Edit2 className="size-3.5" />
						</Button>
						<Button
							variant="ghost"
							size="icon-sm"
							className="text-destructive hover:text-destructive hover:bg-destructive/10"
							onClick={() => onDelete(role)}
							title="Delete role"
						>
							<Trash2 className="size-3.5" />
						</Button>
					</div>
				) : null}
			</TableCell>
		</TableRow>
	);
}

function RolesSettings({
	projectId,
	canManageRoles,
}: {
	projectId: string;
	canManageRoles: boolean;
}) {
	const { data: roles, isLoading } = useQuery(
		projectRolesQueryOptions(projectId),
	);

	const [createOpen, setCreateOpen] = useState(false);
	const [editRole, setEditRole] = useState<ProjectRole | null>(null);
	const [deleteRole, setDeleteRole] = useState<ProjectRole | null>(null);

	const systemRoles = roles?.filter((r) => !r.project_id) ?? [];

	return (
		<div className="rounded-xl border border-border/60 bg-card p-6">
			{/* Header */}
			<div className="flex items-center justify-between mb-1">
				<div>
					<h3 className="font-[Syne] text-base font-semibold">Project Roles</h3>
					<p className="text-xs text-muted-foreground mt-0.5">
						Manage roles and permissions for members of this project.
					</p>
				</div>
				{canManageRoles ? (
					<Button
						size="sm"
						variant="outline"
						className="gap-1.5 border-border/60 shrink-0"
						onClick={() => setCreateOpen(true)}
					>
						<Plus className="size-3.5" />
						New role
					</Button>
				) : null}
			</div>

			{/* Stats strip */}
			{!isLoading && roles && roles.length > 0 ? (
				<div className="flex items-center gap-5 rounded-xl border bg-muted/20 px-5 py-3 mt-4">
					<div className="flex items-center gap-2">
						<Shield className="size-4 text-primary" />
						<span className="text-sm">
							<span className="font-semibold tabular-nums">{roles.length}</span>
							<span className="ml-1.5 text-muted-foreground">
								{roles.length === 1 ? "role" : "roles"} defined
							</span>
						</span>
					</div>
					<div className="h-4 w-px bg-border" />
					<div className="flex items-center gap-2">
						<Key className="size-4 text-muted-foreground" />
						<span className="text-sm">
							<span className="font-semibold tabular-nums">
								{roles.reduce(
									(sum, r) => sum + activePermissions(r.permissions).length,
									0,
								)}
							</span>
							<span className="ml-1.5 text-muted-foreground">
								permission grants across all roles
							</span>
						</span>
					</div>
				</div>
			) : null}

			{/* Table */}
			{isLoading ? (
				<RolesTableSkeleton />
			) : !roles?.length ? (
				<div className="flex flex-col items-center gap-4 rounded-xl border border-dashed bg-muted/20 py-16 text-center mt-4">
					<div className="flex size-12 items-center justify-center rounded-full bg-muted text-muted-foreground/60">
						<Shield className="size-6" />
					</div>
					<div>
						<p className="text-sm font-medium">No roles defined yet</p>
						<p className="mt-1 text-xs text-muted-foreground">
							Create your first role to start assigning permissions to members.
						</p>
					</div>
					{canManageRoles ? (
						<Button
							size="sm"
							variant="outline"
							onClick={() => setCreateOpen(true)}
						>
							<Plus className="size-4" />
							Create role
						</Button>
					) : null}
				</div>
			) : (
				<div className="overflow-x-auto rounded-xl border mt-4">
					<Table>
						<TableHeader>
							<TableRow className="bg-muted/40 hover:bg-muted/40">
								<TableHead className="w-44 px-5 text-xs font-semibold uppercase tracking-wide">
									Name
								</TableHead>
								<TableHead className="px-5 text-xs font-semibold uppercase tracking-wide">
									Permissions
								</TableHead>
								<TableHead className="w-32 px-5 text-xs font-semibold uppercase tracking-wide">
									Created
								</TableHead>
								<TableHead className="w-20 px-5 text-xs font-semibold uppercase tracking-wide" />
							</TableRow>
						</TableHeader>
						<TableBody>
							{roles.map((role) => (
								<RoleTableRow
									key={role.id}
									role={role}
									canManageRoles={canManageRoles}
									onEdit={setEditRole}
									onDelete={setDeleteRole}
								/>
							))}
						</TableBody>
					</Table>
				</div>
			)}

			{/* System roles note */}
			{systemRoles.length > 0 ? (
				<p className="text-xs text-muted-foreground/60 mt-3 flex items-center gap-1">
					<Lock className="size-3 shrink-0" />
					System roles are shared templates and cannot be edited or deleted.
				</p>
			) : null}

			{/* Dialogs */}
			<ProjectRoleFormDialog
				projectId={projectId}
				open={createOpen}
				onOpenChange={setCreateOpen}
			/>

			{editRole ? (
				<ProjectRoleFormDialog
					projectId={projectId}
					role={editRole}
					open={!!editRole}
					onOpenChange={(open) => {
						if (!open) setEditRole(null);
					}}
				/>
			) : null}

			{deleteRole ? (
				<DeleteProjectRoleDialog
					projectId={projectId}
					role={deleteRole}
					open={!!deleteRole}
					onOpenChange={(open) => {
						if (!open) setDeleteRole(null);
					}}
				/>
			) : null}
		</div>
	);
}

// ── Task Statuses Section ─────────────────────────────────────────────────────

function StatusCategoryBadge({ category }: { category: string }) {
	const colors: Record<string, string> = {
		backlog:
			"bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-900/30 dark:text-slate-400 dark:border-slate-700/30",
		refinement:
			"bg-violet-50 text-violet-700 border-violet-200 dark:bg-violet-900/20 dark:text-violet-400 dark:border-violet-700/30",
		ready:
			"bg-sky-50 text-sky-700 border-sky-200 dark:bg-sky-900/20 dark:text-sky-400 dark:border-sky-700/30",
		todo: "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-900/20 dark:text-amber-400 dark:border-amber-700/30",
		inprogress:
			"bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-900/20 dark:text-blue-400 dark:border-blue-700/30",
		done: "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-900/20 dark:text-emerald-400 dark:border-emerald-700/30",
	};
	const label =
		STATUS_CATEGORY_LABELS[category as keyof typeof STATUS_CATEGORY_LABELS] ??
		category;
	return (
		<span
			className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[0.68rem] font-medium leading-none ${colors[category] ?? "bg-muted text-muted-foreground border-border"}`}
		>
			{label}
		</span>
	);
}

function TaskStatusesSettings({
	projectId,
	canWrite,
}: {
	projectId: string;
	canWrite: boolean;
}) {
	const { data: statuses, isLoading } = useQuery(
		taskStatusesQueryOptions(projectId),
	);
	const [createOpen, setCreateOpen] = useState(false);
	const [editStatus, setEditStatus] = useState<TaskStatus | null>(null);
	const [deleteStatus, setDeleteStatus] = useState<TaskStatus | null>(null);

	const sorted = [...(statuses ?? [])].sort((a, b) => a.position - b.position);

	return (
		<div className="rounded-xl border border-border/60 bg-card p-6">
			<div className="flex items-center justify-between mb-1">
				<div>
					<h3 className="font-[Syne] text-base font-semibold">Task Statuses</h3>
					<p className="text-xs text-muted-foreground mt-0.5">
						Define the workflow statuses tasks move through in this project.
					</p>
				</div>
				{canWrite ? (
					<Button
						size="sm"
						variant="outline"
						className="gap-1.5 border-border/60 shrink-0"
						onClick={() => setCreateOpen(true)}
					>
						<Plus className="size-3.5" />
						New status
					</Button>
				) : null}
			</div>

			{isLoading ? (
				<div className="rounded-xl border overflow-hidden mt-4">
					{["s1", "s2", "s3"].map((k) => (
						<div
							key={k}
							className="flex items-center gap-4 border-b px-5 py-4 last:border-0"
						>
							<Skeleton className="size-3 rounded-full" />
							<Skeleton className="h-4 w-32" />
							<Skeleton className="h-5 w-20 rounded-full ml-auto" />
							<div className="flex gap-1.5">
								<Skeleton className="size-7 rounded-md" />
								<Skeleton className="size-7 rounded-md" />
							</div>
						</div>
					))}
				</div>
			) : !sorted.length ? (
				<div className="flex flex-col items-center gap-4 rounded-xl border border-dashed bg-muted/20 py-16 text-center mt-4">
					<div className="flex size-12 items-center justify-center rounded-full bg-muted text-muted-foreground/60">
						<LayoutList className="size-6" />
					</div>
					<div>
						<p className="text-sm font-medium">No statuses defined</p>
						<p className="mt-1 text-xs text-muted-foreground">
							Create statuses to define the workflow for tasks in this project.
						</p>
					</div>
					{canWrite ? (
						<Button
							size="sm"
							variant="outline"
							onClick={() => setCreateOpen(true)}
						>
							<Plus className="size-4" />
							Create status
						</Button>
					) : null}
				</div>
			) : (
				<div className="overflow-x-auto rounded-xl border mt-4">
					<Table>
						<TableHeader>
							<TableRow className="bg-muted/40 hover:bg-muted/40">
								<TableHead className="w-8 px-5 text-xs font-semibold uppercase tracking-wide">
									#
								</TableHead>
								<TableHead className="px-5 text-xs font-semibold uppercase tracking-wide">
									Name
								</TableHead>
								<TableHead className="w-36 px-5 text-xs font-semibold uppercase tracking-wide">
									Category
								</TableHead>
								<TableHead className="w-20 px-5 text-xs font-semibold uppercase tracking-wide" />
							</TableRow>
						</TableHeader>
						<TableBody>
							{sorted.map((status) => (
								<TableRow key={status.id} className="group">
									<TableCell className="px-5 text-sm text-muted-foreground tabular-nums">
										{status.position + 1}
									</TableCell>
									<TableCell className="px-5">
										<div className="flex items-center gap-2">
											<span
												className="inline-block size-2.5 rounded-full shrink-0"
												style={{
													backgroundColor: status.color ?? "#6366f1",
												}}
											/>
											<span className="text-sm font-medium">{status.name}</span>
										</div>
									</TableCell>
									<TableCell className="px-5">
										<StatusCategoryBadge category={status.category} />
									</TableCell>
									<TableCell className="px-5">
										{canWrite ? (
											<div className="flex items-center justify-end gap-0.5 opacity-100 transition-opacity sm:opacity-0 sm:group-hover:opacity-100">
												<Button
													variant="ghost"
													size="icon-sm"
													onClick={() => setEditStatus(status)}
													title="Edit status"
												>
													<Edit2 className="size-3.5" />
												</Button>
												<Button
													variant="ghost"
													size="icon-sm"
													className="text-destructive hover:text-destructive hover:bg-destructive/10"
													onClick={() => setDeleteStatus(status)}
													title="Delete status"
												>
													<Trash2 className="size-3.5" />
												</Button>
											</div>
										) : null}
									</TableCell>
								</TableRow>
							))}
						</TableBody>
					</Table>
				</div>
			)}

			<TaskStatusFormDialog
				projectId={projectId}
				defaultPosition={sorted.length}
				open={createOpen}
				onOpenChange={setCreateOpen}
			/>
			{editStatus ? (
				<TaskStatusFormDialog
					projectId={projectId}
					status={editStatus}
					open={!!editStatus}
					onOpenChange={(o) => {
						if (!o) setEditStatus(null);
					}}
				/>
			) : null}
			{deleteStatus ? (
				<DeleteTaskStatusDialog
					projectId={projectId}
					status={deleteStatus}
					open={!!deleteStatus}
					onOpenChange={(o) => {
						if (!o) setDeleteStatus(null);
					}}
				/>
			) : null}
		</div>
	);
}

// ── Task Types Section ────────────────────────────────────────────────────────

function TaskTypesSettings({
	projectId,
	canWrite,
}: {
	projectId: string;
	canWrite: boolean;
}) {
	const { data: types, isLoading } = useQuery(taskTypesQueryOptions(projectId));
	const [createOpen, setCreateOpen] = useState(false);
	const [editType, setEditType] = useState<TaskType | null>(null);
	const [deleteType, setDeleteType] = useState<TaskType | null>(null);

	return (
		<div className="rounded-xl border border-border/60 bg-card p-6">
			<div className="flex items-center justify-between mb-1">
				<div>
					<h3 className="font-[Syne] text-base font-semibold">Task Types</h3>
					<p className="text-xs text-muted-foreground mt-0.5">
						Categorise tasks with custom types (e.g. Bug, Feature, Story).
					</p>
				</div>
				{canWrite ? (
					<Button
						size="sm"
						variant="outline"
						className="gap-1.5 border-border/60 shrink-0"
						onClick={() => setCreateOpen(true)}
					>
						<Plus className="size-3.5" />
						New type
					</Button>
				) : null}
			</div>

			{isLoading ? (
				<div className="rounded-xl border overflow-hidden mt-4">
					{["t1", "t2", "t3"].map((k) => (
						<div
							key={k}
							className="flex items-center gap-4 border-b px-5 py-4 last:border-0"
						>
							<Skeleton className="size-3 rounded-full" />
							<Skeleton className="h-4 w-32" />
							<Skeleton className="h-4 w-48 ml-2" />
							<div className="flex gap-1.5 ml-auto">
								<Skeleton className="size-7 rounded-md" />
								<Skeleton className="size-7 rounded-md" />
							</div>
						</div>
					))}
				</div>
			) : !types?.length ? (
				<div className="flex flex-col items-center gap-4 rounded-xl border border-dashed bg-muted/20 py-16 text-center mt-4">
					<div className="flex size-12 items-center justify-center rounded-full bg-muted text-muted-foreground/60">
						<Tag className="size-6" />
					</div>
					<div>
						<p className="text-sm font-medium">No task types defined</p>
						<p className="mt-1 text-xs text-muted-foreground">
							Create types to categorise tasks by kind — e.g. Bug, Feature,
							Story.
						</p>
					</div>
					{canWrite ? (
						<Button
							size="sm"
							variant="outline"
							onClick={() => setCreateOpen(true)}
						>
							<Plus className="size-4" />
							Create type
						</Button>
					) : null}
				</div>
			) : (
				<div className="overflow-x-auto rounded-xl border mt-4">
					<Table>
						<TableHeader>
							<TableRow className="bg-muted/40 hover:bg-muted/40">
								<TableHead className="w-10 px-5 text-xs font-semibold uppercase tracking-wide">
									Icon
								</TableHead>
								<TableHead className="px-5 text-xs font-semibold uppercase tracking-wide">
									Name
								</TableHead>
								<TableHead className="px-5 text-xs font-semibold uppercase tracking-wide">
									Description
								</TableHead>
								<TableHead className="w-20 px-5 text-xs font-semibold uppercase tracking-wide" />
							</TableRow>
						</TableHeader>
						<TableBody>
							{types.map((type) => (
								<TableRow key={type.id} className="group">
									<TableCell className="px-5">
										{(() => {
											const IconComp = getTaskTypeIconComponent(type.icon);
											if (IconComp) {
												return (
													<IconComp
														className="size-4"
														style={{ color: type.color ?? "#6366f1" }}
													/>
												);
											}
											return (
												<span
													className="inline-block size-3 rounded-full"
													style={{ backgroundColor: type.color ?? "#6366f1" }}
												/>
											);
										})()}
									</TableCell>
									<TableCell className="px-5">
										<div className="flex items-center gap-2">
											{type.icon && !getTaskTypeIconComponent(type.icon) ? (
												<span
													className="inline-block size-2.5 rounded-full shrink-0"
													style={{ backgroundColor: type.color ?? "#6366f1" }}
												/>
											) : null}
											<span className="text-sm font-medium">{type.name}</span>
										</div>
									</TableCell>
									<TableCell className="px-5 text-sm text-muted-foreground max-w-xs truncate">
										{type.description ?? (
											<span className="italic opacity-50">—</span>
										)}
									</TableCell>
									<TableCell className="px-5">
										{canWrite ? (
											<div className="flex items-center justify-end gap-0.5 opacity-100 transition-opacity sm:opacity-0 sm:group-hover:opacity-100">
												<Button
													variant="ghost"
													size="icon-sm"
													onClick={() => setEditType(type)}
													title="Edit type"
												>
													<Edit2 className="size-3.5" />
												</Button>
												<Button
													variant="ghost"
													size="icon-sm"
													className="text-destructive hover:text-destructive hover:bg-destructive/10"
													onClick={() => setDeleteType(type)}
													title="Delete type"
												>
													<Trash2 className="size-3.5" />
												</Button>
											</div>
										) : null}
									</TableCell>
								</TableRow>
							))}
						</TableBody>
					</Table>
				</div>
			)}

			<TaskTypeFormDialog
				projectId={projectId}
				open={createOpen}
				onOpenChange={setCreateOpen}
			/>
			{editType ? (
				<TaskTypeFormDialog
					projectId={projectId}
					taskType={editType}
					open={!!editType}
					onOpenChange={(o) => {
						if (!o) setEditType(null);
					}}
				/>
			) : null}
			{deleteType ? (
				<DeleteTaskTypeDialog
					projectId={projectId}
					taskType={deleteType}
					open={!!deleteType}
					onOpenChange={(o) => {
						if (!o) setDeleteType(null);
					}}
				/>
			) : null}
		</div>
	);
}

// ── Danger Zone ───────────────────────────────────────────────────────────────

function DangerZone({ projectId }: { projectId: string }) {
	const navigate = useNavigate();
	const queryClient = useQueryClient();
	const { data: project } = useQuery(projectQueryOptions(projectId));
	const [open, setOpen] = useState(false);
	const [confirmName, setConfirmName] = useState("");

	const deleteMutation = useMutation({
		mutationFn: () => deleteProject(projectId),
		onSuccess: async () => {
			queryClient.removeQueries({ queryKey: ["projects", projectId] });
			await navigate({ to: "/home" });
			await queryClient.invalidateQueries({ queryKey: ["projects"] });
		},
	});

	return (
		<div className="rounded-xl border border-destructive/30 bg-destructive/3 p-6">
			<h3 className="font-[Syne] text-base font-semibold text-destructive mb-4">
				Danger Zone
			</h3>
			<div className="flex items-center justify-between">
				<div>
					<p className="text-sm font-medium">Delete this project</p>
					<p className="text-xs text-muted-foreground mt-0.5">
						Permanently delete the project and all its data. This action cannot
						be undone.
					</p>
				</div>
				<Button
					variant="destructive"
					size="sm"
					className="shrink-0 ml-4 gap-1.5"
					onClick={() => setOpen(true)}
				>
					<Trash2 className="size-3.5" />
					Delete project
				</Button>
			</div>

			<Dialog
				open={open}
				onOpenChange={(o) => {
					setOpen(o);
					setConfirmName("");
				}}
			>
				<DialogContent className="sm:max-w-sm">
					<DialogHeader>
						<div className="flex size-10 items-center justify-center rounded-full bg-destructive/10 mb-2">
							<AlertTriangle className="size-5 text-destructive" />
						</div>
						<DialogTitle>Delete project</DialogTitle>
						<DialogDescription>
							This will permanently delete{" "}
							<span className="font-semibold text-foreground">
								{project?.name}
							</span>{" "}
							and all its data, including members, roles, and integrations. This
							action cannot be undone.
						</DialogDescription>
					</DialogHeader>
					<div className="space-y-1.5">
						<Label
							htmlFor="confirm-name"
							className="text-xs text-muted-foreground"
						>
							Type{" "}
							<span className="font-semibold text-foreground">
								{project?.name}
							</span>{" "}
							to confirm
						</Label>
						<Input
							id="confirm-name"
							value={confirmName}
							onChange={(e) => setConfirmName(e.target.value)}
							placeholder={project?.name}
							autoComplete="off"
						/>
					</div>
					{deleteMutation.isError ? (
						<p className="text-xs text-destructive bg-destructive/10 rounded-lg px-3 py-2">
							Failed to delete project. Please try again.
						</p>
					) : null}
					<DialogFooter>
						<DialogClose
							render={
								<Button
									variant="outline"
									size="sm"
									disabled={deleteMutation.isPending}
								/>
							}
						>
							Cancel
						</DialogClose>
						<Button
							variant="destructive"
							size="sm"
							disabled={
								confirmName !== project?.name || deleteMutation.isPending
							}
							onClick={() => deleteMutation.mutate()}
						>
							{deleteMutation.isPending ? (
								<Loader2 className="size-3.5 animate-spin" />
							) : (
								<Trash2 className="size-3.5" />
							)}
							Delete permanently
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</div>
	);
}

// ── Custom Fields Section ─────────────────────────────────────────────────────

type FieldType = "Text" | "Number" | "Date" | "Checkbox" | "Select";

interface CustomFieldDef {
	id: string;
	display_name: string;
	field_key: string;
	field_type: FieldType;
	required: boolean;
	options: string[];
	created_at: string;
}

const FIELD_TYPE_OPTIONS: FieldType[] = [
	"Text",
	"Number",
	"Date",
	"Checkbox",
	"Select",
];

function slugify(s: string): string {
	return s
		.toLowerCase()
		.replace(/\s+/g, "_")
		.replace(/[^a-z0-9_]/g, "")
		.replace(/_+/g, "_")
		.slice(0, 64);
}

function CreateCustomFieldDialog({
	open,
	onOpenChange,
	onCreate,
}: {
	open: boolean;
	onOpenChange: (v: boolean) => void;
	onCreate: (field: CustomFieldDef) => void;
}) {
	const [displayName, setDisplayName] = useState("");
	const [fieldKey, setFieldKey] = useState("");
	const [keyManuallyEdited, setKeyManuallyEdited] = useState(false);
	const [fieldType, setFieldType] = useState<FieldType>("Text");
	const [required, setRequired] = useState(false);
	const [options, setOptions] = useState<string[]>([]);
	const [newOption, setNewOption] = useState("");

	const reset = () => {
		setDisplayName("");
		setFieldKey("");
		setKeyManuallyEdited(false);
		setFieldType("Text");
		setRequired(false);
		setOptions([]);
		setNewOption("");
	};

	const handleDisplayName = (v: string) => {
		setDisplayName(v);
		if (!keyManuallyEdited) setFieldKey(slugify(v));
	};

	const handleCreate = () => {
		if (!displayName.trim()) return;
		onCreate({
			id: crypto.randomUUID(),
			display_name: displayName.trim(),
			field_key: fieldKey || slugify(displayName),
			field_type: fieldType,
			required,
			options,
			created_at: new Date().toISOString(),
		});
		reset();
		onOpenChange(false);
	};

	if (!open) return null;

	return (
		<div
			className="fixed inset-0 z-50 flex items-center justify-center"
			onClick={() => onOpenChange(false)}
		>
			<div className="fixed inset-0 bg-black/20 backdrop-blur-[2px]" />
			<div
				className="relative z-10 w-full max-w-md rounded-2xl border border-border/60 bg-popover p-6 shadow-2xl"
				onClick={(e) => e.stopPropagation()}
			>
				<h2 className="font-[Syne] text-base font-bold mb-4">
					Create custom field
				</h2>

				<div className="space-y-4">
					{/* Display name */}
					<div className="space-y-1.5">
						<Label htmlFor="cf-display-name">
							Display name <span className="text-destructive">*</span>
						</Label>
						<Input
							id="cf-display-name"
							value={displayName}
							onChange={(e) => handleDisplayName(e.target.value)}
							placeholder="e.g. Release Tag"
							autoFocus
						/>
					</div>

					{/* Field key */}
					<div className="space-y-1.5">
						<Label htmlFor="cf-field-key">
							Field key <span className="text-destructive">*</span>
						</Label>
						<Input
							id="cf-field-key"
							value={fieldKey}
							onChange={(e) => {
								setKeyManuallyEdited(true);
								setFieldKey(slugify(e.target.value));
							}}
							placeholder="release_tag"
							className="font-mono text-sm"
						/>
						<p className="text-[10px] text-muted-foreground/60">
							Used as the identifier in the API and data exports.
						</p>
					</div>

					{/* Field type */}
					<div className="space-y-1.5">
						<Label>Field type</Label>
						<div className="flex flex-wrap gap-1.5">
							{FIELD_TYPE_OPTIONS.map((ft) => (
								<button
									key={ft}
									type="button"
									onClick={() => setFieldType(ft)}
									className={cn(
										"rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors",
										fieldType === ft
											? "border-primary bg-primary/10 text-primary"
											: "border-border/60 text-muted-foreground hover:border-border hover:bg-muted/50",
									)}
								>
									{ft}
								</button>
							))}
						</div>
					</div>

					{/* Options editor — only for Select type */}
					{fieldType === "Select" && (
						<div className="space-y-1.5">
							<Label>Options</Label>
							<div className="space-y-1">
								{options.map((opt, i) => (
									<div
										key={opt + i.toString()}
										className="flex items-center gap-2"
									>
										<Input
											value={opt}
											onChange={(e) => {
												const updated = [...options];
												updated[i] = e.target.value;
												setOptions(updated);
											}}
											className="text-xs h-8"
										/>
										<button
											type="button"
											onClick={() =>
												setOptions(options.filter((_, j) => j !== i))
											}
											className="shrink-0 text-muted-foreground hover:text-destructive transition-colors"
										>
											<X className="size-3.5" />
										</button>
									</div>
								))}
								<div className="flex gap-2">
									<Input
										value={newOption}
										onChange={(e) => setNewOption(e.target.value)}
										onKeyDown={(e) => {
											if (e.key === "Enter" && newOption.trim()) {
												setOptions([...options, newOption.trim()]);
												setNewOption("");
											}
										}}
										placeholder="Add option…"
										className="text-xs h-8"
									/>
									<button
										type="button"
										disabled={!newOption.trim()}
										onClick={() => {
											setOptions([...options, newOption.trim()]);
											setNewOption("");
										}}
										className="flex items-center gap-1 rounded-md bg-muted px-2.5 text-xs font-medium text-muted-foreground hover:bg-muted/80 disabled:opacity-40 transition-colors"
									>
										<Plus className="size-3" />
										Add
									</button>
								</div>
							</div>
						</div>
					)}

					{/* Required toggle */}
					<div className="flex items-center justify-between rounded-xl border border-border/50 bg-muted/20 px-4 py-3">
						<div>
							<p className="text-sm font-medium">Required</p>
							<p className="text-[11px] text-muted-foreground/70">
								Users must fill this field when creating or editing a task.
							</p>
						</div>
						<button
							type="button"
							role="switch"
							aria-checked={required}
							onClick={() => setRequired(!required)}
							className={cn(
								"relative inline-flex h-5 w-9 items-center rounded-full border-2 transition-colors",
								required
									? "border-primary bg-primary"
									: "border-border bg-muted",
							)}
						>
							<span
								className={cn(
									"inline-block size-3.5 rounded-full bg-white shadow transition-transform",
									required ? "translate-x-4" : "translate-x-0.5",
								)}
							/>
						</button>
					</div>
				</div>

				<div className="mt-5 flex justify-end gap-2">
					<Button
						variant="outline"
						size="sm"
						onClick={() => {
							reset();
							onOpenChange(false);
						}}
					>
						Cancel
					</Button>
					<Button
						size="sm"
						disabled={!displayName.trim()}
						onClick={handleCreate}
					>
						Create field
					</Button>
				</div>
			</div>
		</div>
	);
}

function EditCustomFieldDialog({
	field,
	open,
	onOpenChange,
	onSave,
}: {
	field: CustomFieldDef | null;
	open: boolean;
	onOpenChange: (v: boolean) => void;
	onSave: (updated: CustomFieldDef) => void;
}) {
	const [displayName, setDisplayName] = useState(field?.display_name ?? "");
	const [options, setOptions] = useState<string[]>(field?.options ?? []);
	const [newOption, setNewOption] = useState("");

	useEffect(() => {
		setDisplayName(field?.display_name ?? "");
		setOptions(field?.options ?? []);
	}, [field]);

	if (!open || !field) return null;

	const handleSave = () => {
		if (!displayName.trim()) return;
		onSave({ ...field, display_name: displayName.trim(), options });
		onOpenChange(false);
	};

	return (
		<div
			className="fixed inset-0 z-50 flex items-center justify-center"
			onClick={() => onOpenChange(false)}
		>
			<div className="fixed inset-0 bg-black/20 backdrop-blur-[2px]" />
			<div
				className="relative z-10 w-full max-w-md rounded-2xl border border-border/60 bg-popover p-6 shadow-2xl"
				onClick={(e) => e.stopPropagation()}
			>
				<h2 className="font-[Syne] text-base font-bold mb-4">
					Edit custom field
				</h2>
				<div className="space-y-4">
					<div className="space-y-1.5">
						<Label htmlFor="cf-edit-name">Display name</Label>
						<Input
							id="cf-edit-name"
							value={displayName}
							onChange={(e) => setDisplayName(e.target.value)}
							autoFocus
						/>
					</div>
					<div className="space-y-1.5">
						<Label>Field key</Label>
						<Input
							value={field.field_key}
							disabled
							className="font-mono text-sm opacity-60"
						/>
						<p className="text-[10px] text-muted-foreground/60">
							Field key cannot be changed after creation.
						</p>
					</div>
					{field.field_type === "Select" && (
						<div className="space-y-1.5">
							<Label>Options</Label>
							<div className="space-y-1">
								{options.map((opt, i) => (
									<div
										key={opt + i.toString()}
										className="flex items-center gap-2"
									>
										<Input
											value={opt}
											onChange={(e) => {
												const updated = [...options];
												updated[i] = e.target.value;
												setOptions(updated);
											}}
											className="text-xs h-8"
										/>
										<button
											type="button"
											onClick={() =>
												setOptions(options.filter((_, j) => j !== i))
											}
											className="shrink-0 text-muted-foreground hover:text-destructive"
										>
											<X className="size-3.5" />
										</button>
									</div>
								))}
								<div className="flex gap-2">
									<Input
										value={newOption}
										onChange={(e) => setNewOption(e.target.value)}
										onKeyDown={(e) => {
											if (e.key === "Enter" && newOption.trim()) {
												setOptions([...options, newOption.trim()]);
												setNewOption("");
											}
										}}
										placeholder="Add option…"
										className="text-xs h-8"
									/>
									<button
										type="button"
										disabled={!newOption.trim()}
										onClick={() => {
											setOptions([...options, newOption.trim()]);
											setNewOption("");
										}}
										className="flex items-center gap-1 rounded-md bg-muted px-2.5 text-xs font-medium text-muted-foreground hover:bg-muted/80 disabled:opacity-40"
									>
										<Plus className="size-3" />
										Add
									</button>
								</div>
							</div>
						</div>
					)}
				</div>
				<div className="mt-5 flex justify-end gap-2">
					<Button
						variant="outline"
						size="sm"
						onClick={() => onOpenChange(false)}
					>
						Cancel
					</Button>
					<Button size="sm" disabled={!displayName.trim()} onClick={handleSave}>
						Save changes
					</Button>
				</div>
			</div>
		</div>
	);
}

function CustomFieldsSettings({
	projectId,
	canWrite,
}: {
	projectId: string;
	canWrite: boolean;
}) {
	// In the UI-first phase, fields are stored in local component state.
	// Once the API is ready, replace these with useQuery/useMutation hooks.
	const [fields, setFields] = useState<CustomFieldDef[]>([]);
	const [createOpen, setCreateOpen] = useState(false);
	const [editField, setEditField] = useState<CustomFieldDef | null>(null);
	const [deleteConfirm, setDeleteConfirm] = useState<CustomFieldDef | null>(
		null,
	);

	const handleCreate = (field: CustomFieldDef) => {
		setFields((f) => [...f, field]);
	};

	const handleSave = (updated: CustomFieldDef) => {
		setFields((f) => f.map((cf) => (cf.id === updated.id ? updated : cf)));
	};

	const handleDelete = (field: CustomFieldDef) => {
		setFields((f) => f.filter((cf) => cf.id !== field.id));
		setDeleteConfirm(null);
	};

	return (
		<div className="rounded-xl border border-border/60 bg-card p-6">
			<div className="flex items-start justify-between mb-1">
				<div>
					<h3 className="font-[Syne] text-base font-semibold">Custom Fields</h3>
					<p className="text-xs text-muted-foreground mt-0.5 max-w-xs">
						Define project-level custom task fields that appear in the task
						detail alongside built-in fields.
					</p>
				</div>
				{canWrite && (
					<Button
						size="sm"
						variant="outline"
						className="gap-1.5 border-border/60 shrink-0"
						onClick={() => setCreateOpen(true)}
					>
						<Plus className="size-3.5" />
						New field
					</Button>
				)}
			</div>

			{fields.length === 0 ? (
				<div className="mt-4 flex flex-col items-center gap-4 rounded-xl border border-dashed border-border/60 bg-muted/10 py-14 text-center">
					<div className="flex size-11 items-center justify-center rounded-xl bg-muted">
						<Plus className="size-5 text-muted-foreground/60" />
					</div>
					<div>
						<p className="text-sm font-medium">No custom fields yet</p>
						<p className="mt-1 text-xs text-muted-foreground max-w-xs mx-auto">
							Custom fields let you capture data specific to your workflow —
							sprints, severity levels, release tags, and more.
						</p>
					</div>
					{canWrite && (
						<Button
							size="sm"
							variant="outline"
							onClick={() => setCreateOpen(true)}
						>
							<Plus className="size-4 mr-1" />
							Create first field
						</Button>
					)}
				</div>
			) : (
				<div className="mt-4 overflow-x-auto rounded-xl border">
					<Table>
						<TableHeader>
							<TableRow className="bg-muted/40 hover:bg-muted/40">
								<TableHead className="px-5 text-xs font-semibold uppercase tracking-wide">
									Display name
								</TableHead>
								<TableHead className="px-5 text-xs font-semibold uppercase tracking-wide">
									Field key
								</TableHead>
								<TableHead className="px-5 text-xs font-semibold uppercase tracking-wide">
									Type
								</TableHead>
								<TableHead className="px-5 text-xs font-semibold uppercase tracking-wide">
									Required
								</TableHead>
								{canWrite && <TableHead className="w-20 px-5" />}
							</TableRow>
						</TableHeader>
						<TableBody>
							{fields.map((field) => (
								<TableRow key={field.id} className="group">
									<TableCell className="px-5 font-medium">
										{field.display_name}
									</TableCell>
									<TableCell className="px-5 font-mono text-xs text-muted-foreground">
										{field.field_key}
									</TableCell>
									<TableCell className="px-5">
										<span className="inline-flex items-center rounded-md border border-border/40 bg-muted/40 px-2 py-0.5 text-[10px] font-semibold text-muted-foreground">
											{field.field_type}
										</span>
									</TableCell>
									<TableCell className="px-5">
										{field.required ? (
											<span className="inline-flex items-center gap-1 text-emerald-600 text-xs font-medium">
												<Check className="size-3" />
												Yes
											</span>
										) : (
											<span className="text-xs text-muted-foreground/50">
												No
											</span>
										)}
									</TableCell>
									{canWrite && (
										<TableCell className="px-5">
											<div className="flex items-center justify-end gap-0.5 opacity-100 transition-opacity sm:opacity-0 sm:group-hover:opacity-100">
												<Button
													variant="ghost"
													size="icon-sm"
													onClick={() => setEditField(field)}
													title="Edit field"
													aria-label="Edit field"
												>
													<Edit2 className="size-3.5" />
												</Button>
												<Button
													variant="ghost"
													size="icon-sm"
													className="text-destructive hover:text-destructive hover:bg-destructive/10"
													onClick={() => setDeleteConfirm(field)}
													title="Delete field"
													aria-label="Delete field"
												>
													<Trash2 className="size-3.5" />
												</Button>
											</div>
										</TableCell>
									)}
								</TableRow>
							))}
						</TableBody>
					</Table>
				</div>
			)}

			<CreateCustomFieldDialog
				open={createOpen}
				onOpenChange={setCreateOpen}
				onCreate={handleCreate}
			/>

			<EditCustomFieldDialog
				field={editField}
				open={!!editField}
				onOpenChange={(v) => {
					if (!v) setEditField(null);
				}}
				onSave={handleSave}
			/>

			{/* Delete confirmation */}
			{deleteConfirm && (
				<div
					className="fixed inset-0 z-50 flex items-center justify-center"
					onClick={() => setDeleteConfirm(null)}
				>
					<div className="fixed inset-0 bg-black/20 backdrop-blur-[2px]" />
					<div
						className="relative z-10 w-full max-w-sm rounded-2xl border border-border/60 bg-popover p-6 shadow-2xl"
						onClick={(e) => e.stopPropagation()}
					>
						<h2 className="font-[Syne] text-base font-bold mb-2">
							Delete custom field?
						</h2>
						<p className="text-sm text-muted-foreground mb-5">
							Deleting{" "}
							<span className="font-semibold">
								{deleteConfirm.display_name}
							</span>{" "}
							will remove it from all task detail views. Existing values will be
							lost.
						</p>
						<div className="flex justify-end gap-2">
							<Button
								variant="outline"
								size="sm"
								onClick={() => setDeleteConfirm(null)}
							>
								Cancel
							</Button>
							<Button
								size="sm"
								variant="destructive"
								onClick={() => handleDelete(deleteConfirm)}
							>
								Delete field
							</Button>
						</div>
					</div>
				</div>
			)}
		</div>
	);
}

// ── Settings Page ─────────────────────────────────────────────────────────────

const NAV_ITEMS = [
	{ id: "general", label: "General", icon: Settings },
	{ id: "roles", label: "Roles", icon: Shield },
	{ id: "task-statuses", label: "Task Statuses", icon: LayoutList },
	{ id: "task-types", label: "Task Types", icon: Tag },
	{ id: "custom-fields", label: "Custom Fields", icon: Plus },
	{ id: "danger", label: "Danger Zone", icon: AlertTriangle },
] as const;

function SettingsPage() {
	const { projectId } = Route.useParams();
	const { data: project } = useQuery(projectQueryOptions(projectId));
	const { hasPermission } = usePermissions();
	const { data: currentUser } = useQuery(currentUserQueryOptions);
	const { data: members = [] } = useQuery(
		projectMembersQueryOptions(projectId),
	);
	const { data: roles = [] } = useQuery(projectRolesQueryOptions(projectId));

	const myMembership = (members as ProjectMember[]).find(
		(m) => m.user_id === currentUser?.id,
	);
	const myRole = (roles as ProjectRole[]).find(
		(r) => r.id === myMembership?.project_role_id,
	);
	const hasProjectDelete = Boolean(
		(myRole?.permissions as Record<string, boolean> | undefined)?.[
			"projects.delete"
		],
	);
	const hasProjectWrite = Boolean(
		(myRole?.permissions as Record<string, boolean> | undefined)?.[
			"projects.write"
		],
	);
	const hasProjectRolesWrite = Boolean(
		(myRole?.permissions as Record<string, boolean> | undefined)?.[
			"project.roles.write"
		],
	);
	const canDelete = hasPermission("projects.delete") || hasProjectDelete;
	const canEditProject = hasPermission("projects.write") || hasProjectWrite;
	const canManageRoles =
		hasPermission("project.roles.write") || hasProjectRolesWrite;
	const hasTasksWrite = Boolean(
		(myRole?.permissions as Record<string, boolean> | undefined)?.[
			"tasks.write"
		],
	);
	const canManageTasks = hasPermission("tasks.write") || hasTasksWrite;

	const visibleNavItems = canDelete
		? NAV_ITEMS
		: NAV_ITEMS.filter((i) => i.id !== "danger");

	const [activeSection, setActiveSection] = useState<
		| "general"
		| "roles"
		| "task-statuses"
		| "task-types"
		| "custom-fields"
		| "danger"
	>("general");

	return (
		<div className="flex flex-col min-h-0 flex-1">
			{/* Header */}
			<div className="relative overflow-hidden border-b border-border/50 shrink-0">
				<div
					className="pointer-events-none absolute inset-0 opacity-50"
					style={{
						backgroundImage:
							"radial-gradient(circle, color-mix(in oklch, var(--color-primary) 12%, transparent) 1px, transparent 1px)",
						backgroundSize: "20px 20px",
						maskImage:
							"radial-gradient(ellipse 70% 100% at 0% 0%, black 20%, transparent 70%)",
					}}
				/>
				<div className="relative px-6 py-7 max-w-6xl mx-auto w-full">
					<div className="flex items-center gap-2.5 mb-1">
						<Settings className="size-4 text-muted-foreground" />
						<h1 className="font-[Syne] text-2xl font-bold tracking-tight">
							Settings
						</h1>
					</div>
					<p className="text-sm text-muted-foreground">
						{project?.name} · Configure project settings, roles, and permissions
					</p>
				</div>
			</div>

			{/* Body */}
			<div className="flex-1 overflow-y-auto">
				<div className="max-w-6xl mx-auto w-full px-6 py-8 flex gap-10 items-start">
					{/* Sidebar nav — hidden on small screens */}
					<aside className="hidden lg:flex flex-col gap-1 w-48 shrink-0 sticky top-8">
						<p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/60 px-3 mb-1">
							Settings
						</p>
						{visibleNavItems.map(({ id, label, icon: Icon }) => (
							<button
								key={id}
								type="button"
								onClick={() => setActiveSection(id as typeof activeSection)}
								className={`flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors text-left ${
									activeSection === id
										? "bg-accent text-foreground"
										: "text-muted-foreground hover:bg-accent/60 hover:text-foreground"
								} ${id === "danger" ? "mt-2 text-destructive/70 hover:text-destructive hover:bg-destructive/8" : ""}`}
							>
								<Icon className="size-3.5 shrink-0" />
								{label}
							</button>
						))}{" "}
					</aside>

					{/* Content */}
					<div className="flex-1 min-w-0">
						{/* Mobile section picker */}
						<div className="flex gap-1 mb-6 lg:hidden flex-wrap">
							{visibleNavItems.map(({ id, label, icon: Icon }) => (
								<button
									key={id}
									type="button"
									onClick={() => setActiveSection(id as typeof activeSection)}
									className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
										activeSection === id
											? "bg-accent text-foreground"
											: "text-muted-foreground hover:bg-accent/60 hover:text-foreground"
									}`}
								>
									<Icon className="size-3 shrink-0" />
									{label}
								</button>
							))}
						</div>

						{activeSection === "general" && (
							<GeneralSettings projectId={projectId} canEdit={canEditProject} />
						)}
						{activeSection === "roles" && (
							<RolesSettings
								projectId={projectId}
								canManageRoles={canManageRoles}
							/>
						)}
						{activeSection === "task-statuses" && (
							<TaskStatusesSettings
								projectId={projectId}
								canWrite={canManageTasks}
							/>
						)}
						{activeSection === "task-types" && (
							<TaskTypesSettings
								projectId={projectId}
								canWrite={canManageTasks}
							/>
						)}
						{activeSection === "custom-fields" && (
							<CustomFieldsSettings
								projectId={projectId}
								canWrite={canEditProject}
							/>
						)}
						{activeSection === "danger" && canDelete && (
							<DangerZone projectId={projectId} />
						)}
					</div>
				</div>
			</div>
		</div>
	);
}
