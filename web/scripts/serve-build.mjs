// Serves a prebuilt directory under BASE_PATH, mirroring GitHub Pages.
import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize, resolve } from 'node:path';

const root = resolve(process.env.BUILD_DIR ?? 'build');
const base = process.env.BASE_PATH ?? '';
const port = Number(process.env.PORT ?? 4173);
const types = {
	'.html': 'text/html; charset=utf-8',
	'.js': 'text/javascript',
	'.css': 'text/css',
	'.json': 'application/json',
	'.svg': 'image/svg+xml',
	'.wasm': 'application/wasm',
	'.png': 'image/png',
	'.ico': 'image/x-icon'
};

createServer((req, res) => {
	const path = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
	if (!path.startsWith(`${base}/`) && path !== base) {
		res.writeHead(404).end();
		return;
	}
	let file = join(root, normalize(path.slice(base.length)));
	if (!file.startsWith(root)) {
		res.writeHead(403).end();
		return;
	}
	if (existsSync(file) && statSync(file).isDirectory()) file = join(file, 'index.html');
	else if (!existsSync(file) && existsSync(`${file}.html`)) file = `${file}.html`;
	if (!existsSync(file)) {
		res.writeHead(404).end();
		return;
	}
	res.writeHead(200, { 'content-type': types[extname(file)] ?? 'application/octet-stream' });
	createReadStream(file).pipe(res);
}).listen(port, '0.0.0.0');
