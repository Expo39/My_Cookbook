import { parseIngredientLine } from '$lib/core';
import {
	emptyGroup,
	emptyRow,
	rowFromIngredient,
	type GroupForm,
	type IngredientRow
} from './recipe-form';

const tidy = (line: string): string => line.split(/\s+/).filter(Boolean).join(' ');

/** A row as a cook would write it, worded so that `parseIngredientLine` reads it back the same. */
export function rowToLine(row: IngredientRow): string {
	const qty = row.qtyMax ? `${row.qtyMin}-${row.qtyMax}` : row.qtyMin;
	const unit = row.unit === 'floz' ? 'fl oz' : row.unit;
	const head = [row.prefix, qty, unit, row.item].map((part) => part.trim()).filter(Boolean);
	const note = row.note.trim() ? `, ${row.note.trim()}` : '';
	const optional = row.optional ? ' (optional)' : '';
	const taste = row.scale === 'toTaste' ? ' to taste' : '';
	return tidy(`${head.join(' ')}${note}${optional}${taste}`);
}

/** The written list for these parts: a part with a name starts with "Name:". */
export function groupsToText(groups: GroupForm[]): string {
	return groups
		.map((group) => {
			const lines = group.items.map(rowToLine).filter(Boolean);
			return group.name.trim() ? [`${group.name.trim()}:`, ...lines] : lines;
		})
		.filter((lines) => lines.length)
		.map((lines) => lines.join('\n'))
		.join('\n\n');
}

/** Reads one line; anything the reader cannot split up is kept whole as the ingredient's name. */
function readLine(line: string): IngredientRow {
	try {
		return rowFromIngredient(parseIngredientLine(line));
	} catch {
		return { ...emptyRow(), item: line };
	}
}

/**
 * Turns the written list back into parts and rows. A line that still reads exactly as an existing
 * row keeps that row, with everything the list cannot show (its key, scaling, other units); a part
 * keeps its total by its name.
 */
export function textToGroups(text: string, previous: GroupForm[]): GroupForm[] {
	const kept = new Map<string, IngredientRow[]>();
	for (const row of previous.flatMap((group) => group.items)) {
		const line = rowToLine(row);
		kept.set(line, [...(kept.get(line) ?? []), row]);
	}
	const parts = new Map(previous.map((group) => [group.name.trim().toLowerCase(), group]));

	const groups: GroupForm[] = [];
	const startPart = (name: string): GroupForm => {
		const old = parts.get(name.toLowerCase());
		parts.delete(name.toLowerCase());
		const group = { ...emptyGroup(), ...(old ? { ...old } : {}), name, items: [] };
		groups.push(group);
		return group;
	};

	let current: GroupForm | undefined;
	for (const raw of text.split('\n')) {
		const line = tidy(raw);
		if (!line) continue;
		if (line.endsWith(':') && line.length > 1) {
			current = startPart(line.slice(0, -1).trim());
			continue;
		}
		current ??= startPart('');
		const same = kept.get(line)?.shift();
		current.items.push(same ? { ...same, extra: { ...same.extra } } : readLine(line));
	}
	return groups.length ? groups : [{ ...emptyGroup(), items: [] }];
}
