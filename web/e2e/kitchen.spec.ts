import { expect, test, type Page } from '@playwright/test';
import { waitForCore, watchErrors } from './helpers';

const brulee = 'desserts/french-classics/creme-brulee';
const wellington = 'main-courses/beef-steak/beef-wellington';
const tagliatelle = 'first-courses/pasta/creamy-pancetta-mushroom-tagliatelle';

const cookDialog = (page: Page) => page.getByRole('dialog', { name: 'Crème Brûlée' });
const strip = (page: Page) => page.getByRole('region', { name: 'Timers' });

test.describe('cook mode', () => {
	test('opens, steps with keys and buttons, and Esc returns focus', async ({ page }) => {
		const errors = watchErrors(page);
		await page.goto(brulee);
		await waitForCore(page);
		const start = page.getByRole('link', { name: 'Start cooking' });
		await start.click();

		const dialog = cookDialog(page);
		await expect(dialog).toBeVisible();
		await expect(dialog.getByText('Step 1 of 9')).toBeVisible();
		await expect(dialog.getByRole('list', { name: 'In this step' })).toContainText(
			'vanilla extract'
		);
		await expect(page).toHaveURL(/\?cook$/);

		await page.keyboard.press('ArrowRight');
		await expect(dialog.getByText('Step 2 of 9')).toBeVisible();
		await expect(dialog.getByText('Preheat the oven')).toBeVisible();
		await expect(page).toHaveURL(/cook=2/);

		await dialog.getByRole('button', { name: 'Next' }).click();
		await expect(dialog.getByText('Step 3 of 9')).toBeVisible();
		await dialog.getByRole('button', { name: 'Previous' }).click();
		await expect(dialog.getByText('Step 2 of 9')).toBeVisible();
		await page.keyboard.press('ArrowLeft');
		await expect(dialog.getByText('Step 1 of 9')).toBeVisible();
		await expect(dialog.getByRole('button', { name: 'Previous' })).toBeDisabled();

		await page.keyboard.press('Escape');
		await expect(dialog).toBeHidden();
		await expect(start).toBeFocused();
		await expect(page).not.toHaveURL(/cook/);
		expect(errors()).toEqual([]);
	});

	test('traps focus inside while open', async ({ page }) => {
		await page.goto(brulee);
		await waitForCore(page);
		await page.getByRole('link', { name: 'Start cooking' }).click();
		await expect(cookDialog(page)).toBeVisible();
		for (let press = 0; press < 12; press++) {
			await page.keyboard.press('Tab');
			expect(await page.evaluate(() => !!document.activeElement?.closest('dialog'))).toBe(true);
		}
	});

	test('a deep link opens at that step and shows it as scaled', async ({ page }) => {
		await page.goto(`${brulee}?serves=8&cook=1`);
		const dialog = cookDialog(page);
		await expect(dialog.getByText('Step 1 of 9')).toBeVisible();
		await expect(dialog.getByRole('list', { name: 'In this step' })).toContainText('4 tsp');
		await expect(dialog.getByText('Scaled to 8')).toBeVisible();

		await page.goto(`${brulee}?cook=3`);
		await expect(dialog.getByText('Step 3 of 9')).toBeVisible();
		await expect(dialog.getByText('Whisk the egg yolks')).toBeVisible();

		await page.goto(`${brulee}?cook=99`);
		await expect(dialog.getByText('Step 9 of 9')).toBeVisible();
		await expect(dialog.getByRole('button', { name: 'Finish' })).toBeVisible();

		await page.keyboard.press('Escape');
		await expect(dialog).toBeHidden();
		await expect(page).not.toHaveURL(/cook/);
		await expect(page.locator('#main')).toBeFocused();
	});

	test('headings are shown as stage labels', async ({ page }) => {
		await page.goto(`${wellington}?cook=5`);
		const dialog = page.getByRole('dialog', { name: /Wellington/ });
		await expect(dialog.getByRole('heading', { name: /Day 2: assembly/ })).toBeVisible();
	});

	test('the full ingredient list sits in a side column on a wide screen', async ({ page }) => {
		await page.setViewportSize({ width: 1440, height: 900 });
		await page.goto(`${brulee}?cook=1`);
		const side = cookDialog(page).getByLabel('All ingredients');
		await expect(side).toBeVisible();
		await expect(side).toContainText('heavy cream');
		await page.setViewportSize({ width: 800, height: 900 });
		await expect(side).toBeHidden();
	});

	test('says so when the screen cannot be kept on', async ({ page }) => {
		await page.addInitScript(() => {
			Object.defineProperty(navigator, 'wakeLock', { value: undefined });
		});
		await page.goto(`${brulee}?cook=1`);
		await expect(
			cookDialog(page).getByText("Keep your screen on: this browser can't do it for you")
		).toBeVisible();
	});

	test('Back leaves cook mode and returns to the recipe', async ({ page }) => {
		await page.goto(brulee);
		await waitForCore(page);
		await page.getByRole('link', { name: 'Start cooking' }).click();
		await expect(cookDialog(page)).toBeVisible();
		await page.keyboard.press('ArrowRight');
		await page.goBack();
		await expect(cookDialog(page)).toBeHidden();
		await expect(page).not.toHaveURL(/cook/);
	});
});

