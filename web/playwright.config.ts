import { defineConfig, devices } from '@playwright/test';

const basePath = process.env.BASE_PATH ?? '';
const port = 4173;

// E2E_PREBUILT=1 serves an existing `build/` directory (as downloaded in CI) without building.
const command = process.env.E2E_PREBUILT
	? 'node scripts/serve-build.mjs'
	: 'pnpm build && vite preview --host 0.0.0.0';

export default defineConfig({
	testDir: 'e2e',
	fullyParallel: true,
	forbidOnly: !!process.env.CI,
	retries: 0,
	timeout: 15_000,
	expect: { timeout: 3_000 },
	reporter: process.env.CI ? [['github'], ['list']] : 'list',
	use: {
		baseURL: `http://localhost:${port}${basePath}/`,
		reducedMotion: 'reduce',
		trace: 'retain-on-failure'
	},
	projects: process.env.SCREENSHOTS
		? [
				{
					name: 'screenshots',
					testMatch: '**/screenshots.spec.ts',
					use: { ...devices['Desktop Chrome'] }
				}
			]
		: [
				{
					name: 'chromium',
					testIgnore: ['**/mobile.spec.ts', '**/screenshots.spec.ts'],
					use: { ...devices['Desktop Chrome'] }
				},
				{ name: 'mobile', testMatch: '**/mobile.spec.ts', use: { ...devices['Pixel 7'] } },
				...(process.env.FULL_E2E
					? [
							{
								name: 'mobile-webkit',
								testMatch: '**/mobile.spec.ts',
								use: { ...devices['iPhone 14'] }
							}
						]
					: [])
			],
	webServer: {
		command,
		url: `http://localhost:${port}${basePath}/`,
		reuseExistingServer: false,
		timeout: 120_000
	}
});
