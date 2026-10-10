import { mount, unmount } from 'svelte';
import { afterEach, describe, expect, it } from 'vitest';
import RecipePhoto from './RecipePhoto.svelte';

const photo = { alt: 'A bowl of soup', width: 2000, height: 1333, widths: [480, 960, 1600] };
const mounted: Record<string, unknown>[] = [];

function render(hero: boolean) {
	const target = document.createElement('div');
	document.body.append(target);
	mounted.push(
		mount(RecipePhoto, { target, props: { id: 'mains/soup', photo, sizes: '100vw', hero } })
	);
	return target;
}

afterEach(() => {
	for (const instance of mounted.splice(0)) void unmount(instance);
	document.body.replaceChildren();
});

describe('RecipePhoto', () => {
	it('offers WebP with a JPEG fallback at every generated width', () => {
		const target = render(false);
		const source = target.querySelector('source');
		const image = target.querySelector('img');
		expect(source?.getAttribute('type')).toBe('image/webp');
		expect(source?.getAttribute('srcset')).toBe(
			'/img/mains/soup/480.webp 480w, /img/mains/soup/960.webp 960w, /img/mains/soup/1600.webp 1600w'
		);
		expect(source?.getAttribute('sizes')).toBe('100vw');
		expect(image?.getAttribute('srcset')).toContain('/img/mains/soup/1600.jpg 1600w');
		expect(image?.getAttribute('src')).toBe('/img/mains/soup/960.jpg');
	});

	it('reserves the photo’s space with its dimensions', () => {
		const image = render(false).querySelector('img');
		expect(image?.getAttribute('width')).toBe('2000');
		expect(image?.getAttribute('height')).toBe('1333');
		expect(image?.getAttribute('alt')).toBe('A bowl of soup');
	});

	it('loads lazily, except for the hero', () => {
		const lazy = render(false).querySelector('img');
		expect(lazy?.getAttribute('loading')).toBe('lazy');
		const hero = render(true).querySelector('img');
		expect(hero?.getAttribute('loading')).toBe('eager');
		expect(hero?.getAttribute('fetchpriority')).toBe('high');
	});
});
