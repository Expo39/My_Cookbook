import type { Pan, PanShape, ScaleRequest, Unit, UnitSystem } from '$lib/types/recipe';

export type ScaleChoice =
	| { kind: 'written' }
	| { kind: 'servings'; servings: number }
	| { kind: 'multiplier'; multiplier: number }
	| { kind: 'have'; key: string; qty: number; unit?: Unit }
	| { kind: 'pan'; pan: Pan };

export interface ViewState {
	scale: ScaleChoice;
	/** `null` follows the reader's default units. */
	system: UnitSystem | null;
	variants: Record<string, string>;
}

export const initialState = (): ViewState => ({
	scale: { kind: 'written' },
	system: null,
	variants: {}
});

const MANAGED = ['serves', 'x', 'have', 'pan', 'u', 'v'];
const UNITS: Unit[] = ['g', 'kg', 'ml', 'l', 'tsp', 'tbsp', 'cup', 'oz', 'lb', 'floz', 'pinch'];
const NUMBER = String.raw`\d+(?:\.\d+)?`;
const HAVE = new RegExp(`^([\\w-]+):(${NUMBER})([a-z]*)$`);
const PAN = new RegExp(`^(round|square|rect):(${NUMBER}(?:x${NUMBER})?)(?:@(${NUMBER}))?$`);

const positive = (text: string | null, max: number): number | undefined => {
	const value = text === null || text === '' ? NaN : Number(text);
	return Number.isFinite(value) && value > 0 && value <= max ? value : undefined;
};

const plain = (value: number) => String(Number(value.toFixed(3)));

function parseScale(params: URLSearchParams): ScaleChoice {
	const pan = PAN.exec(params.get('pan') ?? '');
	if (pan) {
		const size = pan[2].split('x').map(Number);
		const valid =
			pan[1] === 'round' ? size.length === 1 : pan[1] === 'rect' ? size.length === 2 : true;
		if (valid && size.every((n) => n > 0)) {
			const depth = pan[3] ? Number(pan[3]) : undefined;
			return { kind: 'pan', pan: { shape: pan[1] as PanShape, size, ...(depth ? { depth } : {}) } };
		}
	}
	const have = HAVE.exec(params.get('have') ?? '');
	if (have && Number(have[2]) > 0 && (!have[3] || UNITS.includes(have[3] as Unit))) {
		return {
			kind: 'have',
			key: have[1],
			qty: Number(have[2]),
			...(have[3] ? { unit: have[3] as Unit } : {})
		};
	}
	const multiplier = positive(params.get('x'), 100);
	if (multiplier) return { kind: 'multiplier', multiplier };
	const servings = positive(params.get('serves'), 999);
	if (servings) return { kind: 'servings', servings };
	return { kind: 'written' };
}

export function parseState(search: string): ViewState {
	const params = new URLSearchParams(search);
	const variants: Record<string, string> = {};
	for (const pair of (params.get('v') ?? '').split(',')) {
		const [key, option] = pair.split(':');
		if (key && option) variants[key] = option;
	}
	const unit = params.get('u');
	return {
		scale: parseScale(params),
		system: unit === 'us' || unit === 'metric' ? unit : null,
		variants
	};
}

function scaleParam(scale: ScaleChoice): [string, string] | undefined {
	switch (scale.kind) {
		case 'servings':
			return ['serves', plain(scale.servings)];
		case 'multiplier':
			return ['x', plain(scale.multiplier)];
		case 'have':
			return ['have', `${scale.key}:${plain(scale.qty)}${scale.unit ?? ''}`];
		case 'pan': {
			const { shape, size, depth } = scale.pan;
			return ['pan', `${shape}:${size.map(plain).join('x')}${depth ? `@${plain(depth)}` : ''}`];
		}
		default:
			return undefined;
	}
}

// Colons and commas are legal in a query string and keep shared links readable.
const encode = (text: string) =>
	encodeURIComponent(text).replace(/%3A/gi, ':').replace(/%2C/gi, ',').replace(/%40/g, '@');

/** The query string for `state`, keeping any parameters of `current` that are not view state (e.g. `cook`). */
export function writeState(current: string, state: ViewState): string {
	const kept = [...new URLSearchParams(current)].filter(([key]) => !MANAGED.includes(key));
	const written: [string, string][] = [];
	const scale = scaleParam(state.scale);
	if (scale) written.push(scale);
	if (state.system) written.push(['u', state.system]);
	const variants = Object.entries(state.variants).map(([key, option]) => `${key}:${option}`);
	if (variants.length) written.push(['v', variants.join(',')]);
	const query = [...written, ...kept]
		.map(([key, value]) => (value === '' ? encode(key) : `${encode(key)}=${encode(value)}`))
		.join('&');
	return query ? `?${query}` : '';
}

export function toRequest(scale: ScaleChoice): ScaleRequest | undefined {
	switch (scale.kind) {
		case 'servings':
			return { servings: scale.servings };
		case 'multiplier':
			return { multiplier: scale.multiplier };
		case 'have':
			return { have: { key: scale.key, qty: scale.qty, unit: scale.unit ?? null } };
		case 'pan':
			return { pan: scale.pan };
		default:
			return undefined;
	}
}
