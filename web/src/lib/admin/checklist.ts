import type { CheckResult } from '$lib/types/recipe';

/** Plain words for the checks a cook is likely to meet; any other check keeps its own message. */
const WORDS: Record<string, string | ((result: CheckResult) => string | undefined)> = {
	'E-SCHEMA-BLANK': ({ path }) => {
		if (path === 'title') return 'Give the recipe a name.';
		if (path === 'summary') return 'Add a sentence or two about the dish.';
		const step = path.match(/^steps\[(\d+)\]/);
		return step ? `Step ${Number(step[1]) + 1} is empty. Write it, or remove it.` : undefined;
	},
	'E-SCHEMA-SERVINGS': 'Say how many people it serves.',
	'E-SCHEMA-INGREDIENTS': 'Add the ingredients.',
	'E-SCHEMA-STEPS': 'Add the method, one step at a time.',
	'E-SCHEMA-ITEM': 'One of the ingredients has no name.',
	'E-QTY-POSITIVE': 'An amount needs to be a number, such as 250 or 1/2.',
	'E-QTY-RANGE': 'In a range such as 2-3, put the smaller number first.',
	'E-SECTION-MISSING': 'Choose where the recipe goes.',
	'E-SLUG-FORMAT': 'The web address can only use small letters, numbers and hyphens.',
	'E-IMAGE-ALT': 'Describe the photo in a few words, for anyone who cannot see it.',
	'E-RELATED-UNRESOLVED': 'One of the related recipes is no longer in the cookbook.',
	'F-ID-EXISTS': 'There is already a recipe with this name. Change the name a little.',
	'W-TIME-MISSING': 'Add how long it takes, if you know.',
	'W-TITLE-LONG': 'The name is long, so it may be cut short when shared.',
	'W-SUMMARY-LONG': 'The summary is long, so it may be cut short when shared.',
	'W-IMAGE-SMALL': 'The photo is small, so it may look blurry on a big screen.',
	'W-TO-TASTE': 'For a seasoning with no amount, add "to taste" to its line.',
	'W-BRITISH-SPELLING': ({ message }) => {
		const [, written, british] = message.match(/'([^']+)' should be '([^']+)'/) ?? [];
		return british ? `"${written}" is spelt "${british}" in this cookbook.` : undefined;
	}
};

/** A check's message as a cook would want to read it. */
export function plainWords(result: CheckResult): string {
	const words = WORDS[result.id];
	const plain = typeof words === 'function' ? words(result) : words;
	if (plain) return plain;
	const message = result.message.trim();
	return `${message.charAt(0).toUpperCase()}${message.slice(1)}${/[.!?]$/.test(message) ? '' : '.'}`;
}

/** How much is left, said calmly: a new recipe starts with a few things to fill in. */
export function summarise(left: number): string {
	if (left === 0) return 'Ready to save';
	return left === 1 ? 'One thing left to fill in' : `${left} things left to fill in`;
}
