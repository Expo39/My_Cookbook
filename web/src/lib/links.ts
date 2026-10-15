import { resolve } from '$app/paths';

export const homeHref = (): string => resolve('/');

/** A section or recipe page, from its folder or recipe id. */
export const pageHref = (path: string): string => resolve('/[...path]', { path });

export const shoppingHref = (): string => resolve('/shopping-list');

export const favouritesHref = (): string => resolve('/favourites');

/** The guide to the cookbook; `part` is the id of one of its sections. */
export const howToHref = (part = ''): string =>
	`${resolve('/how-to-use')}${part ? `#${part}` : ''}`;

/** A recipe added on this device; static hosting cannot pre-render it, so it lives under one page. */
export const mineHref = (id: string): string => `${resolve('/mine')}?id=${encodeURIComponent(id)}`;

export const searchHref = (query = ''): string =>
	`${resolve('/search')}${query ? `?q=${encodeURIComponent(query)}` : ''}`;

/** The editor: a recipe to change (`id`), or the folder a new recipe starts in (`section`). */
export function editHref(target: { id?: string; section?: string } = {}): string {
	const query = target.id
		? `?id=${encodeURIComponent(target.id)}`
		: target.section
			? `?section=${encodeURIComponent(target.section)}`
			: '';
	return `${resolve('/edit')}${query}`;
}
