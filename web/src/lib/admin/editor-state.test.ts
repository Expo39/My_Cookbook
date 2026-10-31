import { describe, expect, it } from 'vitest';
import type { RecipeCard, SectionNode, SiteIndex } from '$lib/types/recipe';
import { EditorState, fieldId } from './editor-state.svelte';

const card = (id: string): RecipeCard => ({
	id,
	slug: id.split('/').pop() as string,
	title: id,
	summary: '',
	tags: [],
	times: {},
	servings: 2,
	section: []
});

const node = (path: string, recipes: string[] = [], sections: SectionNode[] = []): SectionNode => ({
	path,
	title: path.split('/').pop() as string,
	recipes: recipes.map(card),
	sections
});

const index: SiteIndex = {
	sections: [
		node('mains', [], [node('mains/beef', ['mains/beef/steak'])]),
		node('soups', ['soups/tomato'])
	]
};

const editor = (section = '') => new EditorState({ index, section });

describe('the section picker', () => {
	it('lists every folder in tree order, deeper ones indented', () => {
		expect(editor().sectionOptions).toEqual([
			{ path: 'mains', label: 'mains', depth: 0 },
			{ path: 'mains/beef', label: 'beef', depth: 1 },
			{ path: 'soups', label: 'soups', depth: 0 }
		]);
	});

	it('adds a folder, chooses it and names its address', () => {
		const ed = editor('mains');
		expect(ed.addSection('mains', 'Lamb & Pork')).toBe('mains/lamb-and-pork');
		expect(ed.form.section).toBe('mains/lamb-and-pork');
		expect(ed.form.newSections).toEqual([{ path: 'mains/lamb-and-pork', title: 'Lamb & Pork' }]);
		expect(ed.sectionOptions.map((option) => option.path)).toEqual([
			'mains',
			'mains/beef',
			'mains/lamb-and-pork',
			'soups'
		]);
	});

	it('adds at the top level', () => {
		const ed = editor();
		ed.addSection('', 'Breads');
		expect(ed.form.section).toBe('breads');
		expect(ed.sectionOptions.at(-1)).toEqual({ path: 'breads', label: 'Breads (new)', depth: 0 });
	});

	it('nests a new folder inside another new folder', () => {
		const ed = editor();
		ed.addSection('', 'Breads');
		ed.addSection('breads', 'Sourdough');
		expect(ed.neededSections.map((s) => s.path)).toEqual(['breads', 'breads/sourdough']);
	});

	it('chooses a folder that exists instead of adding it twice', () => {
		const ed = editor();
		ed.addSection('mains', 'Beef');
		expect(ed.form.newSections).toEqual([]);
		expect(ed.form.section).toBe('mains/beef');
	});

	it('refuses a name with nothing usable in it', () => {
		const ed = editor('mains');
		expect(ed.addSection('mains', '  !! ')).toBeUndefined();
		expect(ed.form.section).toBe('mains');
	});

	it('creates only the folders the chosen one sits in', () => {
		const ed = editor();
		ed.addSection('', 'Breads');
		ed.addSection('', 'Cakes');
		expect(ed.neededSections.map((s) => s.path)).toEqual(['cakes']);
	});

	it('steps back to the parent when a new folder is removed', () => {
		const ed = editor();
		ed.addSection('', 'Breads');
		ed.addSection('breads', 'Sourdough');
		ed.removeSection('breads');
		expect(ed.form.newSections).toEqual([]);
		expect(ed.form.section).toBe('');
	});
});

describe('the address', () => {
	it('follows the title until the author edits it', () => {
		const ed = editor('soups');
		ed.form.title = 'Tomato & Basil';
		expect(ed.slug).toBe('tomato-and-basil');
		expect(ed.id).toBe('soups/tomato-and-basil');
		ed.form.slug = 'my-soup';
		ed.form.slugTouched = true;
		expect(ed.id).toBe('soups/my-soup');
	});

	it('flags an address that is already taken', () => {
		const ed = editor('soups');
		ed.form.title = 'Tomato';
		expect(ed.results.map((result) => result.id)).toContain('F-ID-EXISTS');
	});

	it('asks for a name for each new folder it will create', () => {
		const ed = editor();
		ed.form.newSections.push({ path: 'breads', title: ' ' });
		ed.form.section = 'breads';
		expect(ed.results.map((result) => result.id)).toContain('F-SECTION-TITLE');
	});
});

describe('unsaved changes', () => {
	it('knows when the form differs from how it started', () => {
		const ed = editor();
		expect(ed.dirty).toBe(false);
		ed.form.title = 'Soup';
		expect(ed.dirty).toBe(true);
		ed.markSaved();
		expect(ed.dirty).toBe(false);
	});

	it('gives every form field an id a link can reach', () => {
		expect(fieldId('ingredientGroups[0].items[1].amount.qty')).toBe(
			'f-ingredientGroups-0-items-1-amount-qty'
		);
		expect(fieldId('title')).toBe('f-title');
	});
});

describe('moving an existing recipe', () => {
	const stored = {
		title: 'Steak',
		summary: 'A steak.',
		servings: 2,
		ingredientGroups: [],
		steps: [{ text: 'Cook.' }],
		image: { src: 'steak.jpg', alt: 'A steak' }
	};
	const opened = () => new EditorState({ index, id: 'mains/beef/steak', recipe: stored });

	it('is not a move until the address changes', () => {
		expect(opened().moving).toBe(false);
	});

	it('is a move when the section or the slug changes, and renames the photo to match', () => {
		const ed = opened();
		ed.form.section = 'soups';
		expect(ed.moving).toBe(true);
		expect(ed.id).toBe('soups/steak');
		ed.form.slug = 'beef-steak';
		expect(ed.id).toBe('soups/beef-steak');
		expect(ed.built.recipe.image?.src).toBe('beef-steak.jpg');
	});

	it('keeps the photo name when the recipe stays where it is', () => {
		expect(opened().built.recipe.image?.src).toBe('steak.jpg');
	});

	it('refuses an address another recipe already has', () => {
		const ed = opened();
		ed.form.section = 'soups';
		ed.form.slug = 'tomato';
		expect(ed.results.map((result) => result.id)).toContain('F-ID-EXISTS');
	});
});

describe('steps in plain words', () => {
	const stored = {
		title: 'Bread',
		summary: 'A loaf.',
		servings: 1,
		ingredientGroups: [],
		steps: [{ text: 'Bake {timer:40} at {temp:220}.' }]
	};
	const opened = (plainSteps: boolean) =>
		new EditorState({ index, id: 'soups/bread', recipe: stored, plainSteps });

	it('shows tokens as words, and saves the words as tokens again', () => {
		const ed = opened(true);
		expect(ed.form.steps[0].text).toBe('Bake 40 minutes at 220°C.');
		expect(ed.dirty).toBe(false);
		ed.form.steps[0].text = 'Bake 35 minutes at 200C.';
		expect(ed.built.recipe.steps[0].text).toBe('Bake {timer:35} at {temp:200}.');
		expect(ed.steps[0].found.map((item) => item.kind)).toEqual(['timer', 'temp']);
	});

	it('leaves the tokens alone in the full editor', () => {
		const ed = opened(false);
		expect(ed.form.steps[0].text).toBe(stored.steps[0].text);
		ed.form.steps[0].text = 'Bake 35 minutes.';
		expect(ed.built.recipe.steps[0].text).toBe('Bake 35 minutes.');
		expect(ed.steps[0].found).toEqual([]);
	});
});