test.describe('timers', () => {
	test.beforeEach(async ({ page }) => {
		await page.addInitScript(() => {
			(window as unknown as { vibrations: unknown[] }).vibrations = [];
			navigator.vibrate = (pattern) => {
				(window as unknown as { vibrations: unknown[] }).vibrations.push(pattern);
				return true;
			};
		});
		await page.clock.install({ time: new Date('2030-01-01T12:00:00Z') });
	});

	test('a step timer shows in the strip, survives a reload and finishes', async ({ page }) => {
		await page.goto(brulee);
		await waitForCore(page);
		await page.getByRole('button', { name: /^Start 15–20 min timer/ }).click();

		await expect(strip(page)).toContainText('Crème Brûlée, step 1');
		await expect(strip(page).locator('.time')).toHaveText(/^1[45]:\d\d$/);

		await page.reload();
		await expect(strip(page)).toContainText('Crème Brûlée, step 1');
		await expect(strip(page).locator('.time')).toHaveText(/^1[45]:\d\d$/);

		await page.clock.fastForward('16:00');
		await expect(strip(page).locator('.time')).toHaveText('Done');
		await expect(page.getByRole('status').filter({ hasText: 'timer finished' })).toHaveText(
			'Crème Brûlée, step 1 timer finished.'
		);
		const vibrations = await page.evaluate(
			() => (window as unknown as { vibrations: unknown[] }).vibrations
		);
		expect(vibrations).toHaveLength(1);

		await strip(page)
			.getByRole('button', { name: /^Add one minute/ })
			.click();
		await expect(strip(page).locator('.time')).toHaveText(/^1:00$|^0:5\d$/);
		await strip(page)
			.getByRole('button', { name: /^Dismiss/ })
			.click();
		await expect(strip(page)).toBeHidden();
	});

	test('timers can be paused, resumed and run side by side across pages', async ({ page }) => {
		await page.goto(brulee);
		await waitForCore(page);
		await page.getByRole('button', { name: /^Start 15–20 min timer/ }).click();
		await page.getByRole('button', { name: /^Start 35–40 min timer/ }).click();
		await expect(strip(page).getByRole('listitem')).toHaveCount(2);

		const first = strip(page).getByRole('listitem').first();
		await first.getByRole('button', { name: /^Pause/ }).click();
		const paused = await first.locator('.time').textContent();
		await page.clock.fastForward('02:00');
		await expect(first.locator('.time')).toHaveText(paused ?? '');
		await first.getByRole('button', { name: /^Resume/ }).click();
		await expect(first.getByRole('button', { name: /^Pause/ })).toBeVisible();

		await page.goto('./');
		await expect(strip(page).getByRole('listitem')).toHaveCount(2);
	});

	test('the strip shows inside cook mode too, and a pill there starts a timer', async ({
		page
	}) => {
		await page.goto(`${brulee}?cook=1`);
		const dialog = cookDialog(page);
		await dialog.getByRole('button', { name: /^Start 15–20 min timer/ }).click();
		await expect(dialog.getByRole('region', { name: 'Timers' })).toContainText('step 1');
		await expect(page.getByRole('region', { name: 'Timers' })).toHaveCount(1);
		await dialog.getByRole('button', { name: /^Show the .* timer/ }).click();
		await expect(dialog.getByRole('button', { name: /^Pause/ })).toBeFocused();
	});

	test('Space starts the timer of the current step', async ({ page }) => {
		await page.goto(`${brulee}?cook=7`);
		const dialog = cookDialog(page);
		await expect(dialog.getByText('Step 7 of 9')).toBeVisible();
		await dialog.getByText('Step 7 of 9').click();
		await page.keyboard.press('Space');
		await expect(strip(page)).toContainText('step 7');
	});
});

