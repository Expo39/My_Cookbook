// @vitest-environment node
import { readFileSync } from 'node:fs';
import { beforeAll, describe, expect, it } from 'vitest';
import { createSearchEngine, loadCore, scaleRecipe, type RecipeData } from './index';

const dataDir = new URL('../../../static/data/', import.meta.url);
const read = <T>(path: string): T => JSON.parse(readFileSync(new URL(path, dataDir), 'utf8'));

beforeAll(async () => {
	await loadCore(readFileSync(new URL('../wasm/cookbook_wasm_bg.wasm', import.meta.url)));
});

describe('the built data', () => {
	const manifest = read<{ count: number; ids: string[] }>('manifest.json');

	it('lists every recipe and has a page for each', () => {
		expect(manifest.count).toBe(manifest.ids.length);
		for (const id of manifest.ids) {
			expect(read<RecipeData>(`recipes/${id}.json`).recipe.title).toBeTruthy();
		}
	});

	it('prescales the same view the WASM produces', () => {
		const page = read<RecipeData>(`recipes/${manifest.ids[0]}.json`);
		expect(JSON.parse(JSON.stringify(scaleRecipe(page.recipe)))).toEqual(page.view);
	});

	it('finds a recipe by its title through the search index', () => {
		const engine = createSearchEngine(readFileSync(new URL('search.json', dataDir), 'utf8'));
		const page = read<RecipeData>(`recipes/${manifest.ids[0]}.json`);
		const hits = engine.search(page.recipe.title);
		expect(hits.map((h) => h.id)).toContain(manifest.ids[0]);
		expect(Array.isArray(engine.ingredientsIHave(['salt']))).toBe(true);
		engine.free();
	});
});
