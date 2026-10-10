import type { QrMatrix } from './layout';

/** SVG path data for the dark modules, one rectangle per horizontal run, as the build-time renderer writes it. */
export function qrPath(qr: QrMatrix, module = 1): string {
	let path = '';
	for (let row = 0; row < qr.size; row++) {
		let column = 0;
		while (column < qr.size) {
			if (!qr.dark[row * qr.size + column]) {
				column++;
				continue;
			}
			const start = column;
			while (column < qr.size && qr.dark[row * qr.size + column]) column++;
			const run = (column - start) * module;
			path += `M${start * module} ${row * module}h${run}v${module}h-${run}z`;
		}
	}
	return path;
}
