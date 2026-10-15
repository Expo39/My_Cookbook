/**
 * Cloudflare Turnstile, which the Worker asks for only when it has `TURNSTILE_SECRET`. The site key
 * comes from PUBLIC_TURNSTILE_SITE_KEY or `ai.turnstileSiteKey`; without one nothing is loaded.
 */

interface Turnstile {
	render(
		container: HTMLElement,
		options: {
			sitekey: string;
			size: 'invisible' | 'flexible';
			appearance: 'interaction-only';
			execution: 'execute';
			callback: (token: string) => void;
			'error-callback': () => void;
		}
	): string;
	execute(widget: string): void;
	reset(widget: string): void;
}

declare global {
	interface Window {
		turnstile?: Turnstile;
	}
}

const SCRIPT = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
const WAIT_MILLISECONDS = 15_000;

let loading: Promise<Turnstile> | undefined;
let widget: string | undefined;
let pending: { resolve: (token: string) => void; reject: (error: Error) => void } | undefined;

function load(): Promise<Turnstile> {
	loading ??= new Promise<Turnstile>((resolve, reject) => {
		const script = document.createElement('script');
		script.src = SCRIPT;
		script.async = true;
		script.onload = () =>
			window.turnstile ? resolve(window.turnstile) : reject(new Error('turnstile'));
		script.onerror = () => {
			loading = undefined;
			reject(new Error('turnstile'));
		};
		document.head.append(script);
	});
	return loading;
}

/** A fresh, single-use token, or `undefined` when the site has no Turnstile key. */
export async function turnstileToken(
	siteKey: string = __TURNSTILE_SITE_KEY__
): Promise<string | undefined> {
	if (!siteKey || typeof document === 'undefined') return undefined;
	const api = await load();
	if (!widget) {
		const box = document.createElement('div');
		box.className = 'turnstile';
		document.body.append(box);
		widget = api.render(box, {
			sitekey: siteKey,
			size: 'flexible',
			appearance: 'interaction-only',
			execution: 'execute',
			callback: (token) => pending?.resolve(token),
			'error-callback': () => pending?.reject(new Error('turnstile'))
		});
	} else {
		api.reset(widget);
	}
	const id = widget;
	return new Promise<string>((resolve, reject) => {
		const timer = setTimeout(() => reject(new Error('turnstile')), WAIT_MILLISECONDS);
		pending = {
			resolve: (token) => (clearTimeout(timer), resolve(token)),
			reject: (error) => (clearTimeout(timer), reject(error))
		};
		api.execute(id);
	});
}
