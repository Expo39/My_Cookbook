import type { ScaledGroup, ScaledIngredient, ScaledStep } from '$lib/types/recipe';

/** One ingredient line a step uses, with where it sits in the recipe's list. */
export interface StepIngredient {
	group: number;
	index: number;
	groupName?: string | null;
	item: ScaledIngredient;
}

/** Words that describe an ingredient rather than name it, so they never identify one alone. */
const DESCRIPTIVE = new Set(
	(
		'a an and of the for to about each per some few optional extra virgin fresh large ' +
		'small medium plain ground dried chopped sliced diced minced grated crushed beaten finely ' +
		'thinly roughly black white red green yellow hot cold warm sweet japanese short grain long ' +
		'uncooked cooked boneless skinless free range unsalted salted light dark double single good ' +
		'quality ripe raw whole baby young mature smoked thick thin soft hard firm frozen tinned canned ' +
		'pinch handful splash dash drizzle generous heaped level'
	).split(' ')
);

/** Words that count an ingredient ("cloves garlic"): the food is the word beside them. */
const CONTAINERS = new Set(
	'slice clove sprig leaf sheet piece rasher stick head bunch can tin jar pack packet bag knob cube stalk'.split(
		' '
	)
);

/** Names too general to match alone: "soy sauce" needs "soy sauce", not any sauce. */
const GENERAL = new Set('sauce powder paste juice zest seed extract flake mix'.split(' '));

/** Folds plurals together, so "shallots" finds "shallot" and "tomatoes" finds "tomato". */
export function stem(word: string): string {
	if (word.length < 4) return word;
	if (word.endsWith('ies')) return `${word.slice(0, -3)}y`;
	if (/(oes|ches|shes|sses|xes)$/.test(word)) return word.slice(0, -2);
	if (word.endsWith('s') && !word.endsWith('ss')) return word.slice(0, -1);
	return word;
}

const words = (text: string): string[] =>
	text
		.toLowerCase()
		.normalize('NFD')
		.replace(/[\u0300-\u036f]/g, '')
		.split(/[^a-z]+/)
		.filter(Boolean)
		.map(stem);

/** The words that name each food in a line: "tuna in olive oil" is tuna, "salt and pepper" two foods. */
function foods(item: string): string[][] {
	const name = item.split(',')[0].split(/\s+(?:in|with|from)\s+/i)[0];
	return name
		.split(/\s+(?:and|&)\s+/i)
		.map((phrase) => {
			const named = words(phrase).filter((word) => !DESCRIPTIVE.has(word));
			// "garlic cloves" is garlic; "ground cloves", with nothing else named, is cloves.
			return named.length > 1 && CONTAINERS.has(named[named.length - 1])
				? named.slice(0, -1)
				: named.filter((word, at) => at > 0 || !CONTAINERS.has(word) || named.length === 1);
		})
		.filter((named) => named.length > 0);
}

/** Where `phrase` starts in `text`, every time. */
const starts = (text: string[], phrase: string[]): number[] =>
	text.flatMap((_, at) => (phrase.every((word, offset) => text[at + offset] === word) ? [at] : []));

/** How a recipe's lines can be recognised in its steps, worked out once for all of them. */
function matchers(groups: ScaledGroup[]) {
	const distinct = [
		...new Set(groups.flatMap((group) => group.items.map((item) => item.item.toLowerCase())))
	];
	const parsed = new Map(distinct.map((item) => [item, foods(item)]));
	const heads = new Map<string, number>();
	const counts = new Map<string, number>();
	for (const named of parsed.values()) {
		for (const head of new Set(named.map((phrase) => phrase[phrase.length - 1])))
			heads.set(head, (heads.get(head) ?? 0) + 1);
		for (const word of new Set(named.flat())) counts.set(word, (counts.get(word) ?? 0) + 1);
	}

	const lines = new Map(
		distinct.map((item) => {
			const named = parsed.get(item) ?? [];
			// The main noun alone, unless it is general or another line shares it ("spring onions").
			const phrases = named.map((phrase) => {
				const head = phrase[phrase.length - 1];
				const pair = phrase.length > 1 && (GENERAL.has(head) || (heads.get(head) ?? 0) > 1);
				return pair ? phrase.slice(-2) : [head];
			});
			// A word only this line has also finds it ("egg" for the egg yolks), but not the "curry"
			// of "curry powder", which is a kind of powder.
			const own = named
				.filter((phrase) => !GENERAL.has(phrase[phrase.length - 1]))
				.flat()
				.filter((word) => counts.get(word) === 1);
			return [item, { phrases, own }];
		})
	);
	const pairs = [...lines.values()].flatMap((line) => line.phrases.filter((p) => p.length > 1));

	/** Matches a step's words. A pair claims its words first, so "spring onions" is not also onions. */
	return (text: string[]) => {
		const claimed = new Set(
			pairs.flatMap((pair) => starts(text, pair).flatMap((at) => pair.map((_, i) => at + i)))
		);
		const free = text.map((word, at) => (claimed.has(at) ? '' : word));
		return (item: string): boolean => {
			const line = lines.get(item);
			if (!line) return false;
			return (
				line.phrases.some((p) => starts(p.length > 1 ? text : free, p).length > 0) ||
				line.own.some((word) => free.includes(word))
			);
		};
	};
}

/**
 * The ingredient lines each step uses, in the recipe's order. Lines a step names with `{@key}`
 * tokens always count; otherwise the step's words are matched against each line. A line that
 * appears in more than one part (flour for the coating and for the sauce) is given to the part
 * the cook is working on: the part of the step's other lines, or of the step before.
 */
export function stepIngredients(steps: ScaledStep[], groups: ScaledGroup[]): StepIngredient[][] {
	const recognise = matchers(groups);
	const homes = new Map<string, Set<number>>();
	groups.forEach((group, g) =>
		group.items.forEach((item) => {
			const name = item.item.toLowerCase();
			homes.set(name, (homes.get(name) ?? new Set()).add(g));
		})
	);
	const repeated = (item: ScaledIngredient) => (homes.get(item.item.toLowerCase())?.size ?? 0) > 1;

	let working = new Set<number>();
	return steps.map((step) => {
		const keyed = new Set(
			step.segments.flatMap((segment) => (segment.type === 'ingredient' ? [segment.key] : []))
		);
		const text = words(
			step.segments.flatMap((segment) => (segment.type === 'text' ? [segment.text] : [])).join(' ')
		);
		const matches = recognise(text);
		const found = groups.flatMap((group, g) =>
			group.items.flatMap((item, index) =>
				(item.key && keyed.has(item.key)) || matches(item.item.toLowerCase())
					? [{ group: g, index, groupName: group.name, item }]
					: []
			)
		);

		const here = new Set(
			found.filter((entry) => !repeated(entry.item)).map((entry) => entry.group)
		);
		if (here.size) working = here;
		return found.filter((entry) => {
			if (!repeated(entry.item)) return true;
			const options = homes.get(entry.item.item.toLowerCase()) ?? new Set();
			const chosen = [...options].filter((g) => working.has(g));
			return chosen.length === 0 || chosen.includes(entry.group);
		});
	});
}
