import { useMemo, useState } from "react";
import { format, differenceInCalendarDays, parseISO } from "date-fns";
import { TrendingDown, Calendar, Target, Flame, Info } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Card, CardContent } from "@/components/ui/card";
import type { Sprint, Task } from "@/lib/interaction-api";
import type { TaskStatus } from "@/lib/project-api";
import { cn } from "@/lib/utils";

interface SprintAnalyticsProps {
	sprint: Sprint;
	tasks: Task[];
	statuses: TaskStatus[];
}

export function SprintSummaryBar({ sprint, tasks, statuses }: SprintAnalyticsProps) {
	const [burndownOpen, setBurndownOpen] = useState(false);

	const doneStatusIds = useMemo(() => {
		return new Set(statuses.filter((s) => s.category === "done").map((s) => s.id));
	}, [statuses]);

	const inProgressStatusIds = useMemo(() => {
		return new Set(statuses.filter((s) => s.category === "inprogress").map((s) => s.id));
	}, [statuses]);

	const todoStatusIds = useMemo(() => {
		return new Set(
			statuses.filter((s) => s.category === "todo" || s.category === "ready").map((s) => s.id)
		);
	}, [statuses]);

	// Calculate counts and story points
	const metrics = useMemo(() => {
		const totalTasks = tasks.length;
		const completedTasks = tasks.filter((t) => t.status_id && doneStatusIds.has(t.status_id)).length;
		const inProgressTasks = tasks.filter((t) => t.status_id && inProgressStatusIds.has(t.status_id)).length;
		const todoTasks = tasks.filter((t) => !t.status_id || todoStatusIds.has(t.status_id)).length;

		const totalStoryPoints = tasks.reduce((sum, t) => sum + (t.story_points ?? 0), 0);
		const completedStoryPoints = tasks.reduce(
			(sum, t) => sum + (t.status_id && doneStatusIds.has(t.status_id) ? (t.story_points ?? 0) : 0),
			0
		);

		const taskProgressPercent = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;
		const spProgressPercent =
			totalStoryPoints > 0 ? Math.round((completedStoryPoints / totalStoryPoints) * 100) : 0;

		// Time remaining calculation
		const today = new Date();
		today.setHours(0, 0, 0, 0);
		const start = sprint.start_date ? parseISO(sprint.start_date) : new Date(sprint.created_at);
		const end = sprint.end_date ? parseISO(sprint.end_date) : new Date(start.getTime() + 14 * 24 * 60 * 60 * 1000);
		
		const totalDays = Math.max(1, differenceInCalendarDays(end, start));
		const daysRemaining = differenceInCalendarDays(end, today);

		let timeLabel = "";
		let timeColor = "text-muted-foreground";

		if (sprint.status === "completed") {
			timeLabel = "Completed";
			timeColor = "text-emerald-500 font-bold";
		} else if (daysRemaining > 0) {
			timeLabel = `${daysRemaining} day${daysRemaining === 1 ? "" : "s"} left`;
			if (daysRemaining <= 2) {
				timeColor = "text-orange-500 font-semibold animate-pulse";
			}
		} else if (daysRemaining === 0) {
			timeLabel = "Ends today";
			timeColor = "text-red-500 font-bold animate-pulse";
		} else {
			timeLabel = `Ended ${Math.abs(daysRemaining)} day${Math.abs(daysRemaining) === 1 ? "" : "s"} ago`;
			timeColor = "text-red-400 font-medium";
		}

		return {
			totalTasks,
			completedTasks,
			inProgressTasks,
			todoTasks,
			totalStoryPoints,
			completedStoryPoints,
			taskProgressPercent,
			spProgressPercent,
			timeLabel,
			timeColor,
			totalDays,
			daysRemaining,
			formattedRange: `${format(start, "MMM d")} – ${format(end, "MMM d, yyyy")}`,
		};
	}, [sprint, tasks, doneStatusIds, inProgressStatusIds, todoStatusIds]);

	return (
		<div className="mx-6 mt-4 shrink-0">
			<Card className="border-border/30 bg-card/60 backdrop-blur-xs shadow-xs rounded-xl overflow-hidden transition-all duration-200 hover:border-border/50 hover:shadow-sm">
				<CardContent className="p-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
					
					{/* Left: Sprint Goal & Metadata */}
					<div className="flex-1 min-w-0 space-y-1">
						<div className="flex items-center gap-2 flex-wrap">
							<span className="font-[Syne] text-[15px] font-bold text-foreground truncate max-w-[200px] sm:max-w-xs md:max-w-sm">
								{sprint.name}
							</span>
							<span className={cn("text-[11px] px-2 py-0.5 rounded-full border bg-muted/40 font-semibold", metrics.timeColor)}>
								{metrics.timeLabel}
							</span>
							<span className="flex items-center gap-1 text-[11px] text-muted-foreground/80">
								<Calendar className="size-3 shrink-0" />
								{metrics.formattedRange}
							</span>
						</div>
						{sprint.goal ? (
							<div className="flex items-start gap-1.5 text-xs text-muted-foreground/90 max-w-[90%]">
								<Target className="size-3.5 text-primary shrink-0 mt-0.5" />
								<p className="italic line-clamp-1">{sprint.goal}</p>
							</div>
						) : (
							<p className="text-xs text-muted-foreground/50 italic">No sprint goal specified</p>
						)}
					</div>

					{/* Middle: Progress Bars */}
					<div className="flex flex-col sm:flex-row gap-4 sm:gap-6 items-center shrink-0">
						{/* Tasks Progress */}
						<div className="flex flex-col w-36 sm:w-40 gap-1">
							<div className="flex items-center justify-between text-[11px]">
								<span className="text-muted-foreground font-semibold">Tasks Completed</span>
								<span className="font-bold tabular-nums">
									{metrics.completedTasks}/{metrics.totalTasks} ({metrics.taskProgressPercent}%)
								</span>
							</div>
							<div className="h-1.5 w-full rounded-full bg-muted/70 overflow-hidden ring-1 ring-border/5">
								<div
									className="h-full rounded-full bg-primary transition-all duration-500 ease-out"
									style={{ width: `${metrics.taskProgressPercent}%` }}
								/>
							</div>
						</div>

						{/* Story Points Progress (Only show if story points exist in sprint) */}
						{metrics.totalStoryPoints > 0 && (
							<div className="flex flex-col w-36 sm:w-40 gap-1">
								<div className="flex items-center justify-between text-[11px]">
									<span className="text-muted-foreground font-semibold">Points Burned</span>
									<span className="font-bold tabular-nums">
										{metrics.completedStoryPoints}/{metrics.totalStoryPoints} ({metrics.spProgressPercent}%)
									</span>
								</div>
								<div className="h-1.5 w-full rounded-full bg-muted/70 overflow-hidden ring-1 ring-border/5">
									<div
										className="h-full rounded-full bg-violet-500 dark:bg-violet-400 transition-all duration-500 ease-out"
										style={{ width: `${metrics.spProgressPercent}%` }}
									/>
								</div>
							</div>
						)}
					</div>

					{/* Right: Actions */}
					<div className="flex items-center gap-2 shrink-0 self-end md:self-auto">
						<button
							type="button"
							onClick={() => setBurndownOpen(true)}
							className="inline-flex items-center gap-1.5 rounded-lg border border-border/40 hover:border-primary/30 bg-background/50 hover:bg-primary/5 px-3 py-1.5 text-[11.5px] font-semibold text-foreground/80 hover:text-primary transition-all duration-150 shadow-xs cursor-pointer active:scale-95"
						>
							<TrendingDown className="size-3.5 shrink-0" />
							Burndown
						</button>
					</div>

				</CardContent>
			</Card>

			{/* Burndown Chart Modal */}
			<Dialog open={burndownOpen} onOpenChange={setBurndownOpen}>
				<DialogContent className="sm:max-w-2xl bg-popover ring-1 ring-border shadow-2xl rounded-xl p-5 overflow-hidden">
					<DialogHeader className="pb-1 border-b border-border/30">
						<DialogTitle className="font-[Syne] text-[18px] font-bold flex items-center gap-2">
							<Flame className="size-4.5 text-orange-500 animate-pulse" />
							Sprint Burndown Chart
						</DialogTitle>
						<p className="text-[12px] text-muted-foreground">
							Track the daily progress and burn rate of tasks and story points in {sprint.name}.
						</p>
					</DialogHeader>
					<div className="py-4">
						<SprintBurndownChart sprint={sprint} tasks={tasks} statuses={statuses} />
					</div>
				</DialogContent>
			</Dialog>
		</div>
	);
}

