import { AlertOctagon, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

interface ErrorPageProps {
	error: Error;
	reset: () => void;
}

export function ErrorPage({ error, reset }: ErrorPageProps) {
	return (
		<div className="flex min-h-screen flex-col items-center justify-center bg-background p-6">
			<div className="relative overflow-hidden rounded-2xl border border-destructive/20 bg-card p-8 shadow-xl max-w-lg w-full text-center">
				<div
					className="pointer-events-none absolute inset-0 opacity-10"
					style={{
						backgroundImage:
							"radial-gradient(circle, color-mix(in oklch, var(--color-destructive) 15%, transparent) 1px, transparent 1px)",
						backgroundSize: "16px 16px",
					}}
				/>
				<div className="relative flex flex-col items-center">
					<div className="flex size-14 items-center justify-center rounded-2xl bg-destructive/10 text-destructive mb-6">
						<AlertOctagon className="size-8" />
					</div>
					<h1 className="font-[Syne] text-2xl font-bold tracking-tight text-foreground mb-2">
						Something went wrong
					</h1>
					<p className="text-sm text-muted-foreground mb-6 max-w-sm">
						An unexpected error occurred. We have logged this error and are looking into it.
					</p>

					<div className="w-full text-left bg-muted/50 rounded-xl border border-border p-4 mb-6 overflow-hidden">
						<p className="font-mono text-xs font-semibold text-destructive break-all">
							{error.name}: {error.message}
						</p>
						{error.stack && (
							<details className="mt-2">
								<summary className="cursor-pointer text-[10px] uppercase tracking-wider text-muted-foreground hover:text-foreground font-semibold">
									Show stack trace
								</summary>
								<pre className="mt-2 max-h-40 overflow-y-auto font-mono text-[10px] text-muted-foreground/85 whitespace-pre-wrap leading-normal border-t border-border/55 pt-2">
									{error.stack}
								</pre>
							</details>
						)}
					</div>

					<div className="flex items-center gap-3 w-full sm:w-auto">
						<Button
							onClick={reset}
							className="w-full sm:w-auto gap-2 shadow-md shadow-primary/10"
						>
							<RefreshCw className="size-4" />
							Try Again
						</Button>
						<Button
							variant="outline"
							onClick={() => (window.location.href = "/")}
							className="w-full sm:w-auto"
						>
							Go Home
						</Button>
					</div>
				</div>
			</div>
		</div>
	);
}
