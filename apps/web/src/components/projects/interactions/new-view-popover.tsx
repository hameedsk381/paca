import { KanbanSquare, List, Map as MapIcon, Plus, Puzzle } from "lucide-react";
import { useState } from "react";

import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@/components/ui/popover";
import type { PluginRegistration } from "@/lib/plugin-api";
import type { ViewLayout } from "@/lib/interaction-api";
import { cn } from "@/lib/utils";

interface NewViewPopoverProps {
	onSubmit: (
		name: string,
		layout: ViewLayout,
		pluginRegistration?: PluginRegistration,
	) => Promise<unknown>;
	isPending?: boolean;
	pluginRegistrations?: PluginRegistration[];
}

type LayoutOption =
	| { type: "builtin"; layout: ViewLayout }
	| { type: "plugin"; registration: PluginRegistration };

const builtinLayouts: ViewLayout[] = ["Board", "Table", "Roadmap"];

const layoutIcon = (l: ViewLayout) => {
	if (l === "Board") return <KanbanSquare className="size-3.5" />;
	if (l === "Roadmap") return <MapIcon className="size-3.5" />;
	return <List className="size-3.5" />;
};

export function NewViewPopover({
	onSubmit,
	isPending,
	pluginRegistrations = [],
}: NewViewPopoverProps) {
	const [open, setOpen] = useState(false);
	const [name, setName] = useState("");
	const [selected, setSelected] = useState<LayoutOption>({
		type: "builtin",
		layout: "Board",
	});

	const activeLabel =
		selected.type === "builtin"
			? selected.layout
			: selected.registration.pluginName;

	const submit = async () => {
		if (selected.type === "builtin") {
			await onSubmit(name || `New ${selected.layout}`, selected.layout);
		} else {
			await onSubmit(
				name || `New ${selected.registration.pluginName}`,
				"Plugin",
				selected.registration,
			);
		}
		setName("");
		setOpen(false);
	};

	return (
		<Popover open={open} onOpenChange={setOpen}>
			<PopoverTrigger
				render={
					<button
						type="button"
						aria-label="Add view"
						className="flex items-center gap-1 rounded-lg px-2 py-1 text-[12px] font-medium text-muted-foreground/70 hover:text-foreground hover:bg-muted/60 transition-all duration-150"
					/>
				}
			>
				<Plus className="size-3.5" />
				<span className="hidden sm:inline">Add view</span>
			</PopoverTrigger>
			<PopoverContent
				side="bottom"
				align="end"
				className="w-72 p-0 gap-0 rounded-xl border border-border/40 shadow-lg"
				sideOffset={6}
			>
				<div className="px-3 py-2.5 border-b border-border/30">
					<p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground/70">
						New view
					</p>
				</div>
				<div className="p-3 flex flex-col gap-3">
					<div className="flex flex-col gap-1.5">
						<label
							htmlFor="new-view-name"
							className="text-[12px] font-medium text-muted-foreground"
						>
							View name
						</label>
						<input
							id="new-view-name"
							value={name}
							onChange={(e) => setName(e.target.value)}
							onKeyDown={(e) => e.key === "Enter" && submit()}
							placeholder={`New ${activeLabel}`}
							className="w-full rounded-lg border border-border/30 bg-muted/15 px-3 py-2 text-[13px] font-medium outline-none focus:border-primary/40 focus:ring-2 focus:ring-primary/15 placeholder:text-muted-foreground/50 transition-all duration-150"
						/>
					</div>
					<div className="flex flex-col gap-1.5">
						<p className="text-[12px] font-medium text-muted-foreground">
							Layout
						</p>
						<div className="flex flex-wrap gap-2">
							{builtinLayouts.map((l) => {
								const isActive =
									selected.type === "builtin" && selected.layout === l;
								return (
									<button
										key={l}
										type="button"
										onClick={() => setSelected({ type: "builtin", layout: l })}
										className={cn(
											"flex items-center justify-center gap-1.5 rounded-lg border px-3 py-2 text-[12px] font-medium transition-all duration-150",
											isActive
												? "border-primary/40 bg-primary/8 text-primary"
												: "border-border/25 text-muted-foreground/70 hover:text-foreground hover:border-border/40",
										)}
									>
										{layoutIcon(l)}
										{l}
									</button>
								);
							})}
							{pluginRegistrations.map((reg) => {
								const key = `${reg.pluginId}:${reg.component}`;
								const isActive =
									selected.type === "plugin" &&
									`${selected.registration.pluginId}:${selected.registration.component}` ===
										key;
								return (
									<button
										key={key}
										type="button"
										onClick={() =>
											setSelected({ type: "plugin", registration: reg })
										}
										className={cn(
											"flex items-center justify-center gap-1.5 rounded-lg border px-3 py-2 text-[12px] font-medium transition-all duration-150",
											isActive
												? "border-primary/40 bg-primary/8 text-primary"
												: "border-border/25 text-muted-foreground/70 hover:text-foreground hover:border-border/40",
										)}
									>
										<Puzzle className="size-3.5" />
										{reg.pluginName}
									</button>
								);
							})}
						</div>
					</div>
					<button
						type="button"
						onClick={submit}
						disabled={isPending}
						className="w-full rounded-lg bg-primary py-2 text-[13px] font-semibold text-primary-foreground hover:bg-primary/90 shadow-sm disabled:opacity-40 transition-all duration-150"
					>
						{isPending ? "Creating…" : "Create view"}
					</button>
				</div>
			</PopoverContent>
		</Popover>
	);
}
