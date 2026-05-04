import type { ExtensionPointId } from "@/lib/plugin-api";
import { usePluginRegistry } from "@/lib/plugins/registry";
import { RemoteComponent } from "./loader";

// ── ExtensionPoint ────────────────────────────────────────────────────────────

export interface ExtensionPointProps {
	/** The extension point identifier. */
	point: ExtensionPointId;
	/**
	 * Props forwarded to every remote component registered at this point.
	 * The remote component is responsible for using only what it recognises.
	 */
	// biome-ignore lint/suspicious/noExplicitAny: forwarded props are plugin-defined
	componentProps?: Record<string, any>;
	/** Custom fallback shown while loading (defaults to null). */
	loadingFallback?: React.ReactNode;
}

/**
 * `<ExtensionPoint>` renders all plugin components registered for the given
 * `point` in the order dictated by the registry (plugin default, then user
 * preference overrides applied by the preference layer).
 *
 * Each component is individually wrapped in an ErrorBoundary so a single
 * failing plugin cannot affect siblings or the host application.
 */
export function ExtensionPoint({
	point,
	componentProps,
	loadingFallback,
}: ExtensionPointProps) {
	const { getRegistrations } = usePluginRegistry();
	const registrations = getRegistrations(point);

	if (registrations.length === 0) return null;

	return (
		<>
			{registrations
				.filter((r) => !r.hidden)
				.map((reg) => (
					<RemoteComponent
						key={`${reg.pluginId}:${reg.component}`}
						registration={reg}
						componentProps={componentProps}
						fallback={loadingFallback ?? undefined}
					/>
				))}
		</>
	);
}

// ── PluginSlot ────────────────────────────────────────────────────────────────

export interface PluginSlotProps {
	/** The extension point identifier. Only the first registration is rendered. */
	point: ExtensionPointId;
	// biome-ignore lint/suspicious/noExplicitAny: forwarded props are plugin-defined
	componentProps?: Record<string, any>;
	loadingFallback?: React.ReactNode;
}

/**
 * `<PluginSlot>` is like `<ExtensionPoint>` but renders only the first
 * (highest-priority) registration. Useful for single named slots where at most
 * one plugin should occupy a position.
 */
export function PluginSlot({
	point,
	componentProps,
	loadingFallback,
}: PluginSlotProps) {
	const { getRegistrations } = usePluginRegistry();
	const [first] = getRegistrations(point).filter((r) => !r.hidden);

	if (!first) return null;

	return (
		<RemoteComponent
			registration={first}
			componentProps={componentProps}
			fallback={loadingFallback ?? undefined}
		/>
	);
}
