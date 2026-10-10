import { describe, expect, it } from 'vitest';
import { fallbackSrc, photoOf, srcset, widthUpTo } from './photo';

describe('photoOf', () => {
	it('needs the measured size and the generated widths', () => {
		const image = { src: 'a.jpg', alt: 'Soup', width: 2000, height: 1500, widths: [480, 960] };
		expect(photoOf(image)).toEqual({ alt: 'Soup', width: 2000, height: 1500, widths: [480, 960] });
		expect(photoOf({ src: 'a.jpg', alt: 'Soup' })).toBeUndefined();
		expect(photoOf({ ...image, widths: [] })).toBeUndefined();
		expect(photoOf(null)).toBeUndefined();
	});
});

describe('srcset', () => {
	it('lists every width with its descriptor', () => {
		expect(srcset('a/b', [480, 960], 'webp')).toBe(
			'/img/a/b/480.webp 480w, /img/a/b/960.webp 960w'
		);
	});
});

describe('widthUpTo', () => {
	it('picks the widest file within the limit', () => {
		expect(widthUpTo([480, 960, 1600], 1000)).toBe(960);
		expect(widthUpTo([480, 960, 1600], 5000)).toBe(1600);
	});

	it('falls back to the narrowest file', () => {
		expect(widthUpTo([480, 960], 100)).toBe(480);
		expect(fallbackSrc('a', [300])).toBe('/img/a/300.jpg');
	});
});
