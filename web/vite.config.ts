import { readFileSync } from 'node:fs';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vitest/config';

/** The deployed origin comes from `site.json`, which the card renderer reads too. */
const site: { url: string } = JSON.parse(
	readFileSync(new URL('../site.json', import.meta.url), 'utf8')
);

export default defineConfig(({ mode }) => ({
	plugins: [sveltekit()],
	// Components are mounted in the tests, which needs Svelte's browser build.
	resolve: mode === 'test' ? { conditions: ['browser'] } : {},
	define: {
		__BACKEND__: JSON.stringify(process.env.PUBLIC_BACKEND ?? 'static'),
		__SITE_URL__: JSON.stringify(process.env.PUBLIC_SITE_URL ?? site.url)
	},
	// The share card layout in assets/ is shared with the Rust renderer.
	server: { port: 5173, strictPort: true, fs: { allow: ['..'] } },
	preview: { port: 4173, strictPort: true },
	test: {
		environment: 'happy-dom',
		include: ['src/**/*.test.ts']
	}
}));
