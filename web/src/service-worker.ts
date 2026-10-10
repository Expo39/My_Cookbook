/// <reference types="@sveltejs/kit" />
/// <reference no-default-lib="true"/>
/// <reference lib="esnext" />
/// <reference lib="webworker" />

import { base, build, files, version } from '$service-worker';

const sw = self as unknown as ServiceWorkerGlobalScope;

const SHELL = `shell-${version}`;
const PAGES = 'pages-v1';
const DATA = 'data-v1';

// The recipe JSON is large and changes with the content, so it is cached as it is used, not up front.
// admin.json must always be fetched fresh, or a new password would not unlock until the cache turned over.
const assets = [
	...build,
	// Hidden files such as .gitkeep never reach the deployed artifact, and one missing file fails the install.
	...files.filter(
		(file) =>
			!/\/(data|cards)\//.test(file) && !file.endsWith('/admin.json') && !/\/\.[^/]*$/.test(file)
	)
];
const shellPages = ['/', '/offline', '/favourites', '/shopping-list', '/search'].map(
	(path) => `${base}${path}`
);

const isImmutable = (path: string) => path.startsWith(`${base}/_app/immutable/`);
const isData = (path: string) => path.startsWith(`${base}/data/`) && path.endsWith('.json');

sw.addEventListener('install', (event) => {
	event.waitUntil(
		(async () => {
			const cache = await caches.open(SHELL);
			await cache.addAll(assets);
			// A missing page must not stop the worker installing, so these are added one by one.
			await Promise.all(shellPages.map((path) => cache.add(path).catch(() => undefined)));
			await sw.skipWaiting();
		})()
	);
});

sw.addEventListener('activate', (event) => {
	event.waitUntil(
		(async () => {
			for (const key of await caches.keys()) {
				if (key.startsWith('shell-') && key !== SHELL) await caches.delete(key);
			}
			await sw.clients.claim();
		})()
	);
});

async function cacheFirst(request: Request): Promise<Response> {
	const cached = await caches.match(request);
	if (cached) return cached;
	const response = await fetch(request);
	if (response.ok) {
		const copy = response.clone();
		void caches.open(SHELL).then((cache) => cache.put(request, copy));
	}
	return response;
}

async function staleWhileRevalidate(event: FetchEvent): Promise<Response> {
	const cache = await caches.open(DATA);
	const cached = await cache.match(event.request);
	const update = fetch(event.request).then((response) => {
		if (response.ok) void cache.put(event.request, response.clone());
		return response;
	});
	if (cached) {
		event.waitUntil(update.catch(() => undefined));
		return cached;
	}
	return update;
}

const withoutQuery = (url: string) => {
	const parsed = new URL(url);
	return `${parsed.origin}${parsed.pathname}`;
};

async function remember(url: string): Promise<void> {
	const response = await fetch(url);
	if (response.ok) (await caches.open(PAGES)).put(withoutQuery(url), response);
}

async function navigation(event: FetchEvent): Promise<Response> {
	const key = withoutQuery(event.request.url);
	try {
		const response = await Promise.race([
			fetch(event.request),
			new Promise<never>((_, reject) => setTimeout(() => reject(new Error('slow')), 6000))
		]);
		if (response.ok) {
			const copy = response.clone();
			event.waitUntil(caches.open(PAGES).then((cache) => cache.put(key, copy)));
		}
		return response;
	} catch {
		const saved = await caches.match(key);
		if (saved) return saved;
		// The offline page is a route of its own, so the address has to change for the app to show it.
		return Response.redirect(`${sw.location.origin}${base}/offline`, 302);
	}
}

sw.addEventListener('fetch', (event) => {
	const { request } = event;
	if (request.method !== 'GET') return;
	const url = new URL(request.url);
	if (url.origin !== sw.location.origin) return;

	if (isImmutable(url.pathname) || assets.includes(url.pathname)) {
		event.respondWith(cacheFirst(request));
	} else if (isData(url.pathname) && request.cache !== 'no-store') {
		event.respondWith(staleWhileRevalidate(event));
	} else if (request.mode === 'navigate') {
		event.respondWith(navigation(event));
	}
});

// Pages opened by in-app links never reach the network as navigations, so the page asks for them to be kept.
sw.addEventListener('message', (event) => {
	const data = event.data as { type?: string; url?: string } | undefined;
	if (data?.type !== 'remember' || !data.url) return;
	const url = new URL(data.url, sw.location.origin);
	if (url.origin !== sw.location.origin || !url.pathname.startsWith(`${base}/`)) return;
	event.waitUntil(remember(url.href).catch(() => undefined));
});
