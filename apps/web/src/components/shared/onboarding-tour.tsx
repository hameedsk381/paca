import {
	Bot,
	Check,
	ChevronLeft,
	ChevronRight,
	FileText,
	KanbanSquare,
	Sparkles,
	X,
} from "lucide-react";
import { useEffect, useState } from "react";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function OnboardingTour() {
	const [isOpen, setIsOpen] = useState(false);
	const [currentStep, setCurrentStep] = useState(0);

	useEffect(() => {
		const completed = localStorage.getItem("paca-tour-completed");
		if (completed !== "true") {
			// Small delay to let the app load first
			const timer = setTimeout(() => {
				setIsOpen(true);
			}, 1500);
			return () => clearTimeout(timer);
		}
	}, []);

	// Listen for global reset event
	useEffect(() => {
		const handleReset = () => {
			setCurrentStep(0);
			setIsOpen(true);
		};
		window.addEventListener("reset-onboarding-tour", handleReset);
		return () =>
			window.removeEventListener("reset-onboarding-tour", handleReset);
	}, []);

	if (!isOpen) return null;

	const steps = [
		{
			title: "Welcome to Paca!",
			description:
				"Paca is a collaborative Scrumban tool where humans and AI agents work side by side in a Plan → Act → Check → Adapt (P-A-C-A) loop.",
			icon: Sparkles,
			color: "text-violet-500 bg-violet-500/10",
		},
		{
			title: "The Project Board",
			description:
				"Manage your tasks across columns. On mobile devices, swipe left or right on the board container, or tap the tab headers, to shift between status columns.",
			icon: KanbanSquare,
			color: "text-blue-500 bg-blue-500/10",
		},
		{
			title: "AI Agent Collaborators",
			description:
				"Assign tasks to AI agents or discuss work inside the Agents section. Agents analyze requirements, build code, and update task status dynamically.",
			icon: Bot,
			color: "text-emerald-500 bg-emerald-500/10",
		},
		{
			title: "Shared Documentation",
			description:
				"Create plans, architecture guides, and onboarding documents. Both humans and AI agents read these files to stay fully aligned on context.",
			icon: FileText,
			color: "text-amber-500 bg-amber-500/10",
		},
	];

	const handleNext = () => {
		if (currentStep < steps.length - 1) {
			setCurrentStep(currentStep + 1);
		} else {
			handleFinish();
		}
	};

	const handleBack = () => {
		if (currentStep > 0) {
			setCurrentStep(currentStep - 1);
		}
	};

	const handleFinish = () => {
		localStorage.setItem("paca-tour-completed", "true");
		setIsOpen(false);
	};

	const StepIcon = steps[currentStep].icon;

	return (
		<div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in duration-200">
			<div className="relative w-full max-w-md bg-card border border-border/60 rounded-2xl shadow-2xl p-6 overflow-hidden flex flex-col gap-5 animate-in zoom-in-95 duration-200">
				{/* Top Header & Close */}
				<div className="flex items-start justify-between">
					<div
						className={cn(
							"flex size-10 items-center justify-center rounded-xl",
							steps[currentStep].color,
						)}
					>
						<StepIcon className="size-5" />
					</div>
					<button
						type="button"
						onClick={handleFinish}
						className="rounded-lg p-1.5 text-muted-foreground/60 hover:text-foreground hover:bg-muted/80 transition-colors cursor-pointer"
						aria-label="Skip onboarding"
					>
						<X className="size-4" />
					</button>
				</div>

				{/* Step Content */}
				<div className="space-y-2.5">
					<h3 className="font-[Syne] text-lg font-bold text-foreground">
						{steps[currentStep].title}
					</h3>
					<p className="text-[13.5px] text-muted-foreground leading-relaxed">
						{steps[currentStep].description}
					</p>
				</div>

				{/* Footer Controls */}
				<div className="flex items-center justify-between pt-2 border-t border-border/20 mt-2 shrink-0">
					{/* Progress dots */}
					<div className="flex items-center gap-1.5">
						{steps.map((step, idx) => (
							<span
								key={step.title}
								className={cn(
									"size-1.5 rounded-full transition-all duration-300",
									idx === currentStep
										? "bg-primary w-4"
										: "bg-muted-foreground/30",
								)}
							/>
						))}
					</div>

					{/* Navigation buttons */}
					<div className="flex items-center gap-2">
						{currentStep > 0 && (
							<button
								type="button"
								onClick={handleBack}
								className="inline-flex items-center gap-1 text-xs font-semibold px-3 py-1.5 rounded-lg border border-border hover:bg-muted/80 active:scale-95 transition-all text-muted-foreground hover:text-foreground cursor-pointer"
							>
								<ChevronLeft className="size-3.5" />
								Back
							</button>
						)}

						<button
							type="button"
							onClick={handleNext}
							className={cn(
								buttonVariants({ size: "sm" }),
								"inline-flex items-center gap-1 font-semibold text-xs h-8 px-3 rounded-lg active:scale-95 transition-all cursor-pointer",
							)}
						>
							{currentStep === steps.length - 1 ? (
								<>
									Finish
									<Check className="size-3.5" />
								</>
							) : (
								<>
									Next
									<ChevronRight className="size-3.5" />
								</>
							)}
						</button>
					</div>
				</div>
			</div>
		</div>
	);
}
