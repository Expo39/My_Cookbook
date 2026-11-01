import { describe, expect, it } from 'vitest';
import { insertAt, temperatureToken, timerToken } from './tokens';

describe('temperatureToken', () => {
	it.each([
		[{ celsius: 200 }, '{temp:200}'],
		[{ celsius: 200, fan: 180 }, '{temp:200/180}'],
		[{ celsius: 180, max: 200 }, '{temp:180-200}'],
		[{ celsius: 180, max: 200, fan: 160 }, '{temp:180-200}'],
		[{ celsius: 63, internal: true }, '{temp:63!}'],
		[{ celsius: 52, max: 55, internal: true }, '{temp:52-55!}'],
		[{ celsius: 63, fan: 50, internal: true }, '{temp:63!}'],
		[{ celsius: 200, max: 200 }, '{temp:200}']
	])('writes %j as %s', (input, token) => {
		expect(temperatureToken(input)).toBe(token);
	});
});

describe('timerToken', () => {
	it.each([
		[{ min: 12, unit: 'min' as const }, '{timer:12}'],
		[{ min: 12, max: 15, unit: 'min' as const }, '{timer:12-15}'],
		[{ min: 30, unit: 'sec' as const }, '{timer:30s}'],
		[{ min: 3, max: 4, unit: 'hr' as const }, '{timer:3-4h}'],
		[{ min: 12, unit: 'min' as const, name: ' pasta ' }, '{timer:12|pasta}'],
		[{ min: 5, unit: 'min' as const, name: 'a|b{c}' }, '{timer:5|abc}'],
		[{ min: 5, unit: 'min' as const, name: '   ' }, '{timer:5}']
	])('writes %j as %s', (input, token) => {
		expect(timerToken(input)).toBe(token);
	});
});

describe('insertAt', () => {
	it('inserts at the cursor and moves the caret past it', () => {
		expect(insertAt('Boil .', 5, 5, '{timer:5}')).toEqual({
			text: 'Boil {timer:5}.',
			caret: 14
		});
	});

	it('replaces a selection', () => {
		expect(insertAt('Heat to 200', 8, 11, '{temp:200}')).toEqual({
			text: 'Heat to {temp:200}',
			caret: 18
		});
	});

	it('keeps positions inside the text', () => {
		expect(insertAt('ab', 9, 20, 'c')).toEqual({ text: 'abc', caret: 3 });
		expect(insertAt('ab', -4, -1, 'c')).toEqual({ text: 'cab', caret: 1 });
	});
});
