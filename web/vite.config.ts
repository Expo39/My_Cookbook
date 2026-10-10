import { readdirSync, readFileSync } from 'node:fs';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vitest/config';

/** Ids of the share cards the build has produced under static/cards (none until they exist). */
function cardIds(): string[] {
	try {
		return readdirSync('static/cards', { recursive: true, encoding: 'utf8' })
			.filter((file) => file.endsWith('.png'))
			.map((file) => file.slice(0, -'.png'.length));
	} catch {
		return [];
	}
}

/** Site settings from the repo root; missing or unreadable means every optional feature is off. */
function siteConfig(): unknown {
	try {
		return JSON.parse(readFileSync('../cookbook.config.json', 'utf8'));
	} catch {
		return {};
	}
}

export default defineConfig({
	plugins: [sveltekit()],
	define: {
		__BACKEND__: JSON.stringify(process.env.PUBLIC_BACKEND ?? 'static'),
		__CARDS__: JSON.stringify(cardIds()),
		__SITE_CONFIG__: JSON.stringify(siteConfig()),
		__SITE_URL__: JSON.stringify(process.env.PUBLIC_SITE_URL ?? 'https://expo39.github.io')
	},
	server: { port: 5173, strictPort: true },
	preview: { port: 4173, strictPort: true },
	test: {
		environment: 'happy-dom',
		include: ['src/**/*.test.ts']
	}
});
