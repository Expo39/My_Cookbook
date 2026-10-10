import type { Recipe, Unit } from '$lib/types/recipe';

const slug = (text: string) =>
	text
		.normalize('NFD')
		.replace(/[\u0300-\u036f]/g, '')
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-|-$/g, '') || 'ingredient';

/**
 * The core can only scale by an ingredient that has a key, so ingredients without one get a
 * readable key made from their name. Keys the author wrote are kept.
 */
export function withKeys(recipe: Recipe): Recipe {
	const copy = structuredClone(recipe);
	const taken = new Set(copy.ingredientGroups.flatMap((g) => g.items.map((i) => i.key)));
	for (const item of copy.ingredientGroups.flatMap((g) => g.items)) {
		if (item.key || !item.amount) continue;
		const stem = slug(item.item ?? '');
		let key = stem;
		for (let n = 2; taken.has(key); n++) key = `${stem}-${n}`;
		taken.add(key);
		item.key = key;
	}
	return copy;
}

export interface HaveChoice {
	key: string;
	label: string;
	unit?: Unit | null;
}

/** The ingredients a cook can say "I have this much of" about. */
export function haveChoices(keyed: Recipe): HaveChoice[] {
	return keyed.ingredientGroups
		.flatMap((group) => group.items)
		.filter((item) => item.key && item.amount && (!item.scale || item.scale === 'linear'))
		.map((item) => ({
			key: item.key as string,
			label: item.item ?? item.key ?? '',
			unit: item.amount?.unit
		}));
}

const MASS: Unit[] = ['g', 'kg', 'oz', 'lb'];
const VOLUME: Unit[] = ['ml', 'l', 'tsp', 'tbsp', 'cup', 'floz'];

/** Units that measure the same thing as `unit`; a count has only itself (no unit). */
export function sameKind(unit?: Unit | null): Unit[] {
	if (!unit) return [];
	return [MASS, VOLUME].find((group) => group.includes(unit)) ?? [unit];
}
