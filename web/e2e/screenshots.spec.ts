import { mkdirSync, readFileSync } from 'node:fs';
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

test('writes screenshots of cook mode, the timer strip and the shopping list', async ({ page }) => {
	mkdirSync(out, { recursive: true });
	const wellington = 'main-courses/beef-steak/beef-wellington';

	await page.emulateMedia({ colorScheme: 'dark', reducedMotion: 'reduce' });
	await page.setViewportSize({ width: 375, height: 812 });
	await page.goto(`${wellington}?cook=10`);
	await waitForCore(page).catch(() => page.waitForLoadState('networkidle'));
	await page
		.getByRole('dialog')
		.getByRole('button', { name: /^Start 20-25 min timer/ })
		.click();
	await page.screenshot({ path: join(out, 'cook-mode-375-dark.png') });

	await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'reduce' });
	await page.setViewportSize({ width: 1440, height: 900 });
	await page.goto(`${wellington}?cook=5`);
	await page.screenshot({ path: join(out, 'cook-mode-1440-light.png') });
	await page.goto('desserts/french-classics/creme-brulee?cook=1');
	await waitForCore(page);
	await page.screenshot({ path: join(out, 'cook-mode-1440-light-ingredients.png') });
	await page.setViewportSize({ width: 1024, height: 768 });
	await page.screenshot({ path: join(out, 'cook-mode-1024-light.png') });
	await page.setViewportSize({ width: 1440, height: 900 });

	await page.goto(`${wellington}?serves=8`);
	await waitForCore(page);
	await page.getByRole('button', { name: /^Start 30 min timer/ }).click();
	await page.getByRole('button', { name: /^Start 15-20 min timer/ }).click();
	await page.screenshot({ path: join(out, 'timer-strip-1440-light.png') });
	await page.setViewportSize({ width: 375, height: 812 });
	await page.screenshot({ path: join(out, 'timer-strip-375-light.png') });

	await page.setViewportSize({ width: 1440, height: 900 });
	await page.getByRole('button', { name: 'Add to shopping list' }).click();
	await page.goto('desserts/french-classics/creme-brulee?x=2');
	await waitForCore(page);
	await page.getByRole('button', { name: 'Add to shopping list' }).click();
	await page.goto('shopping-list');
	await page.getByRole('listitem').getByRole('checkbox').first().check();
	await page.screenshot({ path: join(out, 'shopping-list-1440-light.png'), fullPage: true });
	await page.setViewportSize({ width: 375, height: 812 });
	await page.emulateMedia({ colorScheme: 'dark', reducedMotion: 'reduce' });
	await page.screenshot({ path: join(out, 'shopping-list-375-dark.png'), fullPage: true });
});

test('writes screenshots of the share sheet with a card made', async ({ page }) => {
	mkdirSync(out, { recursive: true });
	for (const scheme of ['light', 'dark'] as const) {
		await page.emulateMedia({ colorScheme: scheme, reducedMotion: 'reduce' });
		for (const width of [375, 1440]) {
			await page.setViewportSize({ width, height: width < 768 ? 812 : 900 });
			await page.goto('main-courses/beef-steak/beef-wellington?serves=8&u=us');
			await waitForCore(page);
			await page.getByRole('button', { name: width < 768 ? 'Share this recipe' : 'Share' }).click();
			const sheet = page.getByRole('dialog', { name: 'Share this recipe' });
			await expect(sheet).toBeVisible();
			await sheet.getByRole('button', { name: 'Share recipe card' }).click();
			await expect(sheet.getByRole('img', { name: /Preview of the recipe card/ })).toBeVisible();
			expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
				width
			);
			await page.screenshot({ path: join(out, `share-sheet-${width}-${scheme}.png`) });
		}
	}
});

test('writes screenshots of the admin drawer and the editor', async ({ page }) => {
	mkdirSync(out, { recursive: true });
	test.setTimeout(240_000);
	const wellington = 'main-courses/beef-steak/beef-wellington';
	const blob = {
		v: 1,
		kdf: { name: 'PBKDF2', hash: 'SHA-256', iterations: 1000 },
		iv: 'AAAAAAAAAAAAAAAA',
		salt: 'AAAAAAAAAAAAAAAAAAAAAA==',
		data: 'AAAA'
	};
	// The editor opens a recipe from GitHub, so serve the stored file the way the contents API does.
	await page.route('https://api.github.com/**', (route) => {
		const found = /\/contents\/recipes\/(.+)\.json$/.exec(new URL(route.request().url()).pathname);
		if (!found) return route.fulfill({ status: 404, json: { message: 'Not Found' } });
		const file = readFileSync(new URL(`../../recipes/${found[1]}.json`, import.meta.url));
		return route.fulfill({ json: { sha: 'sha-stored', content: file.toString('base64') } });
	});
	const openDrawer = async () => {
		await page.getByRole('button', { name: 'Settings' }).click();
		await expect(page.getByRole('dialog', { name: 'Settings' })).toBeVisible();
	};

	for (const scheme of ['light', 'dark'] as const) {
		await page.emulateMedia({ colorScheme: scheme, reducedMotion: 'reduce' });
		for (const width of [375, 1440]) {
			const label = `${width}-${scheme}`;
			await page.setViewportSize({ width, height: width < 768 ? 812 : 900 });

			await page.route('**/admin.json', (route) => route.fulfill({ status: 404, body: '' }));
			await page.goto('./');
			await openDrawer();
			await page.screenshot({ path: join(out, `admin-drawer-setup-${label}.png`) });

			await page.unroute('**/admin.json');
			await page.route('**/admin.json', (route) => route.fulfill({ json: blob }));
			await page.goto('./');
			await openDrawer();
			await expect(page.getByRole('button', { name: 'Unlock editing' })).toBeVisible();
			await page.screenshot({ path: join(out, `admin-drawer-locked-${label}.png`) });

			await page.evaluate(() => sessionStorage.setItem('sapori:admin-token', 'test-token'));
			await page.goto('./');
			await openDrawer();
			await expect(page.getByRole('link', { name: 'New recipe' })).toBeVisible();
			await page.screenshot({ path: join(out, `admin-drawer-unlocked-${label}.png`) });

			await page.goto(`edit?id=${wellington}`);
			await expect(page.getByRole('button', { name: 'Save recipe' })).toBeEnabled();
			await page.screenshot({ path: join(out, `editor-${label}.png`) });
			expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
				width
			);

			if (width < 768) {
				await page.getByRole('radio', { name: /^Checks/ }).check({ force: true });
				await page.screenshot({ path: join(out, `editor-checks-${label}.png`) });
				await page.getByRole('radio', { name: 'Preview' }).check({ force: true });
				await page.screenshot({ path: join(out, `editor-preview-${label}.png`) });
			}
			await page.evaluate(() => sessionStorage.clear());
		}
	}
});
