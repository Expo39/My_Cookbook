import { describe, expect, it } from 'vitest';
import { tokensToWords, wordsToTokens } from './plain-steps';

const EN_DASH = String.fromCharCode(0x2013);

describe('steps written in plain words', () => {
	it('turns a time and an oven temperature into tokens', () => {
		expect(wordsToTokens('Bake for 25 minutes at 200C.')).toEqual({
			text: 'Bake for {timer:25} at {temp:200}.',
			found: [
				{ kind: 'timer', label: '25 min timer' },
				{ kind: 'temp', label: '200°C' }
			]
		});
	});

	it('lists what it found in the order it comes in the step', () => {
		expect(wordsToTokens('At 200C, bake 25 minutes, then 5 minutes more').found).toEqual([
			{ kind: 'temp', label: '200°C' },
			{ kind: 'timer', label: '25 min timer' },
			{ kind: 'timer', label: '5 min timer' }
		]);
	});

	it('reads ranges, seconds, hours and short unit words', () => {
		expect(wordsToTokens('Simmer 20-25 mins').text).toBe('Simmer {timer:20-25}');
		expect(wordsToTokens('Simmer 20 to 25 minutes').text).toBe('Simmer {timer:20-25}');
		expect(wordsToTokens(`Simmer 20${EN_DASH}25 minutes`).text).toBe('Simmer {timer:20-25}');
		expect(wordsToTokens('Whisk for 30 seconds').text).toBe('Whisk for {timer:30s}');
		expect(wordsToTokens('Prove for 1.5 hours').text).toBe('Prove for {timer:1.5h}');
		expect(wordsToTokens('Prove for 1,5 hrs').text).toBe('Prove for {timer:1.5h}');
	});

	it('adds hours and minutes into one timer', () => {
		expect(wordsToTokens('Roast for 2 hours and 15 minutes')).toEqual({
			text: 'Roast for {timer:135}',
			found: [{ kind: 'timer', label: '2 h 15 min timer' }]
		});
	});

	it('reads degree signs, Fahrenheit and a fan temperature', () => {
		expect(wordsToTokens('Heat the oven to 180°C (160°C fan)').text).toBe(
			'Heat the oven to {temp:180/160}'
		);
		expect(wordsToTokens('Bake at 350F').text).toBe('Bake at {temp:175}');
		expect(wordsToTokens('Bake at 180 degrees C').text).toBe('Bake at {temp:180}');
		expect(wordsToTokens('Bake at 180-200°C').text).toBe('Bake at {temp:180-200}');
	});

	it('leaves amounts, sizes and unlikely temperatures alone', () => {
		for (const text of [
			'Use a 23cm tin',
			'Add 400 g of flour',
			'Serves 4 people',
			'Cool to 20C',
			'Heat to 180 degrees'
		]) {
			expect(wordsToTokens(text)).toEqual({ text, found: [] });
		}
	});

	it('keeps tokens that are already written exactly as they are', () => {
		const text = 'Add {@flour} and bake {timer:10|Crust} at {temp:75!}, then 5 minutes more.';
		expect(wordsToTokens(text).text).toBe(
			'Add {@flour} and bake {timer:10|Crust} at {temp:75!}, then {timer:5} more.'
		);
	});
});

describe('tokens shown as plain words', () => {
	it('writes timers and oven temperatures as words', () => {
		expect(tokensToWords('Bake {timer:1} then {timer:25} at {temp:200}')).toBe(
			'Bake 1 minute then 25 minutes at 200°C'
		);
		expect(tokensToWords('{timer:20-25} {timer:30s} {timer:2h}')).toBe(
			'20-25 minutes 30 seconds 2 hours'
		);
		expect(tokensToWords('{temp:180/160} {temp:180-200}')).toBe('180°C (160°C fan) 180-200°C');
	});

	it('keeps named timers, food temperatures and ingredients as tokens', () => {
		const text = '{timer:10|Crust} {temp:75!} {@flour:amount}';
		expect(tokensToWords(text)).toBe(text);
	});

	it('round-trips through the words unchanged', () => {
		for (const text of [
			'Bake for {timer:25} at {temp:200}.',
			'Simmer {timer:20-25}, then rest {timer:30s}.',
			'Heat to {temp:180/160} and prove {timer:2h}.',
			'Bake at {temp:180-200} for {timer:1.5h}.'
		]) {
			expect(wordsToTokens(tokensToWords(text)).text).toBe(text);
		}
	});
});
