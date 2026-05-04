import { AlertCircle } from "lucide-react";
import { Component, lazy, type ComponentType, type ReactNode, Suspense } from "react";
import type { PluginRegistration } from "@/lib/plugin-api";

// ── Module Federation dynamic import ─────────────────────────────────────────

/**
 * Cache of lazy-loaded remote components keyed by `remoteEntryUrl#component`.
 * We memo-ize so each unique (url, component) pair is only loaded once per
 * browser session regardless of how many extension points use it.
 */
const componentCache = new Map<string, ReturnType<typeof lazy>>();

function getRemoteComponent(remoteEntryUrl: string, component: string) {
	const cacheKey = `${remoteEntryUrl}#${component}`;
	if (!componentCache.has(cacheKey)) {
		componentCache.set(
			cacheKey,
			lazy(async () => {
				// Dynamically import the remote entry script, then access the
				// named export.  Module Federation remotes expose an object with
				// an `init` function and a `get` function; we use the standard
				// dynamic import() which Vite's federation plugin intercepts at
				// build time for declared remotes.  For runtime-declared remotes
				// (our case) we use the low-level __federation_method_getRemote
				// approach via a script tag + globalThis container.
				const container = await loadRemoteContainer(remoteEntryUrl);
				await container.init(__webpack_share_scopes__?.default ?? {});
				const factory = await container.get(`./${component}`);
				const mod = factory() as { default: ComponentType<unknown> };
				return mod;
			}),
		);
	}
	return componentCache.get(cacheKey)!;
}

// ── Remote container loader ───────────────────────────────────────────────────

interface RemoteContainer {
	init(shareScope: Record<string, unknown>): Promise<void>;
	get(module: string): Promise<() => Record<string, unknown>>;
}

const containerCache = new Map<string, Promise<RemoteContainer>>();

function loadRemoteContainer(remoteEntryUrl: string): Promise<RemoteContainer> {
	if (!containerCache.has(remoteEntryUrl)) {
		containerCache.set(
			remoteEntryUrl,
			new Promise((resolve, reject) => {
				const script = document.createElement("script");
				script.src = remoteEntryUrl;
				script.type = "text/javascript";
				script.async = true;
				script.onload = () => {
					// The remote entry registers itself on globalThis using a unique
					// scope name derived from the URL (same convention used by
					// @originjs/vite-plugin-federation for dynamic remotes).
					const scopeName = remoteEntryUrl
						.split("/")
						.pop()
						?.replace(/\.js$/, "")
						?.replace(/[^a-zA-Z0-9_]/g, "_");
					const container = (
						globalThis as unknown as Record<string, RemoteContainer>
					)[scopeName ?? ""];
					if (container) {
						resolve(container);
					} else {
						reject(
							new Error(
								`Remote container "${scopeName}" not found on globalThis after loading ${remoteEntryUrl}`,
							),
						);
					}
				};
				script.onerror = () =>
					reject(new Error(`Failed to load remote entry: ${remoteEntryUrl}`));
				document.head.appendChild(script);
			}),
		);
	}
	return containerCache.get(remoteEntryUrl)!;
}

// globalThis share scope injected by Vite's federation plugin at build time.
declare const __webpack_share_scopes__: { default: Record<string, unknown> } | undefined;

// ── Error boundary ────────────────────────────────────────────────────────────

interface ErrorBoundaryState {
	hasError: boolean;
	message: string;
}

interface ErrorBoundaryProps {
	pluginName: string;
	children: ReactNode;
	fallback?: ReactNode;
}

class PluginErrorBoundary extends Component<
	ErrorBoundaryProps,
	ErrorBoundaryState
> {
	constructor(props: ErrorBoundaryProps) {
		super(props);
		this.state = { hasError: false, message: "" };
	}

	static getDerivedStateFromError(error: unknown): ErrorBoundaryState {
		return {
			hasError: true,
			message: error instanceof Error ? error.message : String(error),
		};
	}

	render() {
		if (this.state.hasError) {
			return (
				this.props.fallback ?? (
					<div className="flex items-center gap-2 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">
						<AlertCircle className="size-3.5 shrink-0" />
						<span>
							Plugin <strong>{this.props.pluginName}</strong> failed to load
						</span>
					</div>
				)
			);
		}
		return this.props.children;
	}
}

// ── Public component ──────────────────────────────────────────────────────────

export interface RemoteComponentProps {
	registration: PluginRegistration;
	/** Props forwarded to the remote component */
	// biome-ignore lint/suspicious/noExplicitAny: remote component props are untyped
	componentProps?: Record<string, any>;
	fallback?: ReactNode;
}

/**
 * Loads and renders a single remote (plugin) component via Module Federation.
 * Each remote component is individually wrapped in a Suspense + ErrorBoundary
 * so a failing plugin cannot break the host application.
 */
export function RemoteComponent({
	registration,
	componentProps,
	fallback,
}: RemoteComponentProps) {
	const LazyComponent = getRemoteComponent(
		registration.remoteEntryUrl,
		registration.component,
	);

	return (
		<PluginErrorBoundary
			pluginName={registration.pluginName}
			fallback={fallback}
		>
			<Suspense fallback={null}>
				<LazyComponent {...(componentProps ?? {})} />
			</Suspense>
		</PluginErrorBoundary>
	);
}
