import { localPhotos } from '$lib/data/local-store';
import { readJson, writeStorage } from './storage';

/** Which pages have a photo kept in this browser, so the script in app.html can hold its place. */
export const PHOTO_PAGES_KEY = 'sapori:photos';

export interface ShownPhoto {
	url: string;
	alt: string;
}

/** The page a photo belongs to, as the script in app.html sees it: the path, and `?id=` on /mine. */
export function photoPage(): string {
	const path = location.pathname.replace(/\.html$/, '').replace(/\/$/, '');
	const id = /\/mine$/.test(path) ? new URLSearchParams(location.search).get('id') : null;
	return id ? `${path}?id=${encodeURIComponent(id)}` : path;
}

function remember(id: string, page: string | null): void {
	const stored = readJson(PHOTO_PAGES_KEY);
	const pages: Record<string, string> =
		stored && typeof stored === 'object' ? (stored as Record<string, string>) : {};
	if (page) pages[id] = page;
	else delete pages[id];
	writeStorage(PHOTO_PAGES_KEY, Object.keys(pages).length ? JSON.stringify(pages) : null);
}

/**
 * Photos people give recipes on this device, kept in IndexedDB and shown only to them: on their own
 * recipes, and on the cookbook's when they have no token to save to GitHub.
 */
export const devicePhotos = {
	async load(id: string): Promise<ShownPhoto | null> {
		try {
			const entry = await localPhotos.get(id);
			return entry ? { url: URL.createObjectURL(entry.blob), alt: entry.alt } : null;
		} catch {
			return null;
		}
	},

	async blob(id: string): Promise<{ blob: Blob; alt: string } | null> {
		try {
			const entry = await localPhotos.get(id);
			return entry ? { blob: entry.blob, alt: entry.alt } : null;
		} catch {
			return null;
		}
	},

	async save(id: string, blob: Blob, alt: string): Promise<void> {
		await localPhotos.put({ id, blob, alt: alt.trim(), updated: Date.now() });
		remember(id, photoPage());
	},

	/** A recipe of theirs moved to a new address: its photo, and the page it shows on, follow. */
	async move(from: string, to: string): Promise<void> {
		const entry = await localPhotos.get(from);
		if (!entry) return;
		await localPhotos.put({ ...entry, id: to });
		await localPhotos.remove(from);
		const stored = readJson(PHOTO_PAGES_KEY) as Record<string, string> | null;
		const page = stored?.[from]?.replace(
			`?id=${encodeURIComponent(from)}`,
			`?id=${encodeURIComponent(to)}`
		);
		remember(from, null);
		if (page) remember(to, page);
	},

	async remove(id: string): Promise<void> {
		try {
			await localPhotos.remove(id);
		} finally {
			remember(id, null);
		}
	}
};
