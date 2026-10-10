/** A recipe or folder name: lowercase letters and digits, single hyphens between them. */
export function slugify(text: string): string {
	return text
		.normalize('NFD')
		.replace(/[\u0300-\u036f]/g, '')
		.toLowerCase()
		.replace(/&/g, ' and ')
		.replace(/['\u2019]/g, '')
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '');
}

export const isSlug = (text: string): boolean => /^[a-z0-9]+(-[a-z0-9]+)*$/.test(text);

/** An ingredient key that is not yet taken, made from the last word of the name. */
export function suggestKey(item: string, taken: Iterable<string>): string {
	const used = new Set(taken);
	const stem = slugify(item).split('-').filter(Boolean).at(-1) ?? 'ingredient';
	let key = stem;
	for (let n = 2; used.has(key); n++) key = `${stem}-${n}`;
	return key;
}
