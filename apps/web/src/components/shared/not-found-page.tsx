import { FileQuestion, Home } from "lucide-react";
import { Button } from "@/components/ui/button";

export function NotFoundPage() {
	return (
		<div className="flex min-h-screen flex-col items-center justify-center bg-background p-6">
			<div className="relative overflow-hidden rounded-2xl border border-border bg-card p-8 shadow-xl max-w-md w-full text-center">
				<div
					className="pointer-events-none absolute inset-0 opacity-10"
					style={{
						backgroundImage:
							"radial-gradient(circle, color-mix(in oklch, var(--color-primary) 12%, transparent) 1px, transparent 1px)",
						backgroundSize: "16px 16px",
					}}
				/>
				<div className="relative flex flex-col items-center">
					<div className="flex size-14 items-center justify-center rounded-2xl bg-primary/10 text-primary mb-6">
						<FileQuestion className="size-8" />
					</div>
					<h1 className="font-[Syne] text-3xl font-extrabold tracking-tight text-foreground mb-2">
						404
					</h1>
					<h2 className="text-lg font-semibold text-foreground mb-2">
						Page Not Found
					</h2>
					<p className="text-sm text-muted-foreground mb-6 max-w-xs">
						The page you are looking for doesn't exist or has been moved to another location.
					</p>

					<Button
						onClick={() => (window.location.href = "/")}
						className="gap-2 shadow-md shadow-primary/10"
					>
						<Home className="size-4" />
						Go back home
					</Button>
				</div>
			</div>
		</div>
	);
}
