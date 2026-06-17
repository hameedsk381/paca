import type { QueryClient } from "@tanstack/react-query";
import { createRootRouteWithContext, Outlet, useRouterState } from "@tanstack/react-router";
import { TanStackRouterDevtools } from "@tanstack/react-router-devtools";
import { ErrorPage } from "@/components/shared/error-page";
import { NotFoundPage } from "@/components/shared/not-found-page";
import { Toaster } from "@/components/ui/sonner";

const RootComponent = () => {
	const isPending = useRouterState({ select: (s) => s.status === "pending" });
	return (
		<>
			{isPending && (
				<div className="fixed top-0 left-0 right-0 h-[3px] z-[9999] bg-primary/20 overflow-hidden">
					<div
						className="h-full bg-primary animate-pulse w-full origin-left"
						style={{
							animation: "shimmer 1.5s infinite linear",
							backgroundImage:
								"linear-gradient(to right, transparent 0%, var(--color-primary) 50%, transparent 100%)",
							backgroundSize: "200% 100%",
						}}
					/>
				</div>
			)}
			<Outlet />
			<Toaster />
			{import.meta.env.DEV && <TanStackRouterDevtools />}
		</>
	);
};

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()(
	{
		component: RootComponent,
		errorComponent: ({ error, reset }) => (
			<ErrorPage error={error} reset={reset} />
		),
		notFoundComponent: () => <NotFoundPage />,
	},
);
