import type { ScaledRecipe } from '$lib/types/recipe';

export type TextShareOutcome = 'shared' | 'copied' | 'failed' | 'cancelled';

/** Opens the system share sheet with plain text when there is one, and otherwise copies the text. */
export async function shareText(title: string, text: string): Promise<TextShareOutcome> {
	if (typeof navigator.share === 'function') {
		try {
			await navigator.share({ title, text });
			return 'shared';
		} catch (error) {
			if (error instanceof DOMException && error.name === 'AbortError') return 'cancelled';
		}
	}
	try {
		await navigator.clipboard.writeText(text);
		return 'copied';
	} catch {
		return 'failed';
	}
}

export interface RecipeTextParts {
	title: string;
	/** The servings as the reader has them, e.g. "6 servings". */
	serves: string;
	view: ScaledRecipe;
	localTitle?: string | null;
	summary?: string;
	/** Labelled times in order, e.g. [["Prep", "20 min"], ["Total", "1 hr"]]. */
	times?: [string, string][];
	/** Left out for a recipe kept on the device, which has no link. */
	link?: string;
}

/**
 * The whole recipe as the reader sees it, as plain text to paste anywhere: their servings, units
 * and variants, with the summary, times, stages and tips, and the link last.
 */
export function recipeText({
	title,
	serves,
	view,
	localTitle,
	summary,
	times = [],
	link
}: RecipeTextParts): string {
	const lines = [title];
	if (localTitle) lines.push(localTitle);
	if (summary) lines.push('', summary);
	lines.push(
		'',
		[serves, ...times.map(([label, value]) => `${label} ${value}`)].join(' | '),
		'',
		'Ingredients'
	);
	for (const group of view.groups) {
		if (group.name) lines.push('', group.name);
		for (const item of group.items) lines.push(`- ${item.text}`);
	}
	lines.push('', 'Method');
	view.steps.forEach((step, i) => {
		if (step.heading) lines.push('', step.heading);
		lines.push(`${i + 1}. ${step.segments.map((segment) => segment.text).join('')}`);
	});
	if (view.tips?.length)
		lines.push('', view.tips.length > 1 ? "Chef's tips" : "Chef's tip", ...view.tips);
	if (link) lines.push('', link);
	return lines.join('\n');
}
