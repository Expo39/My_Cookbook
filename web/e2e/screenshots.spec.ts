import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import { waitForCore } from './helpers';

// Review screenshots, not part of the normal run: SCREENSHOTS=1 selects this spec alone.
const out = process.env.SHOTS_DIR ?? 'test-results/shots';
const widths = [375, 768, 1024, 1440];
const pages = [
	{ name: 'home', path: './' },
	{ name: 'section', path: 'first-courses' },
	{ name: 'recipe-wellington', path: 'main-courses/beef-steak/beef-wellington', core: true },
	{ name: 'search', path: 'search?q=pasta', core: true }
];

test.setTimeout(240_000);

test('writes screenshots of the main pages in both themes', async ({ page }) => {
	mkdirSync(out, { recursive: true });
	const overflowing: string[] = [];

	for (const scheme of ['light', 'dark'] as const) {
		await page.emulateMedia({ colorScheme: scheme, reducedMotion: 'reduce' });
		for (const width of widths) {
			await page.setViewportSize({ width, height: width < 768 ? 812 : 900 });
			for (const { name, path, core } of pages) {
				await page.goto(path);
				if (core) await waitForCore(page).catch(() => page.waitForLoadState('networkidle'));
				await page.waitForLoadState('networkidle');
				const label = `${name}-${width}-${scheme}`;
				const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
				if (scrollWidth > width) overflowing.push(`${label} (${scrollWidth}px)`);
				await page.screenshot({ path: join(out, `${label}.png`), fullPage: true });
			}
		}
	}

	await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'reduce' });
	await page.setViewportSize({ width: 375, height: 812 });
	await page.goto('main-courses/beef-steak/beef-wellington?serves=8&u=us');
	await waitForCore(page);
	await page.getByRole('tab', { name: 'Method' }).click();
	await page.screenshot({ path: join(out, 'recipe-wellington-375-method-scaled.png') });
	await page.getByRole('button', { name: 'Settings' }).click();
	await expect(page.getByRole('dialog')).toBeVisible();
	await page.screenshot({ path: join(out, 'drawer-375-light.png') });

	expect(overflowing).toEqual([]);
});
