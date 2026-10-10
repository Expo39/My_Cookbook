import { isoDuration, servingsText } from '$lib/recipe/format';
import type { Recipe, ScaledRecipe, ScaledStep } from '$lib/types/recipe';

interface HowToStep {
	'@type': 'HowToStep';
	text: string;
}

interface HowToSection {
	'@type': 'HowToSection';
	name: string;
	itemListElement: HowToStep[];
}

export interface RecipeJsonLd {
	'@context': 'https://schema.org';
	'@type': 'Recipe';
	name: string;
	url: string;
	description: string;
	author: { '@type': 'Person'; name: string };
	recipeYield: string[];
	recipeCategory?: string;
	keywords?: string;
	image?: string[];
	prepTime?: string;
	cookTime?: string;
	totalTime?: string;
	recipeIngredient: string[];
	recipeInstructions: (HowToStep | HowToSection)[];
}

const step = (source: ScaledStep): HowToStep => ({ '@type': 'HowToStep', text: source.text });

/** Steps under the same heading share a section; steps before the first heading form their own. */
function instructions(steps: ScaledStep[]): (HowToStep | HowToSection)[] {
	if (!steps.some((s) => s.heading)) return steps.map(step);
	const sections: HowToSection[] = [];
	for (const source of steps) {
		if (source.heading || sections.length === 0) {
			sections.push({
				'@type': 'HowToSection',
				name: source.heading ?? 'Method',
				itemListElement: []
			});
		}
		sections[sections.length - 1].itemListElement.push(step(source));
	}
	return sections;
}

interface Input {
	recipe: Recipe;
	/** The recipe at its written servings, in metric units, with the default variants. */
	view: ScaledRecipe;
	/** Titles of the sections the recipe sits in, outermost first. */
	section: string[];
	url: string;
	image?: string[];
}

export function buildRecipeJsonLd({ recipe, view, section, url, image }: Input): RecipeJsonLd {
	const { prep, cook, rest } = recipe.times ?? {};
	const parts = [prep, cook, rest].filter((minutes): minutes is number => minutes != null);
	return {
		'@context': 'https://schema.org',
		'@type': 'Recipe',
		name: recipe.title,
		url,
		description: recipe.summary,
		author: { '@type': 'Person', name: 'Antonio' },
		recipeYield: [String(recipe.servings), servingsText(recipe.servings, recipe.servingsNoun)],
		...(section[0] ? { recipeCategory: section[0] } : {}),
		...(recipe.tags?.length ? { keywords: recipe.tags.join(', ') } : {}),
		...(image ? { image } : {}),
		...(prep != null ? { prepTime: isoDuration(prep) } : {}),
		...(cook != null ? { cookTime: isoDuration(cook) } : {}),
		...(parts.length ? { totalTime: isoDuration(parts.reduce((a, b) => a + b, 0)) } : {}),
		recipeIngredient: view.groups.flatMap((group) => group.items.map((item) => item.text)),
		recipeInstructions: instructions(view.steps)
	};
}

/** JSON that is safe inside a script element: `<` cannot start a closing tag. */
export const toScriptJson = (value: unknown): string =>
	JSON.stringify(value).replaceAll('<', '\\u003c');
