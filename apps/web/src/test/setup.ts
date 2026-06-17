import "@testing-library/jest-dom/vitest";
import { beforeAll, beforeEach, vi } from "vitest";

type StorageLike = {
	getItem: (key: string) => string | null;
	setItem: (key: string, value: string) => void;
	removeItem: (key: string) => void;
	clear: () => void;
};

function createStorageMock(): StorageLike {
	const store = new Map<string, string>();

	return {
		getItem: (key: string) => store.get(key) ?? null,
		setItem: (key: string, value: string) => {
			store.set(key, String(value));
		},
		removeItem: (key: string) => {
			store.delete(key);
		},
		clear: () => {
			store.clear();
		},
	};
}

beforeAll(() => {
	Object.defineProperty(window, "localStorage", {
		configurable: true,
		value: createStorageMock(),
	});

	Object.defineProperty(window, "matchMedia", {
		writable: true,
		configurable: true,
		value: vi.fn().mockImplementation((query) => ({
			matches: false,
			media: query,
			onchange: null,
			addListener: vi.fn(), // deprecated
			removeListener: vi.fn(), // deprecated
			addEventListener: vi.fn(),
			removeEventListener: vi.fn(),
			dispatchEvent: vi.fn(),
		})),
	});
});

beforeEach(() => {
	window.localStorage.clear();
});
