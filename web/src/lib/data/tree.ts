import type { RecipeCard, SectionNode, SiteIndex } from '$lib/types/recipe';

/** Every recipe in the index, depth first, in the order the sections list them. */
export function descendantRecipes(node: SectionNode): RecipeCard[] {
	return [...node.recipes, ...node.sections.flatMap(descendantRecipes)];
}

export const allRecipes = (index: SiteIndex): RecipeCard[] =>
	index.sections.flatMap(descendantRecipes);

export const countRecipes = (node: SectionNode): number => descendantRecipes(node).length;

export function findSection(index: SiteIndex, path: string): SectionNode | undefined {
	const walk = (nodes: SectionNode[]): SectionNode | undefined => {
		for (const node of nodes) {
			if (node.path === path) return node;
			if (path.startsWith(`${node.path}/`)) return walk(node.sections);
		}
	};
	return walk(index.sections);
}

/** The sections from the top level down to the one at `path` (or to the folder a recipe sits in). */
export function sectionTrail(index: SiteIndex, path: string): SectionNode[] {
	const trail: SectionNode[] = [];
	let nodes = index.sections;
	for (;;) {
		const next = nodes.find((node) => path === node.path || path.startsWith(`${node.path}/`));
		if (!next) return trail;
		trail.push(next);
		nodes = next.sections;
	}
}

export const findRecipe = (index: SiteIndex, id: string): RecipeCard | undefined =>
	allRecipes(index).find((card) => card.id === id);

/** The recipes added most recently, taken as the last ones in index order. */
export const latestRecipes = (index: SiteIndex, count: number): RecipeCard[] =>
	allRecipes(index).slice(-count).reverse();
