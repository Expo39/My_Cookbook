/** A `fetch` that skips the service worker's data cache, for reads that must see the latest. */
export const uncached: typeof fetch = (input, init) => fetch(input, { ...init, cache: 'no-store' });
