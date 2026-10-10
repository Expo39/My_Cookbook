import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vitest/config';

/** Site settings from the repo root, which the card renderer reads too. Missing or unreadable means defaults. */
function siteConfig(): { site?: { url?: string }; ai?: { endpoint?: string } } {
	try {
		return JSON.parse(readFileSync('../cookbook.config.json', 'utf8'));
	} catch {
		return {};
	}
}

/** The commit the site is built from: CI sets `GITHUB_SHA`; elsewhere git is asked, and empty means unknown. */
function builtCommit(): string {
	if (process.env.GITHUB_SHA) return process.env.GITHUB_SHA;
	try {
		return execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8', stdio: 'pipe' }).trim();
	} catch {
		return '';
	}
}

const config = siteConfig();

export default defineConfig(({ mode }) => ({
	plugins: [sveltekit()],
	// Components are mounted in the tests, which needs Svelte's browser build.
	resolve: mode === 'test' ? { conditions: ['browser'] } : {},
	define: {
		__BACKEND__: JSON.stringify(process.env.PUBLIC_BACKEND ?? 'static'),
		__BUILD_SHA__: JSON.stringify(builtCommit()),
		__SITE_CONFIG__: JSON.stringify(config),
		__SITE_URL__: JSON.stringify(
			process.env.PUBLIC_SITE_URL || config.site?.url || 'https://expo39.github.io'
		),
		__AI_ENDPOINT__: JSON.stringify(process.env.PUBLIC_AI_ENDPOINT || config.ai?.endpoint || '')
	},
	// The share card layout in assets/ is shared with the Rust renderer.
	server: { port: 5173, strictPort: true, fs: { allow: ['..'] } },
	preview: { port: 4173, strictPort: true },
	test: {
		environment: 'happy-dom',
		include: ['src/**/*.test.ts'],
		testTimeout: 2_000
	}
}));
