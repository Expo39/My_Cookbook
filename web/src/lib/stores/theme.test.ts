import { beforeEach, describe, expect, it } from 'vitest';
import { THEME_KEY, theme } from './theme.svelte';

const root = () => document.documentElement;

beforeEach(() => {
	localStorage.clear();
	delete root().dataset.theme;
	theme.choice = 'light';
});

describe('the theme store', () => {
	it('sets data-theme and remembers a chosen theme', () => {
		theme.set('dark');
		expect(root().dataset.theme).toBe('dark');
		expect(localStorage.getItem(THEME_KEY)).toBe('dark');
		theme.set('light');
		expect(root().dataset.theme).toBe('light');
		expect(localStorage.getItem(THEME_KEY)).toBeNull();
	});

	it('follows the device by removing the attribute and storing the choice', () => {
		theme.set('dark');
		theme.set('system');
		expect(root().dataset.theme).toBeUndefined();
		expect(localStorage.getItem(THEME_KEY)).toBe('system');
	});

	it('loads the stored choice, and falls back to light for anything else', () => {
		localStorage.setItem(THEME_KEY, 'dark');
		theme.load();
		expect(theme.choice).toBe('dark');
		localStorage.setItem(THEME_KEY, 'sepia');
		theme.load();
		expect(theme.choice).toBe('light');
	});
});
