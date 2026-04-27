import { BlockNoteEditor } from "@blocknote/core";
import { JSDOM } from "jsdom";

// Initialize JSDOM to provide a browser-like environment for BlockNote
const dom = new JSDOM("");
const { window } = dom;

const globals = {
	window,
	document: window.document,
	navigator: window.navigator,
	HTMLElement: window.HTMLElement,
	Node: window.Node,
};

for (const [key, value] of Object.entries(globals)) {
	Object.defineProperty(global, key, {
		value,
		writable: true,
		configurable: true,
	});
}

let editor: BlockNoteEditor | null = null;

function getEditor(): BlockNoteEditor {
	if (!editor) {
		editor = BlockNoteEditor.create();
	}
	return editor;
}

/**
 * Converts BlockNote JSON blocks to Markdown string.
 * @param blocks - Array of BlockNote block objects
 * @returns Markdown string representation
 */
export function blocknoteToMarkdown(blocks: any[] | null): string {
	if (!blocks || blocks.length === 0) return "";
	const e = getEditor();
	const markdown = (e as any)._exportManager.blocksToMarkdownLossy(blocks);
	return `\`\`\`markdown\n${markdown}\n\`\`\``;
}

/**
 * Converts Markdown string to BlockNote JSON blocks.
 * @param markdown - Markdown string
 * @returns Array of BlockNote block objects
 */
export function markdownToBlocknote(markdown: string): any[] {
	if (!markdown || markdown.trim() === "") return [];
	const e = getEditor();
	return (e as any)._exportManager.tryParseMarkdownToBlocks(markdown);
}
