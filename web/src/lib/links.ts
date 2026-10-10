import { resolve } from '$app/paths';

export const homeHref = (): string => resolve('/');

/** A section or recipe page, from its folder or recipe id. */
export const pageHref = (path: string): string => resolve('/[...path]', { path });

export const searchHref = (query = ''): string =>
	`${resolve('/search')}${query ? `?q=${encodeURIComponent(query)}` : ''}`;
