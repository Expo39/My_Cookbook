import type { Recipe } from '$lib/types/recipe';
import { formFromRecipe, type FormData } from './recipe-form';

/** A form for a recipe the AI read from pasted text. The address follows the title and the folder is kept. */
export function formFromImport(recipe: Recipe, section: string): FormData {
	const form = formFromRecipe(recipe, section ? `${section}/imported` : 'imported');
	return { ...form, section, slug: '', slugTouched: false };
}
