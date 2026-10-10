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
	'.ico': 'image/x-icon',
	'.woff2': 'font/woff2',
	'.webmanifest': 'application/manifest+json'
};

createServer((req, res) => {
	const path = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
	if (!path.startsWith(`${base}/`) && path !== base) {
		res.writeHead(404).end();
		return;
	}
	const target = join(root, normalize(path.slice(base.length)));
	if (!target.startsWith(root)) {
		res.writeHead(403).end();
		return;
	}
	// Like GitHub Pages: a file, then page.html for /page, then a folder's index.html, then 404.html.
	const candidates = [target, `${target}.html`, join(target, 'index.html')];
	const found = candidates.find(
		(candidate) => existsSync(candidate) && statSync(candidate).isFile()
	);
	const file = found ?? join(root, '404.html');
	if (!existsSync(file)) {
		res.writeHead(404).end();
		return;
	}
	res.writeHead(found ? 200 : 404, {
		'content-type': types[extname(file)] ?? 'application/octet-stream'
	});
	createReadStream(file).pipe(res);
}).listen(port, '0.0.0.0');
