#!/usr/bin/env node
// Fails when a documented colour pairing in tokens.css falls below WCAG AA, in light or dark.
import { readFileSync } from 'node:fs';

const css = readFileSync('web/src/lib/styles/tokens.css', 'utf8');

/** The `--colour-*` hex values declared in the first block that starts at `marker`. */
function block(marker) {
	const start = css.indexOf(marker);
	if (start < 0) throw new Error(`tokens.css has no block for ${marker}`);
	const body = css.slice(start, css.indexOf('}', start));
	return Object.fromEntries(
		[...body.matchAll(/--colour-([a-z-]+):\s*(#[0-9a-f]{6})/gi)].map(([, name, hex]) => [name, hex])
	);
}

const luminance = (hex) => {
	const [r, g, b] = [1, 3, 5].map((i) => {
		const c = parseInt(hex.slice(i, i + 2), 16) / 255;
		return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
	});
	return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};

const ratio = (a, b) => {
	const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
	return (hi + 0.05) / (lo + 0.05);
};

// [foreground, background, minimum]: 4.5 for text, 3 for borders and large UI.
const PAIRS = [
	['ink', 'bg', 4.5],
	['ink', 'surface', 4.5],
	['ink', 'tint', 4.5],
	['muted', 'bg', 4.5],
	['muted', 'surface', 4.5],
	['muted', 'tint', 4.5],
	['primary', 'bg', 4.5],
	['primary', 'surface', 4.5],
	['primary', 'tint', 4.5],
	['on-primary', 'primary', 4.5],
	['on-primary', 'accent', 4.5],
	['accent', 'bg', 4.5],
	['accent', 'surface', 4.5],
	['danger', 'surface', 4.5],
	['warning', 'surface', 4.5],
	['success', 'surface', 4.5]
];

const themes = {
	light: block(':root {'),
	dark: block(":root[data-theme='dark']")
};

const darkMedia = block(":root:not([data-theme='light'])");
if (JSON.stringify(darkMedia) !== JSON.stringify(themes.dark)) {
	console.error('The two dark blocks in tokens.css differ; keep them identical.');
	process.exit(1);
}

let failed = 0;
for (const [theme, colours] of Object.entries(themes)) {
	for (const [fg, bg, min] of PAIRS) {
		const value = ratio(colours[fg], colours[bg]);
		if (value < min) {
			failed++;
			console.error(`${theme}: ${fg} on ${bg} is ${value.toFixed(2)}:1, needs ${min}:1`);
		}
	}
}
if (failed) process.exit(1);
console.log(`Contrast: ${PAIRS.length * 2} pairings pass AA in light and dark.`);
