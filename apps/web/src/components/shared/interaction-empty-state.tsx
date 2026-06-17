import { Button } from "@/components/ui/button";
import { Calendar, FolderKanban, Layers, Plus } from "lucide-react";

interface InteractionEmptyStateProps {
	context: "backlog" | "sprint" | string;
	canCreate: boolean;
	onCreateClick: () => void;
}

export function InteractionEmptyState({
	context,
	canCreate,
	onCreateClick,
}: InteractionEmptyStateProps) {
	const config = (() => {
		if (context === "backlog") {
			return {
				icon: Layers,
				title: "Your backlog is empty",
				description: "Start by creating epics, stories, and tasks to plan your project's roadmap.",
				buttonText: "Create first task",
			};
		}
		if (context === "sprint") {
			return {
				icon: Calendar,
				title: "No tasks in this sprint yet",
				description: "Create tasks directly in this sprint, or move existing tasks here from the product backlog.",
				buttonText: "Create first task",
			};
		}
		return {
			icon: FolderKanban,
			title: "No tasks to display",
			description: "Create tasks to start tracking work for your team.",
			buttonText: "Create first task",
		};
	})();

	const Icon = config.icon;

	return (
		<div className="flex flex-1 flex-col items-center justify-center p-8 text-center min-h-[350px]">
			<div className="relative mb-4">
				<div className="absolute inset-0 scale-110 rounded-2xl bg-primary/10 blur-xl opacity-50" />
				<div className="relative flex size-16 items-center justify-center rounded-2xl bg-muted/60 dark:bg-muted border border-border/40">
					<Icon className="size-8 text-muted-foreground/60" />
				</div>
			</div>
			<div className="max-w-xs space-y-1.5 mb-6">
				<h3 className="font-[Syne] text-base font-bold text-foreground">
					{config.title}
				</h3>
				<p className="text-xs text-muted-foreground leading-relaxed">
					{config.description}
				</p>
			</div>
			{canCreate && (
				<Button
					size="sm"
					onClick={onCreateClick}
					className="gap-1.5 shadow-sm shadow-primary/20"
				>
					<Plus className="size-4" />
					{config.buttonText}
				</Button>
			)}
		</div>
	);
}
