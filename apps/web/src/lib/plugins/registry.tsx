import { useQuery } from "@tanstack/react-query";
import {
	createContext,
	type ReactNode,
	useContext,
	useMemo,
} from "react";
import {
	buildRegistryMap,
	type ExtensionPointId,
	pluginsQueryOptions,
	type PluginRegistration,
} from "@/lib/plugin-api";

// ── Context ───────────────────────────────────────────────────────────────────

interface PluginRegistryContextValue {
	/** Ordered registrations for a given extension point. */
	getRegistrations: (point: ExtensionPointId) => PluginRegistration[];
	isLoading: boolean;
}

const PluginRegistryContext = createContext<PluginRegistryContextValue>({
	getRegistrations: () => [],
	isLoading: false,
});

// ── Provider ──────────────────────────────────────────────────────────────────

export function PluginRegistryProvider({ children }: { children: ReactNode }) {
	const { data: plugins = [], isLoading } = useQuery(pluginsQueryOptions);

	const registryMap = useMemo(() => buildRegistryMap(plugins), [plugins]);

	const value = useMemo<PluginRegistryContextValue>(
		() => ({
			getRegistrations: (point) => registryMap.get(point) ?? [],
			isLoading,
		}),
		[registryMap, isLoading],
	);

	return (
		<PluginRegistryContext.Provider value={value}>
			{children}
		</PluginRegistryContext.Provider>
	);
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export function usePluginRegistry() {
	return useContext(PluginRegistryContext);
}
