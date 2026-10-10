import { formatMinutes, servingsText } from '$lib/recipe/format';
import { siteRoot } from '$lib/seo/site';
import type { Recipe, RecipeCard, ScaledRecipe } from '$lib/types/recipe';
import { splitAmount, type Content, type QrMatrix } from './layout';

export interface ContentInput {
	card: RecipeCard;
	recipe: Recipe;
	/** The recipe as the reader sees it: scaled, in their units and with their variants. */
	view: ScaledRecipe;
	/** Titles of the sections the recipe sits in, outermost first. */
	section: string[];
	qr: QrMatrix | null;
	hasPhoto: boolean;
	/** "@handle" when the site shows its Instagram account. */
	instagram?: string;
}

/** The short address printed on the card for people who will not scan the code. */
export const shortUrl = (root = siteRoot): string => root.replace(/^[a-z]+:\/\//, '');

export function cardContent({
	card,
	recipe,
	view,
	section,
	qr,
	hasPhoto,
	instagram
}: ContentInput): Content {
	return {
		label: section.join(' / '),
		title: recipe.title,
		titleLocal: recipe.titleLocal ?? undefined,
		total: card.times.total ? formatMinutes(card.times.total) : undefined,
		serves: servingsText(view.servings, recipe.servingsNoun),
		ingredients: view.groups.flatMap((group) =>
			group.items.map((item) => splitAmount(item.text, item.amount?.text))
		),
		qr,
		urlText: shortUrl(),
		hasPhoto,
		instagram
	};
}
