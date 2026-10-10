#!/usr/bin/env node
// Fails on non-ASCII text in tracked files. Allowed: accented Latin letters (names such as
// "kċina" or "crème brûlée"), the degree sign and vulgar fraction glyphs. Parsers that must
// accept other typography write it as an escape (\u2013) so the source stays ASCII.
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const BINARY = /\.(png|jpe?g|webp|gif|ico|woff2?|ttf|wasm|lock)$|pnpm-lock\.yaml$/;
const SKIP = new Set(['crates/cookbook-cli/tests/fixtures/legacy-index.html']);

const allowed = (code) =>
	code === 0xb0 ||
	(code >= 0xbc && code <= 0xbe) ||
	(code >= 0x2150 && code <= 0x215e) ||
	(code >= 0xc0 && code <= 0x17f && code !== 0xd7 && code !== 0xf7);

const files = execFileSync('git', ['ls-files', '-z'], { encoding: 'utf8' })
	.split('\0')
	.filter((file) => file && !BINARY.test(file) && !SKIP.has(file));

let problems = 0;
for (const file of files) {
	let text;
	try {
		text = readFileSync(file, 'utf8');
	} catch {
		continue;
	}
	text.split('\n').forEach((line, index) => {
		for (const char of line) {
			const code = char.codePointAt(0);
			if (code > 0x7f && !allowed(code)) {
				const hex = code.toString(16).toUpperCase().padStart(4, '0');
				console.log(`${file}:${index + 1}: U+${hex} "${char}"`);
				problems++;
			}
		}
	});
}

if (problems) {
	console.error(`${problems} non-ASCII characters outside the allowed set`);
	process.exit(1);
}
console.log(`ascii check passed (${files.length} files)`);
