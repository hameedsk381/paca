import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Download, ExternalLink, Package, Search, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
	installMarketplacePlugin,
	type MarketplacePlugin,
	marketplacePluginsQueryOptions,
	pluginsQueryOptions,
	uninstallPlugin,
} from "@/lib/plugin-api";

function initials(name: string): string {
	const words = name
		.trim()
		.split(/\s+/)
		.filter(Boolean)
		.slice(0, 2)
		.map((v) => v[0]?.toUpperCase() ?? "");
	return words.join("") || "PL";
}

function matchesQuery(plugin: MarketplacePlugin, query: string): boolean {
	if (!query) return true;
	const q = query.toLowerCase();
	return (
		plugin.name.toLowerCase().includes(q) ||
		plugin.display_name.toLowerCase().includes(q) ||
		plugin.description.toLowerCase().includes(q)
	);
}

function PluginCard({
	plugin,
	isInstalled,
	isInstalling,
	isUninstalling,
	onInstall,
	onUninstall,
}: {
	plugin: MarketplacePlugin;
	isInstalled: boolean;
	isInstalling: boolean;
	isUninstalling: boolean;
	onInstall: (name: string) => void;
	onUninstall: (name: string) => void;
}) {
	return (
		<div className="rounded-lg border border-border/60 bg-card p-4 space-y-3">
			<div className="flex items-start gap-3">
				<Avatar size="lg">
					<AvatarImage src={plugin.avatar_url} alt={plugin.display_name} />
					<AvatarFallback>{initials(plugin.display_name)}</AvatarFallback>
				</Avatar>
				<div className="min-w-0 flex-1">
					<div className="flex items-center gap-2 flex-wrap">
						<p className="font-medium text-sm truncate">
							{plugin.display_name}
						</p>
						<Badge variant="outline" className="text-[11px]">
							{plugin.version}
						</Badge>
						{isInstalled ? (
							<Badge className="text-[11px]">Installed</Badge>
						) : null}
					</div>
					<p className="text-xs text-muted-foreground truncate">
						{plugin.name}
					</p>
				</div>
			</div>

			<div className="rounded-md bg-muted/40 px-3 py-2">
				<p className="text-xs whitespace-pre-wrap leading-5">
					{plugin.description}
				</p>
			</div>

			<div className="flex items-center justify-between gap-2">
				<div className="text-[11px] text-muted-foreground flex items-center gap-1 truncate">
					<Package className="size-3.5" />
					<span className="truncate">
						Backend / Frontend / Migrations / Manifest
					</span>
				</div>
				<div className="flex items-center gap-2">
					{plugin.repository_url ? (
						<a
							href={plugin.repository_url}
							target="_blank"
							rel="noreferrer"
							className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
						>
							<ExternalLink className="size-3.5" />
							Source
						</a>
					) : null}
					{isInstalled ? (
						<Button
							size="sm"
							variant="destructive"
							disabled={isUninstalling}
							onClick={() => onUninstall(plugin.name)}
						>
							<Trash2 className="size-4" />
							{isUninstalling ? "Uninstalling..." : "Uninstall"}
						</Button>
					) : (
						<Button
							size="sm"
							disabled={isInstalling}
							onClick={() => onInstall(plugin.name)}
						>
							<Download className="size-4" />
							{isInstalling ? "Installing..." : "Install"}
						</Button>
					)}
				</div>
			</div>
		</div>
	);
}

export function PluginMarketplacePanel() {
	const qc = useQueryClient();
	const [query, setQuery] = useState("");

	const { data: marketplace = [], isLoading } = useQuery(
		marketplacePluginsQueryOptions,
	);
	const { data: installed = [] } = useQuery(pluginsQueryOptions);

	const installedByName = useMemo(() => {
		return new Map(installed.map((p) => [p.name, p]));
	}, [installed]);

	const filtered = useMemo(() => {
		return marketplace.filter((plugin) => matchesQuery(plugin, query));
	}, [marketplace, query]);

	const installMutation = useMutation({
		mutationFn: installMarketplacePlugin,
		onSuccess: async () => {
			await Promise.all([
				qc.invalidateQueries({ queryKey: ["plugins"] }),
				qc.invalidateQueries({ queryKey: ["plugins", "marketplace"] }),
			]);
		},
	});

	const uninstallMutation = useMutation({
		mutationFn: uninstallPlugin,
		onSuccess: async () => {
			await Promise.all([
				qc.invalidateQueries({ queryKey: ["plugins"] }),
				qc.invalidateQueries({ queryKey: ["plugins", "marketplace"] }),
			]);
		},
	});

	if (isLoading) {
		return (
			<div className="text-sm text-muted-foreground py-6">
				Loading marketplace...
			</div>
		);
	}

	return (
		<div className="space-y-4">
			<div className="relative">
				<Search className="size-4 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2" />
				<Input
					value={query}
					onChange={(e) => setQuery(e.target.value)}
					placeholder="Search plugins"
					className="pl-9"
				/>
			</div>

			{filtered.length === 0 ? (
				<div className="text-sm text-muted-foreground py-6">
					No marketplace plugins found.
				</div>
			) : (
				<div className="grid grid-cols-1 gap-3">
					{filtered.map((plugin) => (
						<PluginCard
							key={plugin.name}
							plugin={plugin}
							isInstalled={installedByName.has(plugin.name)}
							isInstalling={
								installMutation.isPending &&
								installMutation.variables?.name === plugin.name
							}
							isUninstalling={
								uninstallMutation.isPending &&
								uninstallMutation.variables ===
									installedByName.get(plugin.name)?.id
							}
							onInstall={(name) =>
								installMutation.mutate({ name, enabled: true })
							}
							onUninstall={(name) => {
								const pluginId = installedByName.get(name)?.id;
								if (!pluginId) return;
								uninstallMutation.mutate(pluginId);
							}}
						/>
					))}
				</div>
			)}
		</div>
	);
}
