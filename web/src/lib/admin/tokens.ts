/** The inline tokens a step can hold; `docs/RECIPE_FORMAT.md` lists what each renders as. */

export interface TemperatureInput {
	celsius: number;
	/** The top of a range. A range takes no fan value. */
	max?: number;
	fan?: number;
	/** A meat or food temperature, kept in exact degrees. */
	internal?: boolean;
}

export function temperatureToken({ celsius, max, fan, internal }: TemperatureInput): string {
	const value = max !== undefined && max !== celsius ? `${celsius}-${max}` : `${celsius}`;
	const withFan = fan !== undefined && max === undefined && !internal ? `${value}/${fan}` : value;
	return `{temp:${withFan}${internal ? '!' : ''}}`;
}

export interface TimerInput {
	min: number;
	max?: number;
	unit: 'sec' | 'min' | 'hr';
	name?: string;
}

export function timerToken({ min, max, unit, name }: TimerInput): string {
	const suffix = unit === 'sec' ? 's' : unit === 'hr' ? 'h' : '';
	const span = max !== undefined && max !== min ? `${min}-${max}` : `${min}`;
	const label = name?.trim() ? `|${name.trim().replace(/[{}|]/g, '')}` : '';
	return `{timer:${span}${suffix}${label}}`;
}

/** Replaces the selection (or inserts at the cursor) and says where the cursor goes next. */
export function insertAt(
	text: string,
	start: number,
	end: number,
	insert: string
): { text: string; caret: number } {
	const from = Math.max(0, Math.min(start, text.length));
	const to = Math.max(from, Math.min(end, text.length));
	return { text: text.slice(0, from) + insert + text.slice(to), caret: from + insert.length };
}
