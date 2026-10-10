// Draws the app icon (a cream "S" and a prickly-pear dot on caper green) as an SVG and as PNGs,
// with no dependencies, so the build needs nothing beyond Node. Output goes to static/icons.
import { mkdirSync, writeFileSync } from 'node:fs';
import { deflateSync, crc32 } from 'node:zlib';

const out = new URL('../static/icons/', import.meta.url);
const colours = { ground: [0x45, 0x55, 0x2a], letter: [0xf5, 0xef, 0xe2], dot: [0xa3, 0x25, 0x3f] };
const hex = (rgb) => `#${rgb.map((n) => n.toString(16).padStart(2, '0')).join('')}`;

// Everything is drawn on a 512 grid. The S is two half-turns of radius R joined at the middle.
const R = 62;
const STROKE = 52;
const UPPER = { x: 256, y: 194 };
const LOWER = { x: 256, y: 318 };
const DOT = { x: 372, y: 150, r: 24 };
const rad = (degrees) => (degrees * Math.PI) / 180;
const onCircle = (c, degrees) => ({
	x: c.x + R * Math.cos(rad(degrees)),
	y: c.y + R * Math.sin(rad(degrees))
});

const centreline = [];
for (let a = -25; a >= -270; a -= 2) centreline.push(onCircle(UPPER, a));
for (let a = -90; a <= 155; a += 2) centreline.push(onCircle(LOWER, a));

const start = onCircle(UPPER, -25);
const end = onCircle(LOWER, 155);
const f = (n) => n.toFixed(2);
const path = `M${f(start.x)} ${f(start.y)}A${R} ${R} 0 1 0 256 256A${R} ${R} 0 1 1 ${f(end.x)} ${f(end.y)}`;

function svg(rounded) {
	return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><rect width="512" height="512"${rounded ? ' rx="96"' : ''} fill="${hex(colours.ground)}"/><path d="${path}" fill="none" stroke="${hex(colours.letter)}" stroke-width="${STROKE}" stroke-linecap="round"/><circle cx="${DOT.x}" cy="${DOT.y}" r="${DOT.r}" fill="${hex(colours.dot)}"/></svg>\n`;
}

function distanceToSegment(px, py, a, b) {
	const [dx, dy] = [b.x - a.x, b.y - a.y];
	const t = Math.max(0, Math.min(1, ((px - a.x) * dx + (py - a.y) * dy) / (dx * dx + dy * dy)));
	return Math.hypot(px - (a.x + t * dx), py - (a.y + t * dy));
}

function coverage(px, py) {
	let nearest = Infinity;
	for (let i = 1; i < centreline.length; i++) {
		nearest = Math.min(nearest, distanceToSegment(px, py, centreline[i - 1], centreline[i]));
	}
	return {
		letter: Math.max(0, Math.min(1, STROKE / 2 - nearest + 0.5)),
		dot: Math.max(0, Math.min(1, DOT.r - Math.hypot(px - DOT.x, py - DOT.y) + 0.5))
	};
}

function mix(under, over, amount) {
	return under.map((channel, i) => channel + (over[i] - channel) * amount);
}

function png(size) {
	const scale = 512 / size;
	const rows = Buffer.alloc(size * (size * 3 + 1));
	for (let y = 0; y < size; y++) {
		rows[y * (size * 3 + 1)] = 0;
		for (let x = 0; x < size; x++) {
			const cover = coverage((x + 0.5) * scale, (y + 0.5) * scale);
			let rgb = mix(colours.ground, colours.letter, cover.letter);
			rgb = mix(rgb, colours.dot, cover.dot);
			rgb.forEach((channel, i) => {
				rows[y * (size * 3 + 1) + 1 + x * 3 + i] = Math.round(channel);
			});
		}
	}
	const chunk = (type, data) => {
		const body = Buffer.concat([Buffer.from(type), data]);
		const length = Buffer.alloc(4);
		length.writeUInt32BE(data.length);
		const check = Buffer.alloc(4);
		check.writeUInt32BE(crc32(body));
		return Buffer.concat([length, body, check]);
	};
	const header = Buffer.alloc(13);
	header.writeUInt32BE(size, 0);
	header.writeUInt32BE(size, 4);
	header.set([8, 2, 0, 0, 0], 8);
	return Buffer.concat([
		Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
		chunk('IHDR', header),
		chunk('IDAT', deflateSync(rows, { level: 9 })),
		chunk('IEND', Buffer.alloc(0))
	]);
}

mkdirSync(out, { recursive: true });
writeFileSync(new URL('icon.svg', out), svg(true));
for (const [name, size] of [
	['icon-192.png', 192],
	['icon-512.png', 512],
	['apple-touch-icon.png', 180]
]) {
	writeFileSync(new URL(name, out), png(size));
}
