import { temperatureToken, timerToken } from './tokens';

/**
 * Steps written in plain words for people who have never seen a recipe token. "Bake for 25 minutes at
 * 200°C" is saved as "Bake for {timer:25} at {temp:200}", so the cook gets a timer and converted
 * temperatures; reopening the recipe turns the tokens back into the same words.
 */

export interface Found {
	kind: 'timer' | 'temp';
	label: string;
}

const TOKEN = /(\{[^{}]*\})/;
const number = (text: string) => Number(text.replace(',', '.'));
const plural = (value: number, one: string) => `${value} ${one}${value === 1 ? '' : 's'}`;

const UNIT: Record<string, 'sec' | 'min' | 'hr'> = {
	s: 'sec',
	sec: 'sec',
	secs: 'sec',
	second: 'sec',
	seconds: 'sec',
	min: 'min',
	mins: 'min',
	minute: 'min',
	minutes: 'min',
	h: 'hr',
	hr: 'hr',
	hrs: 'hr',
	hour: 'hr',
	hours: 'hr'
};

const NUM = String.raw`\d+(?:[.,]\d+)?`;
const RANGE = String.raw`(?:\s*(?:-|\u2013|to)\s*(${NUM}))?`;
const HOURS_AND_MINUTES = new RegExp(
	String.raw`\b(\d+)\s*(?:hours?|hrs?)\s*(?:and\s*)?(\d+)\s*(?:minutes?|mins?)\b`,
	'gi'
);
const TIMER = new RegExp(
	String.raw`\b(${NUM})${RANGE}\s*(seconds?|secs?|minutes?|mins?|hours?|hrs?)\b`,
	'gi'
);
const TEMP = new RegExp(
	String.raw`\b(\d{2,3})(?:\s*(?:-|\u2013|to)\s*(\d{2,3}))?\s*(?:°\s*|degrees\s*)?([CF])\b` +
		String.raw`(?:\s*\(\s*(\d{2,3})\s*°?\s*C?\s*fan\s*\))?`,
	'gi'
);

const toCelsius = (value: number, scale: string) =>
	scale.toUpperCase() === 'F' ? Math.round(((value - 32) * 5) / 9 / 5) * 5 : value;

/** Swaps the plain text between tokens, leaving tokens already written exactly as they are. */
function eachPlain(text: string, swap: (plain: string) => string): string {
	return text
		.split(TOKEN)
		.map((part) => (TOKEN.test(part) ? part : swap(part)))
		.join('');
}

export function wordsToTokens(text: string): { text: string; found: Found[] } {
	const found: (Found & { token: string })[] = [];
	const out = eachPlain(text, (plain) =>
		plain
			.replace(HOURS_AND_MINUTES, (_, hours, mins) => {
				const token = timerToken({ min: Number(hours) * 60 + Number(mins), unit: 'min' });
				found.push({ kind: 'timer', label: `${hours} h ${mins} min timer`, token });
				return token;
			})
			.replace(TIMER, (match, from, to, word) => {
				const unit = UNIT[word.toLowerCase()];
				if (!unit) return match;
				const min = number(from);
				const max = to ? number(to) : undefined;
				const short = unit === 'sec' ? 'sec' : unit === 'hr' ? 'h' : 'min';
				const token = timerToken({ min, max, unit });
				found.push({ kind: 'timer', label: `${from}${to ? `-${to}` : ''} ${short} timer`, token });
				return token;
			})
			.replace(TEMP, (match, from, to, scale, fan) => {
				const celsius = toCelsius(Number(from), scale);
				const max = to ? toCelsius(Number(to), scale) : undefined;
				if (celsius < 30 || celsius > 300) return match;
				const fanDegrees = fan ? Number(fan) : undefined;
				const token = temperatureToken({ celsius, max, fan: fanDegrees });
				found.push({
					token,
					kind: 'temp',
					label: `${celsius}${max ? `-${max}` : ''}°C${fanDegrees ? ` (${fanDegrees}°C fan)` : ''}`
				});
				return token;
			})
	);
	return { text: out, found: inReadingOrder(out, found) };
}

/** Times are found before temperatures; the chips follow the order they come in the step. */
function inReadingOrder(text: string, found: (Found & { token: string })[]): Found[] {
	const from: Record<string, number> = {};
	return found
		.map(({ token, ...item }) => {
			const at = text.indexOf(token, from[token] ?? 0);
			from[token] = at + 1;
			return { at, item };
		})
		.sort((a, b) => a.at - b.at)
		.map(({ item }) => item);
}

const TIMER_TOKEN = /^\{timer:([\d.]+)(?:-([\d.]+))?(s|h)?\}$/;
const TEMP_TOKEN = /^\{temp:(\d+)(?:-(\d+))?(?:\/(\d+))?\}$/;

/** The words a timer or oven temperature token stands for. Named timers and food temperatures stay. */
export function tokensToWords(text: string): string {
	return text
		.split(TOKEN)
		.map((part) => {
			const timer = TIMER_TOKEN.exec(part);
			if (timer) {
				const [, from, to, suffix] = timer;
				const word = suffix === 's' ? 'second' : suffix === 'h' ? 'hour' : 'minute';
				return to ? `${from}-${to} ${word}s` : plural(Number(from), word);
			}
			const temp = TEMP_TOKEN.exec(part);
			if (temp) {
				const [, from, to, fan] = temp;
				return `${from}${to ? `-${to}` : ''}°C${fan ? ` (${fan}°C fan)` : ''}`;
			}
			return part;
		})
		.join('');
}
