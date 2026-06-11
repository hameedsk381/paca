interface InlineContent {
	type?: string;
	text?: string;
}

interface Block {
	type?: string;
	content?: InlineContent[] | null;
	children?: Block[] | null;
}

export function blockNoteToLines(blocks: unknown): string[] {
	if (!Array.isArray(blocks)) return [];
	const lines: string[] = [];
	for (const block of blocks as Block[]) {
		let text = "";
		if (Array.isArray(block.content)) {
			for (const inline of block.content) {
				if (inline.type === "text" && inline.text) {
					text += inline.text;
				}
			}
		}
		lines.push(text);
		if (Array.isArray(block.children) && block.children.length > 0) {
			lines.push(...blockNoteToLines(block.children));
		}
	}
	return lines;
}

export type DiffLineType = "added" | "removed" | "unchanged";

export interface DiffLine {
	type: DiffLineType;
	text: string;
}

export function computeLineDiff(
	oldLines: string[],
	newLines: string[],
): DiffLine[] {
	const n = oldLines.length;
	const m = newLines.length;

	const dp: number[][] = Array.from({ length: n + 1 }, () =>
		new Array(m + 1).fill(0),
	);
	for (let i = 1; i <= n; i++) {
		for (let j = 1; j <= m; j++) {
			if (oldLines[i - 1] === newLines[j - 1]) {
				dp[i][j] = dp[i - 1][j - 1] + 1;
			} else {
				dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
			}
		}
	}

	const result: DiffLine[] = [];
	let i = n;
	let j = m;
	while (i > 0 || j > 0) {
		if (i > 0 && j > 0 && oldLines[i - 1] === newLines[j - 1]) {
			result.push({ type: "unchanged", text: oldLines[i - 1] });
			i--;
			j--;
		} else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
			result.push({ type: "added", text: newLines[j - 1] });
			j--;
		} else {
			result.push({ type: "removed", text: oldLines[i - 1] });
			i--;
		}
	}
	result.reverse();
	return result;
}

export function diffBlockNoteContent(
	oldContent: unknown,
	newContent: unknown,
): DiffLine[] {
	return computeLineDiff(
		blockNoteToLines(oldContent),
		blockNoteToLines(newContent),
	);
}
