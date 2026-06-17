import { useEffect, useState } from "react";

export type AccentColor = "lime" | "blue" | "purple" | "orange";

const ACCENT_STORAGE_KEY = "paca-accent";
const COMPACT_STORAGE_KEY = "paca-compact";
const PERSONALIZATION_EVENT = "paca-personalization-change";

export function usePersonalization() {
	const [accent, setAccent] = useState<AccentColor>(() => {
		if (typeof window === "undefined") return "lime";
		const stored = window.localStorage.getItem(ACCENT_STORAGE_KEY);
		return stored === "lime" ||
			stored === "blue" ||
			stored === "purple" ||
			stored === "orange"
			? stored
			: "lime";
	});

	const [compact, setCompact] = useState<boolean>(() => {
		if (typeof window === "undefined") return false;
		return window.localStorage.getItem(COMPACT_STORAGE_KEY) === "true";
	});

	useEffect(() => {
		document.documentElement.setAttribute("data-accent", accent);
		if (compact) {
			document.documentElement.setAttribute("data-compact", "true");
		} else {
			document.documentElement.removeAttribute("data-compact");
		}
	}, [accent, compact]);

	const updateAccent = (newAccent: AccentColor) => {
		setAccent(newAccent);
		window.localStorage.setItem(ACCENT_STORAGE_KEY, newAccent);
		window.dispatchEvent(new CustomEvent(PERSONALIZATION_EVENT));
	};

	const updateCompact = (newCompact: boolean) => {
		setCompact(newCompact);
		window.localStorage.setItem(COMPACT_STORAGE_KEY, String(newCompact));
		window.dispatchEvent(new CustomEvent(PERSONALIZATION_EVENT));
	};

	useEffect(() => {
		const handleEvent = () => {
			const storedAccent = window.localStorage.getItem(
				ACCENT_STORAGE_KEY,
			) as AccentColor;
			if (
				storedAccent === "lime" ||
				storedAccent === "blue" ||
				storedAccent === "purple" ||
				storedAccent === "orange"
			) {
				setAccent(storedAccent);
			}
			setCompact(window.localStorage.getItem(COMPACT_STORAGE_KEY) === "true");
		};
		window.addEventListener(PERSONALIZATION_EVENT, handleEvent);
		return () => window.removeEventListener(PERSONALIZATION_EVENT, handleEvent);
	}, []);

	return {
		accent,
		compact,
		setAccent: updateAccent,
		setCompact: updateCompact,
	};
}
