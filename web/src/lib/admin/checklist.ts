import type { CheckResult } from '$lib/types/recipe';

export interface CheckGroup {
	id: string;
	label: string;
	level: 'error' | 'warning';
	results: CheckResult[];
}

const GROUPS: { id: string; label: string; level: 'error' | 'warning'; match: RegExp }[] = [
	{
		id: 'amounts',
		label: 'Amounts and scaling',
		level: 'error',
		match: /^E-(QTY|SCALE|SCALING|UNIT|PAN)/
	},
	{
		id: 'method',
		label: 'Method and linked steps',
		level: 'error',
		match: /^E-(TOKEN|KEY|VARIANT)/
	},
	{
		id: 'links',
		label: 'Photo and related recipes',
		level: 'error',
		match: /^E-(IMAGE|RELATED|REMOVE)/
	},
	{ id: 'advice', label: 'Advice', level: 'warning', match: /^W-/ }
];

const BASICS = { id: 'basics', label: 'Details and address', level: 'error' as const };

/** The checklist as the editor shows it: a few named checks, each ticked until a result lands in it. */
export function checkGroups(results: CheckResult[]): CheckGroup[] {
	const groups: CheckGroup[] = [BASICS, ...GROUPS].map(({ id, label, level }) => ({
		id,
		label,
		level,
		results: []
	}));
	for (const result of results) {
		const target = GROUPS.find((group) => group.match.test(result.id))?.id ?? BASICS.id;
		groups.find((group) => group.id === target)?.results.push(result);
	}
	return groups;
}

export function summarise(errors: number, warnings: number): string {
	const plural = (n: number, one: string, other: string) => `${n} ${n === 1 ? one : other}`;
	if (errors > 0) return `${plural(errors, 'problem', 'problems')} to fix before saving`;
	if (warnings > 0) return `Ready to save, with ${plural(warnings, 'suggestion', 'suggestions')}`;
	return 'Every check passes';
}