test.describe('shopping list', () => {
	test.beforeEach(async ({ page, context }) => {
		await context.grantPermissions(['clipboard-read', 'clipboard-write']);
		await page.addInitScript(() => {
			Object.defineProperty(navigator, 'share', { value: undefined });
		});
	});

	test('merges recipes, ticks, clears and shares', async ({ page }) => {
		await page.goto('shopping-list');
		await expect(
			page.getByText('Your list is empty. Add ingredients from any recipe.')
		).toBeVisible();

		await page.goto(`${brulee}?x=2`);
		await waitForCore(page);
		await page.getByRole('button', { name: 'Add to shopping list' }).click();
		await expect(page.getByText('Added 5 ingredients to your shopping list')).toBeVisible();

		await page.goto(tagliatelle);
		await waitForCore(page);
		await page.getByRole('button', { name: 'Add to shopping list' }).click();

		await page.goto('shopping-list');
		const cream = page.getByRole('listitem').filter({ hasText: 'heavy cream' });
		await expect(cream).toHaveCount(1);
		await expect(cream).toContainText('1.2 l');
		await expect(cream).toContainText('Crème Brûlée, Creamy Pancetta');

		await cream.getByRole('checkbox').check();
		await expect(page.getByText(/^1 of \d+ ticked$/)).toBeVisible();
		await page.reload();
		await expect(cream.getByRole('checkbox')).toBeChecked();

		await page.getByRole('radio', { name: 'Recipe' }).check();
		await expect(page.getByRole('heading', { name: 'Crème Brûlée (8 servings)' })).toBeVisible();
		await expect(
			page.getByRole('heading', { name: /Creamy Pancetta.*\(3 servings\)/ })
		).toBeVisible();

		await page.getByRole('button', { name: 'Share list' }).click();
		await expect(page.getByText('List copied')).toBeVisible();
		const copied = await page.evaluate(() => navigator.clipboard.readText());
		expect(copied).toContain('Shopping list');
		expect(copied).toContain('egg yolks');
		expect(copied).not.toContain('heavy cream');

		await page.getByRole('button', { name: 'Clear ticked' }).click();
		await expect(page.getByRole('listitem').filter({ hasText: 'heavy cream' })).toHaveCount(0);
		await expect(page.getByRole('listitem').filter({ hasText: 'egg yolks' })).toHaveCount(1);

		await page.getByRole('button', { name: 'Clear all' }).click();
		await page.getByRole('button', { name: 'Tap again to clear all' }).click();
		await expect(
			page.getByText('Your list is empty. Add ingredients from any recipe.')
		).toBeVisible();
	});

	test('adding a recipe again updates it instead of doubling it', async ({ page }) => {
		await page.goto(brulee);
		await waitForCore(page);
		await page.getByRole('button', { name: 'Add to shopping list' }).click();
		await page.getByRole('button', { name: 'More servings' }).first().click();
		await page.getByRole('button', { name: 'Add to shopping list' }).click();
		await expect(page.getByText('Shopping list updated for this recipe')).toBeVisible();
		await page.goto('shopping-list');
		await expect(page.getByRole('listitem').filter({ hasText: 'heavy cream' })).toHaveCount(1);
		await expect(page.getByRole('listitem').filter({ hasText: 'heavy cream' })).toContainText(
			'625 ml'
		);
	});
});

