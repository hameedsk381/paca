import { createFileRoute, redirect } from "@tanstack/react-router";
import { Puzzle } from "lucide-react";

import { PluginPreferencesPanel } from "@/components/plugins/PluginPreferencesPanel";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { myPermissionsQueryOptions } from "@/lib/admin-api";
import { hasPermission } from "@/lib/permissions";

export const Route = createFileRoute("/_authenticated/admin/plugins/")({
	beforeLoad: async ({ context: { queryClient } }) => {
		const permissions = await queryClient
			.fetchQuery(myPermissionsQueryOptions)
			.catch(() => [] as string[]);

		if (!hasPermission(permissions, "users.write")) {
			throw redirect({ to: "/home" });
		}
	},
	component: PluginSettingsPage,
});

function PluginSettingsPage() {
	return (
		<div className="flex flex-col gap-6 p-6 max-w-3xl">
			{/* Page header */}
			<div>
				<div className="flex items-center gap-2">
					<Puzzle className="size-5 text-primary" />
					<h1 className="text-xl font-semibold">Plugin Settings</h1>
				</div>
				<p className="mt-1 text-sm text-muted-foreground">
					Manage system-wide plugin panel ordering and visibility for all users.
				</p>
			</div>

			<Separator />

			<Card>
				<CardHeader>
					<CardTitle className="text-base">Extension Point Layout</CardTitle>
					<CardDescription>
						Drag to reorder plugin panels within each extension point. Toggle
						visibility to show or hide panels for all users.
					</CardDescription>
				</CardHeader>
				<CardContent>
					<PluginPreferencesPanel />
				</CardContent>
			</Card>
		</div>
	);
}
