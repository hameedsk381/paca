import { queryOptions } from "@tanstack/react-query";
import { apiClient } from "./api-client";
import type { SuccessEnvelope } from "./api-error";

// ── Shapes ────────────────────────────────────────────────────────────────────

export interface PluginRoute {
	method: string;
	path: string;
}

export interface BackendManifest {
	routes?: PluginRoute[];
	eventSubscriptions?: string[];
}

export interface ExtensionPointRegistration {
	point: string;
	component: string;
	label?: string;
	order?: number;
}

export interface FrontendManifest {
	remoteEntryUrl?: string;
	extensionPoints?: ExtensionPointRegistration[];
}

export interface PluginManifest {
	id: string;
	displayName: string;
	description?: string;
	version: string;
	backend?: BackendManifest;
	frontend?: FrontendManifest;
	permissions?: string[];
}

export interface Plugin {
	id: string;
	name: string;
	version: string;
	manifest: PluginManifest;
	extension_settings?: PluginExtensionSetting[];
	enabled: boolean;
	installed_at: string;
	updated_at: string;
}

export interface PluginExtensionSetting {
	id: string;
	plugin_id: string;
	extension_point: string;
	settings: {
		hidden: boolean;
		order?: number;
	};
	updated_at: string;
}

// ── API ───────────────────────────────────────────────────────────────────────

export async function listPlugins(): Promise<Plugin[]> {
	const { data } =
		await apiClient.instance.get<SuccessEnvelope<{ plugins: Plugin[] }>>(
			"/plugins",
		);
	return data.data.plugins;
}

export interface MarketplacePluginArtifacts {
	backend_tar_gz_url: string;
	frontend_tar_gz_url: string;
	migrations_tar_gz_url: string;
	manifest_tar_gz_url: string;
}

export interface MarketplacePlugin {
	name: string;
	display_name: string;
	description: string;
	version: string;
	avatar_url?: string;
	repository_url?: string;
	artifacts: MarketplacePluginArtifacts;
}

export async function listMarketplacePlugins(): Promise<MarketplacePlugin[]> {
	const { data } = await apiClient.instance.get<
		SuccessEnvelope<{ plugins: MarketplacePlugin[] }>
	>("/admin/plugins/marketplace");
	return data.data.plugins;
}

export async function installMarketplacePlugin(payload: {
	name: string;
	enabled?: boolean;
}): Promise<Plugin> {
	const { data } = await apiClient.instance.post<SuccessEnvelope<Plugin>>(
		"/admin/plugins/marketplace/install",
		payload,
	);
	return data.data;
}

export async function uninstallPlugin(pluginId: string): Promise<void> {
	await apiClient.instance.delete(`/admin/plugins/${pluginId}`);
}

export async function updatePluginExtensionSetting(payload: {
	plugin_id: string;
	extension_point: string;
	settings: { hidden: boolean; order?: number };
}): Promise<PluginExtensionSetting> {
	const { data } = await apiClient.instance.patch<
		SuccessEnvelope<PluginExtensionSetting>
	>("/admin/plugin-extension-settings", payload);
	return data.data;
}

// ── Query options ─────────────────────────────────────────────────────────────

export const pluginsQueryOptions = queryOptions({
	queryKey: ["plugins"],
	queryFn: listPlugins,
	staleTime: 5 * 60 * 1000, // 5 min — plugins don't change often
});

export const marketplacePluginsQueryOptions = queryOptions({
	queryKey: ["plugins", "marketplace"],
	queryFn: listMarketplacePlugins,
	staleTime: 60 * 1000,
	retry: false,
});

// ── Registry helpers ──────────────────────────────────────────────────────────

export type ExtensionPointId =
	| "sidebar.general.section"
	| "sidebar.project.section"
	| "task.detail.section"
	| "project.settings.tab"
	| "view";

export interface PluginRegistration {
	pluginUUID: string; // The database UUID for API calls
	pluginId: string; // The reverse-DNS identifier (e.g., "com.paca.checklist")
	pluginName: string;
	/** Per-registration display label from the manifest; falls back to component name. */
	label: string;
	remoteEntryUrl: string;
	component: string;
	order: number;
	hidden?: boolean;
}

/** Build a Map<ExtensionPointId, PluginRegistration[]> from the plugins list. */
export function buildRegistryMap(
	plugins: Plugin[],
): Map<ExtensionPointId, PluginRegistration[]> {
	const map = new Map<ExtensionPointId, PluginRegistration[]>();

	for (const plugin of plugins) {
		if (!plugin.enabled) continue;
		const ext = plugin.manifest.frontend?.extensionPoints;
		const remoteEntryUrl = plugin.manifest.frontend?.remoteEntryUrl;
		if (!ext || !remoteEntryUrl) continue;
		const settingsByPoint = new Map(
			(plugin.extension_settings ?? []).map((s) => [s.extension_point, s]),
		);

		for (const reg of ext) {
			const point = reg.point as ExtensionPointId;
			const setting = settingsByPoint.get(reg.point);
			const settingOrder = setting?.settings.order;
			const order =
				typeof settingOrder === "number" && settingOrder > 0
					? settingOrder
					: (reg.order ?? 0);
			const regs = map.get(point) ?? [];
			regs.push({
				pluginUUID: plugin.id, // UUID for API calls
				pluginId: plugin.manifest.id, // reverse-DNS for display/keys
				pluginName: plugin.manifest.displayName,
				label: reg.label ?? reg.component,
				remoteEntryUrl,
				component: reg.component,
				order,
				hidden: setting?.settings.hidden ?? false,
			});
			map.set(point, regs);
		}
	}

	// Sort each point's registrations by order
	for (const [, regs] of map) {
		regs.sort((a, b) => a.order - b.order);
	}

	return map;
}
