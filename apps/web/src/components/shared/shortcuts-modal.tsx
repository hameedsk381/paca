import { HelpCircle } from "lucide-react";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";

interface ShortcutsModalProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
}

export function ShortcutsModal({ open, onOpenChange }: ShortcutsModalProps) {
	const groups = [
		{
			title: "Navigation",
			items: [
				{ keys: ["⌘", "K"], description: "Open Search & Command Palette" },
				{ keys: ["B"], description: "Toggle Sidebar panel" },
			],
		},
		{
			title: "Quick Actions",
			items: [
				{ keys: ["C"], description: "Create new task" },
				{ keys: ["N"], description: "Create new document" },
			],
		},
		{
			title: "General",
			items: [
				{ keys: ["?"], description: "Open Keyboard Shortcuts Help" },
				{ keys: ["Esc"], description: "Close dialogs / modals / panels" },
			],
		},
	];

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="sm:max-w-md bg-popover ring-1 ring-border shadow-2xl rounded-xl">
				<DialogHeader>
					<div className="flex size-10 items-center justify-center rounded-full bg-primary/10 mb-2 text-primary">
						<HelpCircle className="size-5" />
					</div>
					<DialogTitle>Keyboard Shortcuts</DialogTitle>
					<DialogDescription>
						Quick hotkeys to navigate and perform actions in Paca.
					</DialogDescription>
				</DialogHeader>

				<div className="space-y-5 py-2">
					{groups.map((group) => (
						<div key={group.title} className="space-y-2.5">
							<h3 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
								{group.title}
							</h3>
							<div className="space-y-2">
								{group.items.map((item) => (
									<div
										key={item.description}
										className="flex items-center justify-between text-sm"
									>
										<span className="text-foreground/80">
											{item.description}
										</span>
										<div className="flex items-center gap-1">
											{item.keys.map((k) => (
												<kbd
													key={k}
													className="font-mono text-xs font-semibold bg-muted border border-border/70 rounded px-2 py-0.5 shadow-sm text-foreground/70"
												>
													{k}
												</kbd>
											))}
										</div>
									</div>
								))}
							</div>
						</div>
					))}
				</div>
			</DialogContent>
		</Dialog>
	);
}
