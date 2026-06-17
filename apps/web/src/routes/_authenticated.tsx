import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
	createFileRoute,
	Link,
	Outlet,
	redirect,
	useRouterState,
} from "@tanstack/react-router";
import {
	Bot,
	FileText,
	GanttChart,
	KanbanSquare,
	Search,
	Users,
} from "lucide-react";
import { useEffect, useState } from "react";

import { AppSidebar } from "@/components/app-shell/app-sidebar";
import { NotificationBell } from "@/components/app-shell/notification-bell";
import { Breadcrumbs } from "@/components/shared/breadcrumbs";
import { CommandPalette } from "@/components/shared/command-palette";
import { OnboardingTour } from "@/components/shared/onboarding-tour";
import { ShortcutsModal } from "@/components/shared/shortcuts-modal";
import {
	SidebarInset,
	SidebarProvider,
	SidebarTrigger,
	useSidebar,
} from "@/components/ui/sidebar";
import { useIsMobile } from "@/hooks/use-mobile";
import { isPasswordChangeRequired } from "@/lib/api-error";
import {
	currentUserOptionalQueryOptions,
	currentUserQueryOptions,
} from "@/lib/auth-api";
import { sprintsQueryOptions } from "@/lib/interaction-api";
import { PluginRegistryProvider } from "@/lib/plugins/registry";
import { connectSocket, disconnectSocket } from "@/lib/socket-client";
import { cn } from "@/lib/utils";

const PROJECT_ROUTE_RE = /^\/projects\/[^/]+/;

export const Route = createFileRoute("/_authenticated")({
	beforeLoad: async ({ context: { queryClient }, location }) => {
		const isProjectRoute = PROJECT_ROUTE_RE.test(location.pathname);

		if (isProjectRoute) {
			const user = await queryClient
				.fetchQuery(currentUserOptionalQueryOptions)
				.catch((err: unknown) => {
					if (isPasswordChangeRequired(err)) {
						throw redirect({ to: "/change-password" });
					}
					return null;
				});

			if (user?.must_change_password) {
				throw redirect({ to: "/change-password" });
			}

			return { user };
		}

		const user = await queryClient
			.fetchQuery(currentUserQueryOptions)
			.catch((err: unknown) => {
				if (isPasswordChangeRequired(err)) {
					throw redirect({ to: "/change-password" });
				}
				return null;
			});

		if (!user) {
			throw redirect({ to: "/" });
		}

		if (user.must_change_password) {
			throw redirect({ to: "/change-password" });
		}

		return { user };
	},
	component: AuthenticatedLayout,
});

function KeyboardShortcutsHandler({
	shortcutsOpen,
	setShortcutsOpen,
}: {
	shortcutsOpen: boolean;
	setShortcutsOpen: (open: boolean) => void;
}) {
	const { toggleSidebar } = useSidebar();

	useEffect(() => {
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

			if (e.key === "?") {
				e.preventDefault();
				setShortcutsOpen(!shortcutsOpen);
			} else if (e.key === "b" && !e.ctrlKey && !e.metaKey) {
				e.preventDefault();
				toggleSidebar();
			} else if (e.key === "c") {
				e.preventDefault();
				window.dispatchEvent(new CustomEvent("trigger-create-task"));
			} else if (e.key === "n") {
				e.preventDefault();
				window.dispatchEvent(new CustomEvent("trigger-create-doc"));
			}
		};

		document.addEventListener("keydown", handleKeyDown);
		return () => document.removeEventListener("keydown", handleKeyDown);
	}, [toggleSidebar, setShortcutsOpen, shortcutsOpen]);

	return null;
}

