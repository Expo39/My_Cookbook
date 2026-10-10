/**
 * Asks the service worker to keep the page being viewed, so it opens without a connection later.
 * A link inside the app never makes a navigation request, so the worker cannot see these visits itself.
 */
export function rememberPage(): void {
	if (!('serviceWorker' in navigator)) return;
	const url = location.href;
	navigator.serviceWorker.ready
		.then((registration) => registration.active?.postMessage({ type: 'remember', url }))
		.catch(() => undefined);
}