interface BurndownDayData {
	dayIndex: number;
	date: Date;
	dateLabel: string;
	ideal: number;
	actual: number | null;
}

export function SprintBurndownChart({ sprint, tasks, statuses }: SprintAnalyticsProps) {
	const doneStatusIds = useMemo(() => {
		return new Set(statuses.filter((s) => s.category === "done").map((s) => s.id));
	}, [statuses]);

	const chartData = useMemo(() => {
		if (!tasks || tasks.length === 0) {
			return { daysData: [], totalValue: 0, totalDays: 1, useStoryPoints: false };
		}

		const start = sprint.start_date ? parseISO(sprint.start_date) : new Date(sprint.created_at);
		const end = sprint.end_date ? parseISO(sprint.end_date) : new Date(start.getTime() + 14 * 24 * 60 * 60 * 1000);
		
		const totalDays = Math.max(1, differenceInCalendarDays(end, start));
		
		// Determine whether to track Story Points or Task Counts
		const useStoryPoints = tasks.some((t) => t.story_points != null && t.story_points > 0);
		const getTaskVal = (t: Task) => (useStoryPoints ? (t.story_points ?? 0) : 1);
		
		const totalValue = tasks.reduce((sum, t) => sum + getTaskVal(t), 0);
		
		const daysData: BurndownDayData[] = [];
		const today = new Date();
		today.setHours(23, 59, 59, 999);

		for (let i = 0; i <= totalDays; i++) {
			const dayDate = new Date(start.getTime() + i * 24 * 60 * 60 * 1000);
			dayDate.setHours(23, 59, 59, 999);
			
			// Ideal burndown remaining
			const idealRemaining = Math.max(0, totalValue - i * (totalValue / totalDays));
			
			// Actual burndown remaining
			// We filter for tasks that were NOT completed by the end of dayDate
			const actualRemaining = tasks
				.filter((t) => {
					const isDone = doneStatusIds.has(t.status_id ?? "");
					if (!isDone) return true;
					const completedAt = new Date(t.updated_at || t.created_at);
					return completedAt.getTime() > dayDate.getTime();
				})
				.reduce((sum, t) => sum + getTaskVal(t), 0);

			const isFuture = dayDate.getTime() > today.getTime();

			daysData.push({
				dayIndex: i,
				date: dayDate,
				dateLabel: format(dayDate, "MMM d"),
				ideal: Math.round(idealRemaining * 10) / 10,
				actual: isFuture ? null : actualRemaining,
			});
		}

		return {
			daysData,
			totalValue,
			totalDays,
			useStoryPoints,
		};
	}, [sprint, tasks, doneStatusIds]);

	// Interactive point hover details state
	const [hoveredPoint, setHoveredPoint] = useState<BurndownDayData | null>(null);

	const { daysData, totalValue, totalDays, useStoryPoints } = chartData;

	// SVG viewport settings
	const svgWidth = 580;
	const svgHeight = 280;
	const margin = { top: 15, right: 20, bottom: 35, left: 45 };
	const chartWidth = svgWidth - margin.left - margin.right;
	const chartHeight = svgHeight - margin.top - margin.bottom;

	const getX = (index: number) => margin.left + (index / totalDays) * chartWidth;
	const getY = (value: number) => {
		if (totalValue === 0) return margin.top + chartHeight;
		return margin.top + chartHeight - (value / totalValue) * chartHeight;
	};

	if (totalValue === 0) {
		return (
			<div className="flex flex-col items-center justify-center py-12 text-muted-foreground/40">
				<TrendingDown className="size-8 mb-2 opacity-50" />
				<p className="text-sm font-semibold">No data available</p>
				<p className="text-[11px] text-center max-w-[280px]">
					Add tasks with story points or status to begin tracking sprint metrics.
				</p>
			</div>
		);
	}

	// Generate lines
	const idealPoints = daysData.map((d) => `${getX(d.dayIndex)},${getY(d.ideal)}`).join(" ");
	
	const actualPoints = daysData
		.filter((d) => d.actual !== null)
		.map((d) => `${getX(d.dayIndex)},${getY(d.actual!)}`)
		.join(" ");

	// Y-axis grid ticks (4 major grid lines)
	const yTicks = Array.from({ length: 5 }, (_, i) => Math.round((totalValue / 4) * i));

	return (
		<div className="flex flex-col gap-4">
			{/* Grid Metrics Header */}
			<div className="grid grid-cols-3 gap-3">
				<div className="rounded-xl border border-border/25 bg-muted/10 p-3 flex flex-col justify-center">
					<span className="text-[9.5px] font-semibold text-muted-foreground uppercase tracking-wider">Start Weight</span>
					<span className="text-xl font-bold font-[Syne] mt-0.5">
						{totalValue} {useStoryPoints ? "SP" : "Tasks"}
					</span>
				</div>
				<div className="rounded-xl border border-border/25 bg-muted/10 p-3 flex flex-col justify-center">
					<span className="text-[9.5px] font-semibold text-muted-foreground uppercase tracking-wider">Current Remaining</span>
					<span className="text-xl font-bold font-[Syne] mt-0.5 text-primary">
						{daysData.filter((d) => d.actual !== null).pop()?.actual ?? totalValue} {useStoryPoints ? "SP" : "Tasks"}
					</span>
				</div>
				<div className="rounded-xl border border-border/25 bg-muted/10 p-3 flex flex-col justify-center">
					<span className="text-[9.5px] font-semibold text-muted-foreground uppercase tracking-wider">Daily Burn Rate</span>
					<span className="text-xl font-bold font-[Syne] mt-0.5 text-violet-500">
						{Math.round((totalValue / totalDays) * 10) / 10} {useStoryPoints ? "SP" : "Tasks"}/d
					</span>
				</div>
			</div>

			{/* SVG Chart Area */}
			<div className="relative border border-border/25 bg-card/40 rounded-xl p-3 select-none flex items-center justify-center">
				<svg width="100%" height={svgHeight} viewBox={`0 0 ${svgWidth} ${svgHeight}`} className="overflow-visible">
					{/* Definitions for gradient and glow effects */}
					<defs>
						<linearGradient id="actualAreaGrad" x1="0" y1="0" x2="0" y2="1">
							<stop offset="0%" stopColor="oklch(var(--primary))" stopOpacity="0.12" />
							<stop offset="100%" stopColor="oklch(var(--primary))" stopOpacity="0.0" />
						</linearGradient>
					</defs>

					{/* Y-axis Ticks & Horizontal Grid lines */}
					{yTicks.map((val) => {
						const y = getY(val);
						return (
							<g key={val} className="opacity-40">
								<line
									x1={margin.left}
									y1={y}
									x2={svgWidth - margin.right}
									y2={y}
									stroke="oklch(var(--border) / 0.5)"
									strokeWidth="1"
								/>
								<text
									x={margin.left - 8}
									y={y + 4}
									textAnchor="end"
									className="fill-muted-foreground text-[10px] font-medium font-mono"
								>
									{val}
								</text>
							</g>
						);
					})}

					{/* X-axis Ticks (Dates) */}
					{daysData
						.filter((_, idx) => idx === 0 || idx === totalDays || idx === Math.round(totalDays / 2))
						.map((d) => {
							const x = getX(d.dayIndex);
							return (
								<g key={d.dayIndex} className="opacity-45">
									<text
										x={x}
										y={svgHeight - margin.bottom + 16}
										textAnchor="middle"
										className="fill-muted-foreground text-[10px] font-semibold"
									>
										{d.dateLabel}
									</text>
								</g>
							);
						})}

					{/* Ideal Burndown Line */}
					<polyline
						fill="none"
						stroke="oklch(var(--muted-foreground) / 0.35)"
						strokeWidth="2"
						strokeDasharray="4,4"
						points={idealPoints}
					/>

					{/* Actual Burndown Area and Line */}
					{daysData.filter((d) => d.actual !== null).length > 0 && (
						<>
							{/* Area under actual line */}
							<path
								d={`M ${getX(0)} ${getY(totalValue)} 
									${daysData
										.filter((d) => d.actual !== null)
										.map((d) => `L ${getX(d.dayIndex)} ${getY(d.actual!)}`)
										.join(" ")} 
									L ${getX(daysData.filter((d) => d.actual !== null).pop()!.dayIndex)} ${getY(0)} 
									L ${getX(0)} ${getY(0)} Z`}
								fill="url(#actualAreaGrad)"
							/>
							{/* Actual Line */}
							<polyline
								fill="none"
								stroke="oklch(var(--primary))"
								strokeWidth="3"
								points={actualPoints}
								strokeLinecap="round"
								strokeLinejoin="round"
							/>
						</>
					)}

					{/* Hover Interaction Areas and Visual Dots */}
					{daysData.map((d) => {
						const x = getX(d.dayIndex);
						const yIdeal = getY(d.ideal);
						const yActual = d.actual !== null ? getY(d.actual) : null;
						const isToday = hoveredPoint?.dayIndex === d.dayIndex;

						return (
							<g key={d.dayIndex}>
								{/* Hover Target Column (invisible overlay) */}
								<rect
									x={x - chartWidth / (totalDays * 2)}
									y={margin.top}
									width={chartWidth / totalDays}
									height={chartHeight}
									fill="transparent"
									className="cursor-pointer"
									onMouseEnter={() => setHoveredPoint(d)}
									onMouseLeave={() => setHoveredPoint(null)}
								/>

								{/* Hover vertical reference line */}
								{isToday && (
									<line
										x1={x}
										y1={margin.top}
										x2={x}
										y2={svgHeight - margin.bottom}
										stroke="oklch(var(--primary) / 0.15)"
										strokeWidth="1"
										strokeDasharray="2,2"
									/>
								)}

								{/* Ideal Line Dots */}
								{isToday && (
									<circle
										cx={x}
										cy={yIdeal}
										r="3.5"
										className="fill-muted-foreground stroke-background stroke-2"
									/>
								)}

								{/* Actual Line Dots */}
								{yActual !== null && (
									<circle
										cx={x}
										cy={yActual}
										r={isToday ? "5" : "3.5"}
										className={cn(
											"fill-primary stroke-background stroke-2 transition-all duration-100",
											isToday && "r-5 stroke-primary/30 stroke-[4px]"
										)}
									/>
								)}
							</g>
						);
					})}
				</svg>

				{/* Floating HTML Tooltip overlay */}
				{hoveredPoint && (
					<div
						className="absolute top-2 bg-popover/95 backdrop-blur-md text-popover-foreground border border-border/40 p-2.5 rounded-lg shadow-lg text-xs flex flex-col gap-1 w-44 pointer-events-none transition-all duration-100 ease-out"
						style={{
							left: `${Math.min(
								svgWidth - 190,
								Math.max(10, (hoveredPoint.dayIndex / totalDays) * 90 + 5)
							)}%`,
						}}
					>
						<div className="font-semibold text-foreground border-b border-border/15 pb-1 flex items-center justify-between">
							<span>Day {hoveredPoint.dayIndex}</span>
							<span className="text-[10px] text-muted-foreground">{hoveredPoint.dateLabel}</span>
						</div>
						<div className="flex justify-between mt-1">
							<span className="text-muted-foreground">Ideal remaining:</span>
							<span className="font-mono font-bold">{hoveredPoint.ideal}</span>
						</div>
						<div className="flex justify-between">
							<span className="text-muted-foreground">Actual remaining:</span>
							<span className={cn("font-mono font-bold", hoveredPoint.actual !== null ? "text-primary" : "text-muted-foreground/30")}>
								{hoveredPoint.actual !== null ? hoveredPoint.actual : "—"}
							</span>
						</div>
					</div>
				)}
			</div>

			{/* Footnotes / Help Banner */}
			<div className="rounded-lg bg-muted/20 border border-border/15 p-2.5 flex items-start gap-2">
				<Info className="size-3.5 text-primary shrink-0 mt-0.5" />
				<p className="text-[10.5px] text-muted-foreground leading-normal">
					The <span className="font-semibold text-muted-foreground">Ideal line (dashed)</span> starts at total sprint scope and decreases linearly to 0 by the end date. The <span className="font-semibold text-primary">Actual line (solid blue)</span> shows actual remaining scope, reflecting points/tasks completed over time.
				</p>
			</div>
		</div>
	);
}
