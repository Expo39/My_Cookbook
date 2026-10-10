import { base } from '$app/paths';

/** The deployed origin plus the base path, without a trailing slash. */
export const siteRoot = `${__SITE_URL__.replace(/\/$/, '')}${base}`;

export const canonicalUrl = (path: string): string => `${siteRoot}${path ? `/${path}` : '/'}`;

/** The cards `cookbook-cli cards` writes for every recipe, with the sizes it renders them at. */
export const CARD_SIZES = {
	og: { width: 1200, height: 630 },
	portrait: { width: 1080, height: 1350 }
} as const;

export type CardKind = keyof typeof CARD_SIZES;

export const cardUrl = (id: string, kind: CardKind = 'og'): string =>
	`${siteRoot}/cards/${id}/${kind}.png`;
