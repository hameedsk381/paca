import { useQuery } from "@tanstack/react-query";
import { Link, useParams, useRouterState } from "@tanstack/react-router";
import {
	Bot,
	ChevronRight,
	FileText,
	Folder,
	Home,
	Layers,
	Settings,
	ShieldAlert,
	Users,
} from "lucide-react";
import { useEffect, useMemo } from "react";

import { agentQueryOptions } from "@/lib/agent-api";
import { docQueryOptions } from "@/lib/doc-api";
import { sprintQueryOptions, taskQueryOptions } from "@/lib/interaction-api";
import { projectQueryOptions } from "@/lib/project-api";
import { cn } from "@/lib/utils";

export function Breadcrumbs() {
	const params = useParams({ strict: false }) as {
		projectId?: string;
		sprintId?: string;
		docId?: string;
		agentId?: string;
		taskId?: string;
		conversationId?: string;
	};

	const matches = useRouterState({ select: (s) => s.matches });

	// Fetch detail metadata only if active IDs are present
	const { data: project } = useQuery({
		...projectQueryOptions(params.projectId ?? ""),
		enabled: !!params.projectId,
	});

	const { data: sprint } = useQuery({
		...sprintQueryOptions(params.projectId ?? "", params.sprintId ?? ""),
		enabled: !!params.projectId && !!params.sprintId,
	});

	const { data: doc } = useQuery({
		...docQueryOptions(params.projectId ?? "", params.docId ?? ""),
		enabled: !!params.projectId && !!params.docId,
	});

	const { data: agent } = useQuery({
		...agentQueryOptions(params.projectId ?? "", params.agentId ?? ""),
		enabled: !!params.projectId && !!params.agentId,
	});

	const { data: task } = useQuery({
		...taskQueryOptions(params.projectId ?? "", params.taskId ?? ""),
		enabled: !!params.projectId && !!params.taskId,
	});

	const breadcrumbItems = useMemo(() => {
		const items: Array<{ label: string; to: string; icon?: React.ReactNode }> =
			[];

		for (const match of matches) {
			const routeId = match.id || match.routeId;
			if (!routeId) continue;

			// Skip structural routes
			if (routeId === "__root__" || routeId === "/_authenticated") continue;

			if (routeId === "/_authenticated/home/") {
				items.push({
					label: "Home",
					to: "/home",
					icon: <Home className="size-3.5" />,
				});
			} else if (routeId === "/_authenticated/profile/") {
				items.push({
					label: "Profile",
					to: "/profile",
					icon: <Settings className="size-3.5" />,
				});
			} else if (routeId === "/_authenticated/profile/api-keys") {
				items.push({
					label: "API Keys",
					to: "/profile/api-keys",
				});
			} else if (routeId === "/_authenticated/projects/$projectId") {
				items.push({
					label: project?.name ?? "Project",
					to: `/projects/${params.projectId}/interactions/timeline`,
					icon: <Folder className="size-3.5" />,
				});
			} else if (routeId.includes("/interactions/backlog")) {
				items.push({
					label: "Backlog",
					to: `/projects/${params.projectId}/interactions/backlog`,
				});
			} else if (routeId.includes("/interactions/timeline")) {
				items.push({
					label: "Timeline",
					to: `/projects/${params.projectId}/interactions/timeline`,
				});
			} else if (routeId.includes("/interactions/sprints/$sprintId")) {
				items.push({
					label: sprint?.name ?? "Sprint Board",
					to: `/projects/${params.projectId}/interactions/sprints/${params.sprintId}`,
					icon: <Layers className="size-3.5" />,
				});
			} else if (
				routeId.includes("/docs/index") ||
				routeId === "/_authenticated/projects/$projectId/docs"
			) {
				items.push({
					label: "Documentation",
					to: `/projects/${params.projectId}/docs`,
					icon: <FileText className="size-3.5" />,
				});
			} else if (routeId.includes("/docs/$docId")) {
				items.push({
					label: doc?.title ?? "Document",
					to: `/projects/${params.projectId}/docs/${params.docId}`,
					icon: <FileText className="size-3.5" />,
				});
			} else if (
				routeId.includes("/agents/index") ||
				routeId === "/_authenticated/projects/$projectId/agents"
			) {
				items.push({
					label: "AI Agents",
					to: `/projects/${params.projectId}/agents`,
					icon: <Bot className="size-3.5" />,
				});
			} else if (routeId.includes("/agents/$agentId")) {
				items.push({
					label: agent?.name ?? "Agent",
					to: `/projects/${params.projectId}/agents/${params.agentId}`,
					icon: <Bot className="size-3.5" />,
				});
			} else if (routeId.includes("/conversations/$conversationId")) {
				items.push({
					label: "AI Session",
					to: `/projects/${params.projectId}/conversations/${params.conversationId}`,
				});
			} else if (routeId.includes("/tasks/$taskId")) {
				items.push({
					label: task
						? `${project?.task_id_prefix ?? ""}-${task.task_number}`
						: "Task",
					to: `/projects/${params.projectId}/tasks/${params.taskId}`,
				});
			} else if (routeId.includes("/team")) {
				items.push({
					label: "Team",
					to: `/projects/${params.projectId}/team`,
					icon: <Users className="size-3.5" />,
				});
			} else if (routeId.includes("/settings")) {
				items.push({
					label: "Settings",
					to: `/projects/${params.projectId}/settings`,
					icon: <Settings className="size-3.5" />,
				});
			} else if (routeId.includes("/admin/users")) {
				items.push({
					label: "Admin Users",
					to: "/admin/users",
					icon: <ShieldAlert className="size-3.5" />,
				});
			} else if (routeId.includes("/admin/global-roles")) {
				items.push({
					label: "Admin Global Roles",
					to: "/admin/global-roles",
					icon: <ShieldAlert className="size-3.5" />,
				});
			} else if (routeId.includes("/admin/plugins")) {
				items.push({
					label: "Admin Plugins",
					to: "/admin/plugins",
					icon: <ShieldAlert className="size-3.5" />,
				});
			} else if (routeId.includes("change-password")) {
				items.push({
					label: "Change Password",
					to: "/change-password",
				});
			}
		}

		return items;
	}, [matches, project, sprint, doc, agent, task, params]);

	// Update browser tab title dynamically
	useEffect(() => {
		if (breadcrumbItems.length > 0) {
			const activeTitle = breadcrumbItems[breadcrumbItems.length - 1].label;
			document.title = `${activeTitle} | Paca`;
		} else {
			document.title = "Paca";
		}
	}, [breadcrumbItems]);

	if (breadcrumbItems.length === 0) return null;

	return (
		<nav className="flex items-center gap-1.5 text-xs text-muted-foreground/80 overflow-x-auto whitespace-nowrap scrollbar-none py-1">
			{breadcrumbItems.map((item, index) => {
				const isLast = index === breadcrumbItems.length - 1;
				return (
					<div key={item.to} className="flex items-center gap-1.5">
						{index > 0 && (
							<ChevronRight className="size-3 text-muted-foreground/40 shrink-0" />
						)}
						<Link
							to={item.to}
							disabled={isLast}
							className={cn(
								"flex items-center gap-1.5 transition-colors duration-150 py-0.5 px-1 rounded-md",
								isLast
									? "text-foreground font-semibold cursor-default select-text"
									: "hover:text-foreground hover:bg-muted/40 cursor-pointer",
							)}
						>
							{item.icon}
							<span>{item.label}</span>
						</Link>
					</div>
				);
			})}
		</nav>
	);
}
