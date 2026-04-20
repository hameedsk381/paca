import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { History, X } from "lucide-react";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
	type DocSnapshot,
	docSnapshotQueryOptions,
	docSnapshotsQueryOptions,
} from "@/lib/doc-api";
import { cn } from "@/lib/utils";
import { DocEditor } from "./doc-editor";

interface DocHistoryPanelProps {
	projectId: string;
	docId: string;
	onClose: () => void;
}

interface SnapshotViewerProps {
	projectId: string;
	docId: string;
	snapshotId: string;
}

function SnapshotViewer({ projectId, docId, snapshotId }: SnapshotViewerProps) {
	const { data: snapshot } = useQuery(
		docSnapshotQueryOptions(projectId, docId, snapshotId),
	);

	if (!snapshot) {
		return (
			<div className="flex-1 flex items-center justify-center text-muted-foreground/50 text-[13px]">
				Loading snapshot…
			</div>
		);
	}

	return (
		<div className="flex-1 overflow-y-auto [scrollbar-gutter:stable] [&::-webkit-scrollbar]:w-2 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-border/60 [&::-webkit-scrollbar-thumb]:hover:bg-border">
			<div className="p-6 space-y-4">
				<div className="flex items-center gap-2">
					<span className="inline-flex items-center gap-1.5 rounded-md bg-muted/60 px-2.5 py-1 text-[11px] font-bold text-muted-foreground/70 border border-border/30">
						<span className="font-mono tracking-wider">
							#{snapshot.snapshot_number}
						</span>
					</span>
					<span className="text-[11px] text-muted-foreground/50">
						{format(new Date(snapshot.created_at), "MMM d, yyyy 'at' HH:mm")}
					</span>
				</div>
				{snapshot.title && (
					<p className="text-[13px] font-medium text-foreground/80 truncate">
						{snapshot.title}
					</p>
				)}
				<DocEditor content={snapshot.content} editable={false} />
			</div>
		</div>
	);
}

interface SnapshotRowProps {
	snapshot: DocSnapshot;
	isSelected: boolean;
	onSelect: () => void;
}

function SnapshotRow({ snapshot, isSelected, onSelect }: SnapshotRowProps) {
	return (
		<button
			type="button"
			className={cn(
				"w-full text-left px-3 py-2.5 rounded-lg transition-all duration-150",
				isSelected
					? "bg-muted/40 text-foreground"
					: "hover:bg-muted/25 text-muted-foreground",
			)}
			onClick={onSelect}
		>
			<div className="flex items-center gap-2">
				<span
					className={cn(
						"font-mono text-[11px] font-semibold tracking-wider",
						isSelected ? "text-primary/80" : "text-muted-foreground/60",
					)}
				>
					#{snapshot.snapshot_number}
				</span>
				{isSelected && (
					<span className="size-1.5 rounded-full bg-primary/60 shrink-0" />
				)}
			</div>
			<span
				className={cn(
					"block text-[11px] mt-0.5",
					isSelected ? "text-muted-foreground/80" : "text-muted-foreground/50",
				)}
			>
				{format(new Date(snapshot.created_at), "MMM d, yyyy 'at' HH:mm")}
			</span>
			{snapshot.title && (
				<span className="block text-[11px] text-muted-foreground/50 truncate mt-0.5">
					{snapshot.title}
				</span>
			)}
		</button>
	);
}

export function DocHistoryPanel({
	projectId,
	docId,
	onClose,
}: DocHistoryPanelProps) {
	const { data: snapshots = [] } = useQuery(
		docSnapshotsQueryOptions(projectId, docId),
	);

	const [selectedId, setSelectedId] = useSelectedSnapshot(snapshots);

	const sorted = [...snapshots].sort(
		(a, b) => b.snapshot_number - a.snapshot_number,
	);

	return (
		<div className="flex h-full bg-muted/10 border-l border-border/25">
			{/* Snapshot list sidebar — side panel pattern */}
			<div className="w-52 shrink-0 flex flex-col border-r border-border/25">
				{/* Header */}
				<div className="flex shrink-0 items-center gap-2.5 border-b border-border/25 px-4 py-3 bg-muted/20">
					<History className="size-3.5 text-muted-foreground/70" />
					<span className="text-[13px] font-semibold text-foreground/80">
						History
					</span>
					<Button
						variant="ghost"
						size="icon"
						className="size-5 ml-auto text-muted-foreground/60 hover:text-foreground hover:bg-muted/60 transition-all duration-150"
						onClick={onClose}
					>
						<X className="size-3.5" />
					</Button>
				</div>

				<ScrollArea className="flex-1">
					<div className="p-2 space-y-0.5">
						{sorted.length === 0 ? (
							<div className="flex flex-col items-center py-8 text-muted-foreground/40">
								<History className="size-5 mb-2" />
								<p className="text-[12px] font-medium">No snapshots yet</p>
							</div>
						) : (
							sorted.map((s) => (
								<SnapshotRow
									key={s.id}
									snapshot={s}
									isSelected={s.id === selectedId}
									onSelect={() => setSelectedId(s.id)}
								/>
							))
						)}
					</div>
				</ScrollArea>
			</div>

			{/* Snapshot content viewer */}
			{selectedId ? (
				<SnapshotViewer
					projectId={projectId}
					docId={docId}
					snapshotId={selectedId}
				/>
			) : (
				<div className="flex-1 flex items-center justify-center text-muted-foreground">
					<div className="text-center">
						<History className="size-7 mx-auto mb-2 opacity-30" />
						<p className="text-[13px] text-muted-foreground/50">
							Select a snapshot to view
						</p>
					</div>
				</div>
			)}
		</div>
	);
}

// Tiny helper: keeps selected snapshot in sync with list (auto-selects first).
function useSelectedSnapshot(
	snapshots: DocSnapshot[],
): [string | null, (id: string) => void] {
	const [selected, setSelected] = useState<string | null>(null);

	useEffect(() => {
		if (!selected && snapshots.length > 0) {
			setSelected(snapshots[0].id);
		}
	}, [snapshots, selected]);

	return [selected, setSelected];
}
