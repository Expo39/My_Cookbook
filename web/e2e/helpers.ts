import { readFileSync } from 'node:fs';
import { expect, type Page } from '@playwright/test';

const dataDir = new URL('../static/data/', import.meta.url);

export const recipeIds: string[] = JSON.parse(
	readFileSync(new URL('manifest.json', dataDir), 'utf8')
).ids;

export const recipeData = (id: string) =>
	JSON.parse(readFileSync(new URL(`recipes/${id}.json`, dataDir), 'utf8'));

/** Collects anything the browser reports as an error, so a test can assert there were none. */
export function watchErrors(page: Page): () => string[] {
	const errors: string[] = [];
	page.on('console', (message) => {
		if (message.type() === 'error') errors.push(message.text());
	});
	page.on('pageerror', (error) => errors.push(error.message));
	return () => errors;
}

/** The scaling controls stay disabled until the WASM core has loaded. */
export async function waitForCore(page: Page) {
	await expect(page.getByRole('button', { name: 'More servings' }).first()).toBeEnabled();
}

export const ingredients = (page: Page) => page.getByRole('region', { name: 'Ingredients' });
export const method = (page: Page) => page.getByRole('region', { name: 'Method' });
