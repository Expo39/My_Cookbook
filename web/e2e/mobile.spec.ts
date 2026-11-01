import { expect, test } from '@playwright/test';
import { ingredients, method, waitForCore, watchErrors } from './helpers';

const wellington = 'main-courses/beef-steak/beef-wellington';

test('a phone gets Ingredients and Method tabs and a bottom action bar', async ({ page }) => {
	const errors = watchErrors(page);
	await page.goto(wellington);
	await waitForCore(page);

	const tabs = page.getByRole('tablist', { name: 'Recipe sections' });
	await expect(tabs).toBeVisible();
	await expect(ingredients(page)).toBeVisible();
	await expect(method(page)).toBeHidden();

	await tabs.getByRole('tab', { name: 'Method' }).click();
	await expect(method(page)).toBeVisible();
	await expect(ingredients(page)).toBeHidden();

	await tabs.getByRole('tab', { name: 'Method' }).press('ArrowLeft');
	await expect(ingredients(page)).toBeVisible();

	const bar = page.getByRole('link', { name: 'Start cooking' });
	await expect(bar).toBeVisible();
	await expect(page.getByRole('button', { name: 'Share this recipe' })).toBeVisible();
	const stepper = page.getByRole('group', { name: 'Servings' }).last();
	await stepper.getByRole('button', { name: 'More servings' }).click();
	await expect(stepper.locator('output')).toHaveText('6');
	expect(errors()).toEqual([]);
});

test('the bottom bar sits at the foot of the screen and clears the content', async ({ page }) => {
	await page.goto(wellington);
	await waitForCore(page);
	const bar = page.locator('.bar');
	const box = await bar.boundingBox();
	const viewport = page.viewportSize();
	expect(box && viewport && Math.abs(box.y + box.height - viewport.height) < 1).toBe(true);
	expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);

	await page.evaluate(() => scrollTo(0, document.body.scrollHeight));
	// The whole page, down to the footer's last line, ends above the bar.
	const lastBottom = await page.evaluate(() =>
		Math.max(
			...[...document.querySelectorAll('footer *')]
				.filter((element) => element.childElementCount === 0 && element.textContent?.trim())
				.map((element) => element.getBoundingClientRect().bottom)
		)
	);
	const barTop = (await bar.boundingBox())?.y ?? 0;
	expect(lastBottom).toBeLessThanOrEqual(barTop);
});

test('in cook mode the full list opens as a sheet, and Esc closes the sheet before cook mode', async ({
	page
}) => {
	await page.goto(`${wellington}?cook=3`);
	const dialog = page.getByRole('dialog', { name: /Wellington/ });
	const sheet = dialog.getByLabel('All ingredients');
	await expect(dialog.getByRole('list', { name: 'In this step' })).toContainText('red wine');
	await expect(sheet).toBeHidden();

	await dialog.getByRole('button', { name: 'Ingredients' }).click();
	await expect(sheet).toBeVisible();
	await expect(sheet.locator('li.current')).toHaveCount(4);
	await expect(sheet.getByRole('button', { name: 'Close the list' })).toBeFocused();
	const wine = sheet.getByRole('checkbox', { name: /red wine/ });
	await wine.check();
	await expect(wine).toBeChecked();

	await page.keyboard.press('Escape');
	await expect(sheet).toBeHidden();
	await expect(dialog).toBeVisible();
	await page.keyboard.press('Escape');
	await expect(dialog).toBeHidden();
});

test('every touch target on the phone view is at least 44 px', async ({ page }) => {
	await page.goto(wellington);
	await waitForCore(page);
	const small = await page.evaluate(() => {
		const targets = document.querySelectorAll(
			'button:not(:disabled), a[href], input:not(.sr-only), select, summary, [role="tab"]'
		);
		return [...targets]
			.filter((element) => {
				const style = getComputedStyle(element);
				const rect = element.getBoundingClientRect();
				return (
					rect.width > 0 &&
					style.visibility !== 'hidden' &&
					!element.closest('[hidden], dialog:not([open])')
				);
			})
			.filter((element) => {
				// A card's link is stretched over the whole card, so the card is the target.
				const rect = (element.closest('article') ?? element).getBoundingClientRect();
				const inline = getComputedStyle(element).display === 'inline' && !!element.closest('p');
				return (
					!inline &&
					(rect.height < 43.5 || rect.width < 43.5) &&
					!element.classList.contains('timer')
				);
			})
			.map(
				(element) =>
					`${element.tagName} ${element.getAttribute('aria-label') ?? element.textContent?.trim().slice(0, 30)}`
			);
	});
	expect(small).toEqual([]);
});

