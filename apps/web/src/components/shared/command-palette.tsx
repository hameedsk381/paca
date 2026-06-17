import { useQuery } from "@tanstack/react-query";
import { useNavigate, useParams } from "@tanstack/react-router";
import { Command } from "cmdk";
import {
	BookOpen,
	FileText,
	FolderKanban,
	Home,
	Key,
	Moon,
	Search,
	Settings,
	Shield,
	Sun,
	Users,
} from "lucide-react";
import { useEffect, useState } from "react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { useThemeMode } from "@/hooks/use-theme-mode";
import { docListQueryOptions } from "@/lib/doc-api";
import { allTasksQueryOptions } from "@/lib/interaction-api";
import { projectQueryOptions } from "@/lib/project-api";

export function CommandPalette() {
	const navigate = useNavigate();
	const { mode, set: setThemeMode } = useThemeMode();
	const [open, setOpen] = useState(false);

	// Safe routing param resolution
	const params = useParams({ strict: false }) as { projectId?: string };
	const projectId = params.projectId;

	// Load project info
	const { data: project } = useQuery({
		...projectQueryOptions(projectId || ""),
		enabled: !!projectId,
	});

	// Fetch flat lists of tasks & documents if inside a project
	const { data: tasksData } = useQuery({
		...allTasksQueryOptions(projectId || "", { pageSize: 150 }),
		enabled: !!projectId && open,
	});
	const tasks = tasksData?.items ?? [];

	const { data: docs = [] } = useQuery({
		...docListQueryOptions(projectId || ""),
		enabled: !!projectId && open,
	});

	// Toggle command palette on Meta+K or Ctrl+K
	useEffect(() => {
		const down = (e: KeyboardEvent) => {
			if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
				e.preventDefault();
				setOpen((open) => !open);
			}
		};

		document.addEventListener("keydown", down);
		return () => document.removeEventListener("keydown", down);
	}, []);

	// Listen for a global custom event to trigger search from header
	useEffect(() => {
		const handleOpenSearch = () => setOpen(true);
		window.addEventListener("open-global-search", handleOpenSearch);
		return () => window.removeEventListener("open-global-search", handleOpenSearch);
	}, []);

	const handleNavigate = (to: string, routeParams?: Record<string, string>) => {
		setOpen(false);
		void navigate({ to, params: routeParams });
	};

	const toggleTheme = () => {
		setOpen(false);
		setThemeMode(mode === "dark" ? "light" : "dark");
	};

	const taskIdPrefix = project?.task_id_prefix ?? "";

	return (
		<Dialog open={open} onOpenChange={setOpen}>
			<DialogContent className="sm:max-w-md p-0 overflow-hidden bg-popover ring-1 ring-border shadow-2xl rounded-xl">
				<Command className="flex flex-col w-full" label="Command Menu">
					<div className="flex items-center gap-2 border-b border-border/40 px-3.5 py-3.5">
						<Search className="size-4 shrink-0 text-muted-foreground/60" />
						<Command.Input
							placeholder="Type a command, task, or document to search..."
							className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground/50 outline-none border-none"
						/>
					</div>

					<Command.List className="max-h-[360px] overflow-y-auto p-2 space-y-1 scrollbar-thin scrollbar-thumb-muted">
						<Command.Empty className="py-6 text-center text-xs text-muted-foreground">
							No results found.
						</Command.Empty>

						{/* Project Context Tasks */}
						{projectId && tasks.length > 0 && (
							<Command.Group
								heading="Tasks"
								className="px-2 py-1.5 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider"
							>
								{tasks.slice(0, 10).map((task) => {
									const formattedId =
										taskIdPrefix && task.task_number > 0
											? `${taskIdPrefix}-${task.task_number}`
											: task.id.slice(0, 8);
									return (
										<Command.Item
											key={task.id}
											value={`task ${formattedId} ${task.title}`}
											onSelect={() =>
												handleNavigate(
													"/projects/$projectId/tasks/$taskId",
													{ projectId, taskId: task.id },
												)
											}
											className="flex items-center gap-3 px-3 py-2 rounded-lg cursor-pointer text-sm text-foreground/80 transition-all hover:bg-accent hover:text-accent-foreground data-[selected=true]:bg-accent data-[selected=true]:text-accent-foreground"
										>
											<FolderKanban className="size-4 text-muted-foreground/60" />
											<span className="font-mono text-xs font-semibold text-muted-foreground bg-muted border border-border/50 rounded px-1.5 py-0.5">
												{formattedId}
											</span>
											<span className="truncate flex-1">{task.title}</span>
										</Command.Item>
									);
								})}
							</Command.Group>
						)}

						{/* Project Context Documents */}
						{projectId && docs.length > 0 && (
							<Command.Group
								heading="Documents"
								className="px-2 py-1.5 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider"
							>
								{docs.slice(0, 5).map((doc) => (
									<Command.Item
										key={doc.id}
										value={`doc ${doc.title}`}
										onSelect={() =>
											handleNavigate(
												"/projects/$projectId/docs/$docId",
												{ projectId, docId: doc.id },
											)
										}
										className="flex items-center gap-3 px-3 py-2 rounded-lg cursor-pointer text-sm text-foreground/80 transition-all hover:bg-accent hover:text-accent-foreground data-[selected=true]:bg-accent data-[selected=true]:text-accent-foreground"
									>
										<FileText className="size-4 text-muted-foreground/60" />
										<span className="truncate flex-1">{doc.title}</span>
									</Command.Item>
								))}
							</Command.Group>
						)}

						{/* Actions Group */}
						<Command.Group
							heading="Actions"
							className="px-2 py-1.5 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider"
						>
							<Command.Item
								value="action toggle theme mode dark light"
								onSelect={toggleTheme}
								className="flex items-center gap-3 px-3 py-2 rounded-lg cursor-pointer text-sm text-foreground/80 transition-all hover:bg-accent hover:text-accent-foreground data-[selected=true]:bg-accent data-[selected=true]:text-accent-foreground"
							>
								{mode === "dark" ? (
									<Sun className="size-4 text-muted-foreground/60" />
								) : (
									<Moon className="size-4 text-muted-foreground/60" />
								)}
								<span className="flex-1">
									Switch to {mode === "dark" ? "light" : "dark"} mode
								</span>
							</Command.Item>
						</Command.Group>

						{/* Navigation Group */}
						<Command.Group
							heading="Navigation"
							className="px-2 py-1.5 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider"
						>
							<Command.Item
								value="nav home dashboard projects"
								onSelect={() => handleNavigate("/home")}
								className="flex items-center gap-3 px-3 py-2 rounded-lg cursor-pointer text-sm text-foreground/80 transition-all hover:bg-accent hover:text-accent-foreground data-[selected=true]:bg-accent data-[selected=true]:text-accent-foreground"
							>
								<Home className="size-4 text-muted-foreground/60" />
								<span className="flex-1">Go to Dashboard Home</span>
							</Command.Item>

							{projectId && (
								<>
									<Command.Item
										value="nav project backlog interactions"
										onSelect={() =>
											handleNavigate(
												"/projects/$projectId/interactions/backlog",
												{ projectId },
											)
										}
										className="flex items-center gap-3 px-3 py-2 rounded-lg cursor-pointer text-sm text-foreground/80 transition-all hover:bg-accent hover:text-accent-foreground data-[selected=true]:bg-accent data-[selected=true]:text-accent-foreground"
									>
										<BookOpen className="size-4 text-muted-foreground/60" />
										<span className="flex-1">Go to Project Backlog</span>
									</Command.Item>

									<Command.Item
										value="nav project team members roles"
										onSelect={() =>
											handleNavigate(
												"/projects/$projectId/team",
												{ projectId },
											)
										}
										className="flex items-center gap-3 px-3 py-2 rounded-lg cursor-pointer text-sm text-foreground/80 transition-all hover:bg-accent hover:text-accent-foreground data-[selected=true]:bg-accent data-[selected=true]:text-accent-foreground"
									>
										<Users className="size-4 text-muted-foreground/60" />
										<span className="flex-1">Go to Project Team</span>
									</Command.Item>

									<Command.Item
										value="nav project settings custom fields"
										onSelect={() =>
											handleNavigate(
												"/projects/$projectId/settings",
												{ projectId },
											)
										}
										className="flex items-center gap-3 px-3 py-2 rounded-lg cursor-pointer text-sm text-foreground/80 transition-all hover:bg-accent hover:text-accent-foreground data-[selected=true]:bg-accent data-[selected=true]:text-accent-foreground"
									>
										<Settings className="size-4 text-muted-foreground/60" />
										<span className="flex-1">Go to Project Settings</span>
									</Command.Item>
								</>
							)}

							<Command.Item
								value="nav profile personal settings data"
								onSelect={() => handleNavigate("/profile")}
								className="flex items-center gap-3 px-3 py-2 rounded-lg cursor-pointer text-sm text-foreground/80 transition-all hover:bg-accent hover:text-accent-foreground data-[selected=true]:bg-accent data-[selected=true]:text-accent-foreground"
							>
								<Shield className="size-4 text-muted-foreground/60" />
								<span className="flex-1">Go to My Profile</span>
							</Command.Item>

							<Command.Item
								value="nav api keys profile credentials token"
								onSelect={() => handleNavigate("/profile/api-keys")}
								className="flex items-center gap-3 px-3 py-2 rounded-lg cursor-pointer text-sm text-foreground/80 transition-all hover:bg-accent hover:text-accent-foreground data-[selected=true]:bg-accent data-[selected=true]:text-accent-foreground"
							>
								<Key className="size-4 text-muted-foreground/60" />
								<span className="flex-1">Go to API Keys</span>
							</Command.Item>
						</Command.Group>
					</Command.List>
				</Command>
			</DialogContent>
		</Dialog>
	);
}