test.describe('favourites, recent and notes', () => {
	test('favourites and recently viewed persist', async ({ page }) => {
		await page.goto('favourites');
		await expect(page.getByText(/No favourites yet/)).toBeVisible();

		await page.goto(brulee);
		const button = page.getByRole('button', { name: 'Favourite' });
		await button.click();
		await expect(page.getByRole('button', { name: 'Favourited' })).toHaveAttribute(
			'aria-pressed',
			'true'
		);
		await page.reload();
		await expect(page.getByRole('button', { name: 'Favourited' })).toBeVisible();
		await page.goto(wellington);

		await page.goto('favourites');
		const saved = page.getByRole('region', { name: 'Saved' });
		await expect(saved.getByRole('link', { name: 'Crème Brûlée' })).toBeVisible();
		await expect(saved.getByRole('link', { name: /Wellington/ })).toHaveCount(0);
		const viewed = page.getByRole('region', { name: 'Recently viewed' });
		await expect(viewed.getByRole('link')).toHaveText([/Wellington/, 'Crème Brûlée']);
	});

	test('notes autosave on the device', async ({ page }) => {
		await page.goto(brulee);
		await expect(page.getByText('Notes stay on this device.')).toBeVisible();
		const notes = page.getByLabel('Your notes');
		await notes.fill('Less sugar next time');
		await page.waitForFunction(() =>
			localStorage.getItem('sapori:notes:desserts/french-classics/creme-brulee')
		);
		await page.reload();
		await expect(page.getByLabel('Your notes')).toHaveValue('Less sugar next time');
		await page.goto(wellington);
		await expect(page.getByLabel('Your notes')).toHaveValue('');
	});

	test('the recipe page still works when storage is blocked', async ({ page }) => {
		await page.addInitScript(() => {
			const fail = () => {
				throw new DOMException('blocked', 'SecurityError');
			};
			Object.defineProperty(window, 'localStorage', { get: fail });
		});
		const errors = watchErrors(page);
		await page.goto(brulee);
		await waitForCore(page);
		await page.getByRole('button', { name: 'Favourite' }).click();
		await page.getByLabel('Your notes').fill('kept for the visit');
		await page.getByRole('button', { name: /^Start 15–20 min timer/ }).click();
		await expect(strip(page)).toBeVisible();
		await page.getByRole('button', { name: 'Add to shopping list' }).click();
		await expect(page.getByText('Added 5 ingredients')).toBeVisible();
		expect(errors()).toEqual([]);
	});
});

test.describe('the planner', () => {
	test('works back from the serving time when the steps carry timings', async ({ page }) => {
		await page.goto(wellington);
		await page.getByText('Plan backwards from…').click();
		await page.getByLabel('Serve at').fill('19:30');
		await expect(page.getByText(/^Start by/)).toBeVisible();
		await expect(
			page.getByRole('listitem').filter({ hasText: /^\d\d:\d\d(, the day before)?\s*Step \d+/ })
		).toHaveCount(11);
	});

	test('is not offered when the recipe has too little timing', async ({ page }) => {
		await page.goto('desserts/french-classics/savoury-crepes');
		await expect(page.getByText('Plan backwards from…')).toHaveCount(0);
	});
});

test.describe('offline', () => {
	test('a visited recipe opens without a connection, and other pages say so', async ({
		page,
		context
	}) => {
		await page.goto(brulee);
		await waitForCore(page);
		await page.evaluate(() => navigator.serviceWorker.ready.then(() => undefined));
		await page.waitForFunction(async () => {
			const found = await caches.match(location.origin + location.pathname);
			return !!found;
		});

		await context.setOffline(true);
		await page.reload();
		await expect(page.getByRole('heading', { level: 1, name: 'Crème Brûlée' })).toBeVisible();
		await expect(page.getByText("You're offline: showing saved recipes")).toBeVisible();
		await waitForCore(page);

		await page.goto(wellington);
		await expect(page.getByRole('heading', { level: 1, name: "You're offline" })).toBeVisible();
		await expect(page.getByRole('link', { name: 'Crème Brûlée' })).toBeVisible();

		await context.setOffline(false);
		await expect(page.getByText("You're offline: showing saved recipes")).toBeHidden();
	});

	test('serves a manifest and icons', async ({ page, request, baseURL }) => {
		await page.goto('./');
		const href = await page.locator('link[rel="manifest"]').getAttribute('href');
		const manifestUrl = new URL(href ?? '', page.url()).href;
		const manifest = await (await request.get(manifestUrl)).json();
		expect(manifest.display).toBe('standalone');
		for (const icon of manifest.icons) {
			const response = await request.get(new URL(icon.src, manifestUrl).href);
			expect(response.ok(), `${icon.src} under ${baseURL}`).toBe(true);
		}
	});
});
