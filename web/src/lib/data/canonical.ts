type Kind = 'recipe' | 'group' | 'ingredient' | 'step' | 'variant' | 'option' | 'plain';

const ORDER: Record<Kind, string[]> = {
	recipe: [
		'title',
		'summary',
		'servings',
		'servingsNoun',
		'titleLocal',
		'origin',
		'scaling',
		'precise',
		'pan',
		'times',
		'difficulty',
		'tags',
		'order',
		'image',
		'equipment',
		'ingredientGroups',
		'steps',
		'tips',
		'variants',
		'related'
	],
	group: ['name', 'total', 'items'],
	ingredient: [
		'key',
		'food',
		'each',
		'amount',
		'alt',
		'prefix',
		'item',
		'note',
		'optional',
		'scale'
	],
	step: ['heading', 'text', 'key', 'time'],
	variant: ['key', 'label', 'options'],
	option: ['key', 'label', 'default', 'ingredients', 'steps', 'tips'],
	plain: []
};

const CHILD: Partial<Record<Kind, Record<string, Kind>>> = {
	recipe: { ingredientGroups: 'group', steps: 'step', variants: 'variant' },
	group: { items: 'ingredient' },
	variant: { options: 'option' },
	option: {}
};

const empty = (value: unknown) =>
	value === null ||
	value === undefined ||
	value === false ||
	(Array.isArray(value) && value.length === 0);

function arrange(value: unknown, kind: Kind): unknown {
	if (Array.isArray(value)) return value.map((item) => arrange(item, kind));
	if (value === null || typeof value !== 'object') return value;
	const rank = (name: string) => {
		const at = ORDER[kind].indexOf(name);
		return at < 0 ? ORDER[kind].length : at;
	};
	const entries = Object.entries(value)
		.filter(([, child]) => !empty(child))
		.sort(([a], [b]) => rank(a) - rank(b));
	return Object.fromEntries(
		entries.map(([name, child]) => {
			if (kind === 'option' && name === 'ingredients') {
				const keyed = Object.entries(child as object).map(
					([key, item]) => [key, arrange(item, 'ingredient')] as const
				);
				return [name, Object.fromEntries(keyed)];
			}
			return [name, arrange(child, CHILD[kind]?.[name] ?? 'plain')];
		})
	);
}

/** The recipe as the Rust tool writes it: its key order, two-space indent, no empty fields, a final newline. */
export function renderRecipe(recipe: unknown): string {
	return `${JSON.stringify(arrange(recipe, 'recipe'), null, 2)}\n`;
}

export function renderSection(section: {
	title: string;
	order?: number;
	summary?: string;
}): string {
	const { title, order, summary } = section;
	return `${JSON.stringify(Object.fromEntries(Object.entries({ title, order, summary }).filter(([, v]) => v !== undefined && v !== '')), null, 2)}\n`;
}
