import { base } from '$app/paths';
import { siteRoot } from '$lib/seo/site';
import type { CardImage } from '$lib/types/recipe';

export type PhotoFormat = 'webp' | 'jpg';

/** A photo the pipeline has measured and resized, so every file named here exists. */
export interface Photo {
	alt: string;
	width: number;
	height: number;
	widths: number[];
}

/** The image of a recipe card once `cookbook-cli build` has processed it. */
export function photoOf(image: CardImage | null | undefined): Photo | undefined {
	if (!image?.width || !image.height || !image.widths?.length) return undefined;
	return { alt: image.alt, width: image.width, height: image.height, widths: image.widths };
}

const file = (id: string, width: number, format: PhotoFormat) => `/img/${id}/${width}.${format}`;

export const srcset = (id: string, widths: number[], format: PhotoFormat): string =>
	widths.map((width) => `${base}${file(id, width, format)} ${width}w`).join(', ');

/** The widest file no wider than `limit`, or the narrowest when every file is wider. */
export function widthUpTo(widths: number[], limit: number): number {
	return widths.filter((width) => width <= limit).at(-1) ?? widths[0];
}

export const fallbackSrc = (id: string, widths: number[], limit = 960): string =>
	`${base}${file(id, widthUpTo(widths, limit), 'jpg')}`;

/** The absolute address of the widest JPEG, for structured data. */
export const photoUrl = (id: string, widths: number[]): string =>
	`${siteRoot}${file(id, widths[widths.length - 1], 'jpg')}`;
