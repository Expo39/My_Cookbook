/** Text fitting for the share card. Pure, and mirrored by `crates/cookbook-cli/src/cards/text.rs`. */

export type Face = 'display' | 'body' | 'bodyBold' | 'num';

/** The width of `text` in pixels when set in `face` at `size`. */
export type Measure = (face: Face, size: number, text: string) => number;

/** Greedy word wrap; a word wider than the line gets a line of its own. */
export function wrap(measure: Measure, face: Face, size: number, text: string, max: number) {
	const lines: string[] = [];
	let current = '';
	for (const word of text.split(/\s+/).filter(Boolean)) {
		if (!current) {
			current = word;
			continue;
		}
		const candidate = `${current} ${word}`;
		if (measure(face, size, candidate) <= max) current = candidate;
		else {
			lines.push(current);
			current = word;
		}
	}
	if (current) lines.push(current);
	return lines;
}

/** Shortens `text` with an ellipsis until it fits `max`. */
export function ellipsize(measure: Measure, face: Face, size: number, text: string, max: number) {
	if (measure(face, size, text) <= max) return text;
	const kept = [...text];
	while (kept.pop() !== undefined) {
		const candidate = `${kept.join('').trimEnd()}…`;
		if (measure(face, size, candidate) <= max) return candidate;
	}
	return '…';
}

/** The first of `sizes` at which `text` fits in `maxLines`; the last size with an ellipsis when none does. */
export function fitLines(
	measure: Measure,
	face: Face,
	sizes: number[],
	text: string,
	max: number,
	maxLines: number
): { size: number; lines: string[] } {
	for (const size of sizes) {
		const lines = wrap(measure, face, size, text, max);
		if (lines.length <= maxLines && lines.every((line) => measure(face, size, line) <= max)) {
			return { size, lines };
		}
	}
	const size = sizes[sizes.length - 1];
	let lines = wrap(measure, face, size, text, max);
	if (lines.length > maxLines) {
		lines = [...lines.slice(0, maxLines - 1), lines.slice(maxLines - 1).join(' ')];
	}
	return { size, lines: lines.map((line) => ellipsize(measure, face, size, line, max)) };
}

/** How many ingredient lines to show, and how many are left out. One line is spent on "+ n more". */
export function ingredientWindow(total: number, fit: number, cap: number) {
	const capacity = Math.min(fit, cap);
	if (total <= capacity) return { shown: total, more: 0 };
	if (capacity <= 1) return { shown: 0, more: total };
	return { shown: capacity - 1, more: total - (capacity - 1) };
}
