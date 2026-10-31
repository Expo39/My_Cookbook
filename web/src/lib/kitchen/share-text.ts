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

/** The recipe as the reader sees it, as plain text to paste anywhere: their servings and units. */
export function recipeText(
	title: string,
	serves: string,
	view: ScaledRecipe,
	link?: string
): string {
	const lines = [title, serves, '', 'Ingredients'];
	for (const group of view.groups) {
		if (group.name) lines.push('', group.name);
		for (const item of group.items) lines.push(`- ${item.text}`);
	}
	lines.push('', 'Method');
	view.steps.forEach((step, i) => {
		if (step.heading) lines.push('', step.heading);
		lines.push(`${i + 1}. ${step.segments.map((segment) => segment.text).join('')}`);
	});
	if (link) lines.push('', link);
	return lines.join('\n');
}