test('the sections stay on one row with the current one in view, the breadcrumb shows the whole trail, and the servings panel starts folded', async ({
	page
}) => {
	await page.goto(wellington);
	await waitForCore(page);
	const sections = page.getByRole('navigation', { name: 'Sections' });
	const row = await sections.locator('ul').evaluate((list) => list.getBoundingClientRect().height);
	expect(row).toBeLessThan(70);
	await expect(sections.getByRole('link', { name: 'Main Courses' })).toBeInViewport();

	const crumbs = page.getByRole('navigation', { name: 'Breadcrumb' });
	for (const name of ['Home', 'Main Courses', 'Beef']) {
		await expect(crumbs.getByRole('link', { name, exact: true })).toBeVisible();
	}
	await expect(crumbs.locator('[aria-current="page"]')).toBeHidden();

	const panel = page.getByRole('region', { name: 'Adjust the recipe' });
	const stepper = panel.getByRole('group', { name: 'Servings' });
	await expect(stepper).toBeHidden();
	await expect(panel.locator('summary').first()).toContainText('5 servings');
	await panel.getByText('Scale', { exact: true }).click();
	await expect(stepper).toBeVisible();
});

test('cook mode steps with a swipe on touch', async ({ page }) => {
	await page.goto(wellington);
	await waitForCore(page);
	await page.getByRole('link', { name: 'Start cooking' }).click();
	const dialog = page.getByRole('dialog', { name: /Wellington/ });
	await expect(dialog.getByText('Step 1 of 11')).toBeVisible();

	const client = await page.context().newCDPSession(page);
	const swipe = async (from: number, to: number) => {
		const touch = (x: number) => [{ x, y: 380 }];
		await client.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: touch(from) });
		for (const step of [0.25, 0.5, 0.75, 1]) {
			await client.send('Input.dispatchTouchEvent', {
				type: 'touchMove',
				touchPoints: touch(from + (to - from) * step)
			});
		}
		await client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
	};

	await swipe(320, 80);
	await expect(dialog.getByText('Step 2 of 11')).toBeVisible();
	await swipe(80, 320);
	await expect(dialog.getByText('Step 1 of 11')).toBeVisible();
	await swipe(200, 230);
	await expect(dialog.getByText('Step 1 of 11')).toBeVisible();

	for (const button of await dialog.getByRole('button').all()) {
		const box = await button.boundingBox();
		expect(box?.height ?? 0).toBeGreaterThanOrEqual(43.5);
		expect(box?.width ?? 0).toBeGreaterThanOrEqual(43.5);
	}
});

test('the share sheet is a bottom sheet on a phone', async ({ page }) => {
	await page.goto(wellington);
	await waitForCore(page);
	await page.getByRole('button', { name: 'Share this recipe' }).click();
	const sheet = page.getByRole('dialog', { name: 'Share' });
	await expect(sheet).toBeVisible();
	const box = await sheet.boundingBox();
	const viewport = page.viewportSize();
	expect(box && viewport && Math.abs(box.y + box.height - viewport.height) < 1).toBe(true);
	expect(box && viewport && box.width === viewport.width).toBe(true);
	for (const button of await sheet.getByRole('button').all()) {
		expect((await button.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44);
	}
});

test('nothing scrolls sideways on a narrow phone, even with the add-item form open', async ({
	page
}) => {
	await page.setViewportSize({ width: 320, height: 640 });
	for (const path of ['./', 'search', 'how-to-use', wellington, 'edit']) {
		await page.goto(path);
		expect(await page.evaluate(() => document.documentElement.scrollWidth), path).toBe(320);
	}
	await page.goto('shopping-list');
	await page.getByRole('button', { name: 'Add an item' }).click();
	expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(320);
});

test.describe('the first paint of a reload', () => {
	test.use({ serviceWorkers: 'block' });

	test('already looks finished before the code runs, so nothing is drawn twice', async ({
		page
	}) => {
		await page.goto(wellington);
		await page.evaluate(() => {
			localStorage.setItem('sapori:hint:units', '1');
			localStorage.setItem('sapori:hint:steps', '1');
		});
		// With the app's code held back, what shows is exactly what a reload paints first.
		await page.route('**/_app/immutable/**/*.js', (route) => route.abort());
		await page.reload();

		const nav = page.getByRole('navigation', { name: 'Sections' });
		await expect(nav.getByRole('link', { name: 'Main Courses' })).toHaveAttribute(
			'aria-current',
			'page'
		);
		await expect(page.getByRole('tab', { name: 'Ingredients' })).toHaveAttribute(
			'aria-selected',
			'true'
		);
		await expect(method(page)).toBeHidden();
		await expect(page.locator('.panel .controls')).toBeHidden();
		await expect(page.locator('.bar').getByRole('link', { name: 'Start cooking' })).toBeVisible();
		await expect(page.getByText('Tap an amount to change its unit')).toBeHidden();
		await expect(page.getByText("Tap a step's number to mark it done")).toBeHidden();
	});
});

test("the owner's Add a photo is a compact strip that keeps the page within the screen", async ({
	page
}) => {
	await page.addInitScript(() => sessionStorage.setItem('sapori:admin-token', 'test-token'));
	await page.route('https://api.github.com/**', (route) =>
		route.fulfill({ json: { permissions: { push: true } } })
	);
	await page.goto(wellington);
	const add = page.getByRole('button', { name: 'Add a photo' });
	await expect(add).toBeVisible();
	expect((await add.boundingBox())?.height ?? 0).toBeLessThan(100);
	const width = await page.evaluate(() => [
		document.documentElement.scrollWidth,
		document.documentElement.clientWidth
	]);
	expect(width[0]).toBeLessThanOrEqual(width[1]);
});
