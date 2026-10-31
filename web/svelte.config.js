import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import adapter from '@sveltejs/adapter-static';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

const config = JSON.parse(
	readFileSync(new URL('../cookbook.config.json', import.meta.url), 'utf8')
);
const aiEndpoint = process.env.PUBLIC_AI_ENDPOINT || config.ai?.endpoint || '';

/** The theme script in app.html runs before the page draws; its hash is read from the file. */
const themeScript = readFileSync(new URL('./src/app.html', import.meta.url), 'utf8').match(
	/<script>([\s\S]*?)<\/script>/
)?.[1];
const themeHash = themeScript
	? [`sha256-${createHash('sha256').update(themeScript).digest('base64')}`]
	: [];

const TURNSTILE = 'https://challenges.cloudflare.com';

/** @type {import('@sveltejs/kit').Config} */
export default {
	preprocess: vitePreprocess(),
	kit: {
		adapter: adapter({ pages: 'build', assets: 'build', fallback: '404.html', strict: true }),
		output: { bundleStrategy: 'single' },
		paths: { base: process.env.BASE_PATH ?? '' },
		// Only the site's own scripts run, and it talks only to the services it uses: the AI worker,
		// GitHub for the owner's edits and Cloudflare's bot check. Inline styles stay allowed for
		// Svelte's transitions; WebAssembly needs 'wasm-unsafe-eval' to start the recipe core.
		csp: {
			mode: 'auto',
			directives: {
				'default-src': ['self'],
				'script-src': ['self', 'wasm-unsafe-eval', ...themeHash, TURNSTILE],
				'style-src': ['self', 'unsafe-inline'],
				'img-src': ['self', 'data:', 'blob:'],
				'font-src': ['self'],
				'media-src': ['self'],
				'connect-src': [
					'self',
					...(aiEndpoint ? [aiEndpoint] : []),
					'https://api.github.com',
					TURNSTILE
				],
				'frame-src': [TURNSTILE],
				'worker-src': ['self'],
				'manifest-src': ['self'],
				'object-src': ['none'],
				'base-uri': ['self'],
				'form-action': ['self']
			}
		}
	}
};
