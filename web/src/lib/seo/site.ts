import { base } from '$app/paths';

/** The deployed origin plus the base path, without a trailing slash. */
export const siteRoot = `${__SITE_URL__.replace(/\/$/, '')}${base}`;

export const canonicalUrl = (path: string): string => `${siteRoot}${path ? `/${path}` : '/'}`;

const available = new Set<string>(__CARDS__);

/**
 * The share card for a recipe, once the build has produced one at `static/cards/<id>.png`.
 * Until then there is no image to point at, so the meta tag is left out.
 */
export const cardUrl = (id: string): string | undefined =>
	available.has(id) ? `${siteRoot}/cards/${id}.png` : undefined;
