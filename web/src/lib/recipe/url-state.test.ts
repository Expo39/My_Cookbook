import { describe, expect, it } from 'vitest';
import {
	initialState,
	parseState,
	toRequest,
	writeState,
	type ScaleChoice,
	type ViewState
} from './url-state';

const roundTrip = (state: ViewState, current = '') => parseState(writeState(current, state));

describe('recipe URL state', () => {
	it('leaves the URL clean when nothing has changed', () => {
		expect(writeState('', initialState())).toBe('');
		expect(parseState('')).toEqual(initialState());
	});

	it('writes a readable query and reads it back', () => {
		const state: ViewState = {
			scale: { kind: 'servings', servings: 6 },
			system: 'us',
			variants: { vanilla: 'pods' }
		};
		expect(writeState('', state)).toBe('?serves=6&u=us&v=vanilla:pods');
		expect(parseState('?serves=6&u=us&v=vanilla:pods')).toEqual(state);
	});

	it.each<ScaleChoice>([
		{ kind: 'multiplier', multiplier: 0.5 },
		{ kind: 'have', key: 'short-pasta', qty: 500, unit: 'g' },
		{ kind: 'have', key: 'egg', qty: 6 },
		{ kind: 'pan', pan: { shape: 'round', size: [23] } },
		{ kind: 'pan', pan: { shape: 'rect', size: [20, 30.5], depth: 5 } }
	])('round-trips a $kind scale', (scale) => {
		expect(roundTrip({ ...initialState(), scale }).scale).toEqual(scale);
	});

	it('encodes each scale in its own parameter', () => {
		const query = (scale: ViewState['scale']) => writeState('', { ...initialState(), scale });
		expect(query({ kind: 'multiplier', multiplier: 2 })).toBe('?x=2');
		expect(query({ kind: 'have', key: 'flour', qty: 250, unit: 'g' })).toBe('?have=flour:250g');
		expect(query({ kind: 'pan', pan: { shape: 'rect', size: [20, 30], depth: 5 } })).toBe(
			'?pan=rect:20x30@5'
		);
	});

	it('keeps parameters that are not view state, such as cook', () => {
		const state: ViewState = { ...initialState(), scale: { kind: 'servings', servings: 8 } };
		expect(writeState('?cook&serves=2', state)).toBe('?serves=8&cook');
		expect(writeState('?serves=2&cook', initialState())).toBe('?cook');
	});

	it.each([
		'?serves=0',
		'?serves=-3',
		'?serves=abc',
		'?x=0',
		'?x=1000',
		'?have=flour',
		'?pan=round:'
	])('ignores the unusable value in %s', (search) => {
		expect(parseState(search).scale).toEqual({ kind: 'written' });
	});

	it('ignores an unknown unit system and malformed variants', () => {
		const parsed = parseState('?u=imperial&v=vanilla,:x,flavour:mint');
		expect(parsed.system).toBeNull();
		expect(parsed.variants).toEqual({ flavour: 'mint' });
	});

	it('turns a scale into a core request', () => {
		expect(toRequest({ kind: 'written' })).toBeUndefined();
		expect(toRequest({ kind: 'servings', servings: 6 })).toEqual({ servings: 6 });
		expect(toRequest({ kind: 'have', key: 'egg', qty: 3 })).toEqual({
			have: { key: 'egg', qty: 3, unit: null }
		});
	});
});