function AuthenticatedLayout() {
	const queryClient = useQueryClient();
	const { data: user } = useQuery(currentUserOptionalQueryOptions);
	const [shortcutsOpen, setShortcutsOpen] = useState(false);
	const isMobile = useIsMobile();

	const matches = useRouterState({ select: (s) => s.matches });
	const projectMatch = matches.find((m) => m.params && "projectId" in m.params);
	const projectId = projectMatch
		? (projectMatch.params as Record<string, string>).projectId
		: undefined;

	const { data: sprints = [] } = useQuery({
		...sprintsQueryOptions(projectId || ""),
		enabled: !!projectId,
	});
	const activeSprint = sprints.find((s) => s.status === "active");

	useEffect(() => {
		if (!user) return;

		const socket = connectSocket();

		const handleNotification = ({ type }: { type: string }) => {
			if (type === "notification.created") {
				queryClient.invalidateQueries({ queryKey: ["notifications"] });
			}
		};
		socket.on("notification", handleNotification);

		return () => {
			socket.off("notification", handleNotification);
			disconnectSocket();
		};
	}, [queryClient, user]);

	return (
		<PluginRegistryProvider>
			<SidebarProvider className="h-svh">
				<KeyboardShortcutsHandler
					shortcutsOpen={shortcutsOpen}
					setShortcutsOpen={setShortcutsOpen}
				/>
				<AppSidebar />
				<SidebarInset className="min-w-0 overflow-hidden">
					<header className="flex h-12 shrink-0 items-center gap-2 bg-background border-b border-border/40 px-4 sticky top-0 z-10">
						<div className="absolute inset-x-0 bottom-0 h-px bg-border/40" />
						<SidebarTrigger className="-ml-1 text-muted-foreground hover:text-foreground transition-colors" />
						<div className="w-px h-4 bg-border/60" />
						<Breadcrumbs />
						{user && (
							<div className="ml-auto flex items-center gap-2">
								<button
									type="button"
									onClick={() =>
										window.dispatchEvent(new CustomEvent("open-global-search"))
									}
									className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-border/60 bg-muted/30 text-xs text-muted-foreground hover:bg-muted/70 hover:text-foreground transition-all duration-150 cursor-pointer"
									title="Search... (Ctrl+K)"
								>
									<Search className="size-3.5 text-muted-foreground/80" />
									<span className="hidden sm:inline">Search...</span>
									<kbd className="hidden sm:inline-flex h-4 select-none items-center gap-0.5 rounded border bg-muted px-1.5 font-mono text-[9px] font-medium opacity-100">
										Ctrl+K
									</kbd>
								</button>
								<NotificationBell />
							</div>
						)}
					</header>
					<div
						className={cn(
							"flex min-h-0 flex-1 flex-col overflow-y-auto",
							projectId && isMobile ? "pb-16" : "",
						)}
					>
						<Outlet />
					</div>
				</SidebarInset>
				{projectId && isMobile && (
					<div className="fixed bottom-0 inset-x-0 h-16 bg-background/95 backdrop-blur-md border-t border-border/60 z-30 flex items-center justify-around px-4 pb-safe shadow-[0_-2px_10px_rgba(0,0,0,0.05)]">
						{[
							{
								label: "Board",
								icon: KanbanSquare,
								to: activeSprint
									? `/projects/${projectId}/interactions/sprints/${activeSprint.id}`
									: `/projects/${projectId}/interactions/timeline`,
							},
							{
								label: "Backlog",
								icon: GanttChart,
								to: `/projects/${projectId}/interactions/backlog`,
							},
							{
								label: "Agents",
								icon: Bot,
								to: `/projects/${projectId}/agents`,
							},
							{
								label: "Docs",
								icon: FileText,
								to: `/projects/${projectId}/docs`,
							},
							{
								label: "Team",
								icon: Users,
								to: `/projects/${projectId}/team`,
							},
						].map((item) => {
							const Icon = item.icon;
							return (
								<Link
									key={item.label}
									to={item.to}
									className="flex flex-col items-center gap-1 py-1 text-muted-foreground/85 hover:text-foreground transition-all duration-150 active:scale-95 cursor-pointer"
									activeProps={{
										className:
											"text-primary font-semibold [&>svg]:text-primary",
									}}
								>
									<Icon className="size-4.5" />
									<span className="text-[10px] tracking-wide font-medium">
										{item.label}
									</span>
								</Link>
							);
						})}
					</div>
				)}
			</SidebarProvider>
			<CommandPalette />
			<ShortcutsModal open={shortcutsOpen} onOpenChange={setShortcutsOpen} />
			<OnboardingTour />
		</PluginRegistryProvider>
	);
}
