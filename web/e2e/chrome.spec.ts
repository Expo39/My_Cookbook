import { expect, test } from '@playwright/test';
import { ingredients, method, waitForCore } from './helpers';

const wellington = 'main-courses/beef-steak/beef-wellington';

test('the theme choice applies at once and persists across reloads without a flash', async ({
	page
}) => {
	await page.goto('./');
	const html = page.locator('html');
	await page.getByRole('button', { name: 'Settings' }).click();
	const drawer = page.getByRole('dialog', { name: 'Settings' });
	await expect(drawer.getByText('Admin editing arrives soon')).toBeVisible();

	await drawer.getByRole('radio', { name: 'Dark' }).check();
	await expect(html).toHaveAttribute('data-theme', 'dark');
	await expect(page.locator('body')).toHaveCSS('background-color', 'rgb(34, 29, 21)');

	await page.goto('./', { waitUntil: 'commit' });
	await page.waitForFunction(() => document.documentElement.dataset.theme === 'dark');
	await page.reload();
	await expect(html).toHaveAttribute('data-theme', 'dark');

	await page.getByRole('button', { name: 'Settings' }).click();
	await drawer.getByRole('radio', { name: 'Light' }).check();
	await expect(page.locator('body')).toHaveCSS('background-color', 'rgb(236, 228, 211)');
	await drawer.getByRole('radio', { name: 'System' }).check();
	await expect(html).not.toHaveAttribute('data-theme', /.*/);
});

test('the default units from the settings apply to recipes that do not say otherwise', async ({
	page
}) => {
	await page.goto('./');
	await page.getByRole('button', { name: 'Settings' }).click();
	await page.getByRole('dialog').getByRole('radio', { name: 'US' }).check();
	await page.keyboard.press('Escape');
	await page.goto('desserts/french-classics/creme-brulee');
	await waitForCore(page);
	await expect(page.getByRole('radio', { name: 'US', exact: true })).toBeChecked();
	await expect(ingredients(page)).toContainText('cup');
});

test('the back-to-top button appears after scrolling and works', async ({ page }) => {
	await page.goto(wellington);
	const top = page.getByRole('button', { name: 'Back to top' });
	await expect(top).toBeHidden();
	await page.evaluate(() => scrollTo(0, 1200));
	await expect(top).toBeVisible();
	await top.click();
	await expect.poll(() => page.evaluate(() => scrollY)).toBe(0);
});

test('the ingredients column stays in view while the method scrolls on a wide screen', async ({
	page
}) => {
	await page.setViewportSize({ width: 1280, height: 800 });
	await page.goto(wellington);
	await expect(page.getByRole('tablist')).toBeHidden();
	const column = page.locator('[id$="panel-ingredients"]');
	await method(page)
		.getByRole('heading', { name: 'Day 2: assembly, 3–4 hours before serving' })
		.scrollIntoViewIfNeeded();
	await page.evaluate(() => scrollBy(0, 300));
	const box = await column.boundingBox();
	expect(box?.y).toBeGreaterThanOrEqual(0);
	expect(box?.y).toBeLessThan(40);
});

test('the print view keeps the title, meta, ingredients and method only', async ({ page }) => {
	await page.goto(wellington);
	await waitForCore(page);
	await page.emulateMedia({ media: 'print' });
	await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
	await expect(ingredients(page)).toBeVisible();
	await expect(method(page)).toBeVisible();
	await expect(page.getByRole('navigation', { name: 'Sections' })).toBeHidden();
	await expect(page.getByRole('button', { name: 'More servings' })).toBeHidden();
	await expect(page.getByText("Chef's tip")).toBeHidden();
	await expect(page.getByText('Related recipes')).toBeHidden();
});

test('every control can be reached and used from the keyboard', async ({ page }) => {
	await page.goto(wellington);
	await waitForCore(page);
	await page.getByRole('button', { name: 'More servings' }).first().focus();
	await expect(page.getByRole('button', { name: 'More servings' }).first()).toBeFocused();
	await page.keyboard.press('Enter');
	await expect(page).toHaveURL(/serves=6/);
	await ingredients(page).getByRole('checkbox').first().focus();
	await page.keyboard.press('Space');
	await expect(ingredients(page).getByText(/^1 of/)).toBeVisible();
});

test('the footer links to Instagram when the site config turns it on', async ({ page }) => {
	await page.goto('./');
	const link = page.getByRole('link', { name: /More recipes on Instagram/ });
	await expect(link).toHaveAttribute('href', 'https://www.instagram.com/tonys_foods/');
});
