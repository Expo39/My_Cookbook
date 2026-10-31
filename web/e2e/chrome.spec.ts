import { expect, test } from '@playwright/test';
import { ingredients, method, waitForCore } from './helpers';

const wellington = 'main-courses/beef-steak/beef-wellington';

test('light is the default, and the theme choice applies at once and persists across reloads without a flash', async ({
	page
}) => {
	await page.emulateMedia({ colorScheme: 'dark' });
	await page.goto('./');
	const html = page.locator('html');
	await expect(html).toHaveAttribute('data-theme', 'light');
	await page.getByRole('button', { name: 'Settings' }).click();
	const drawer = page.getByRole('dialog', { name: 'Settings' });
	await expect(drawer.getByText("For the cookbook's owner")).toBeVisible();

	await drawer.getByRole('radio', { name: 'Dark' }).check();
	await expect(html).toHaveAttribute('data-theme', 'dark');
	await expect(page.locator('body')).toHaveCSS('background-color', 'rgb(14, 22, 32)');

	await page.goto('./', { waitUntil: 'commit' });
	await page.waitForFunction(() => document.documentElement.dataset.theme === 'dark');
	await page.reload();
	await expect(html).toHaveAttribute('data-theme', 'dark');

	await page.getByRole('button', { name: 'Settings' }).click();
	await drawer.getByRole('radio', { name: 'Light' }).check();
	await expect(page.locator('body')).toHaveCSS('background-color', 'rgb(248, 247, 243)');
	await drawer.getByRole('radio', { name: 'Match device' }).check();
	await expect(html).not.toHaveAttribute('data-theme', /.*/);
	await expect(page.locator('body')).toHaveCSS('background-color', 'rgb(14, 22, 32)');
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

test('on a wide screen the ingredients scroll with the page, not in a box of their own', async ({
	page
}) => {
	await page.setViewportSize({ width: 1280, height: 800 });
	await page.goto(wellington);
	await expect(page.getByRole('tablist')).toBeHidden();
	const column = page.locator('[id$="panel-ingredients"]');
	const style = await column.evaluate((element) => {
		const { position, overflowY } = getComputedStyle(element);
		return { position, overflowY };
	});
	expect(style).toEqual({ position: 'static', overflowY: 'visible' });
	const before = (await column.boundingBox())?.y ?? 0;
	await page.evaluate(() => scrollBy(0, 600));
	expect((await column.boundingBox())?.y ?? 0).toBeLessThan(before - 500);
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

test('settings are grouped into cards, the owner part is folded, and the page behind stays still', async ({
	page
}) => {
	await page.goto('./');
	await page.evaluate(() => scrollTo(0, 400));
	// On a wide screen the header scrolls away; a click that scrolled back to it would hide the check.
	await page
		.getByRole('button', { name: 'Settings' })
		.evaluate((button: HTMLElement) => button.click());
	const drawer = page.getByRole('dialog', { name: 'Settings' });
	for (const name of ['Look and units', 'Your recipes', 'Help']) {
		await expect(drawer.getByRole('heading', { name })).toBeVisible();
	}
	await expect(drawer.getByRole('link', { name: 'Questions and answers' })).toBeVisible();
	await expect(drawer.getByRole('button', { name: 'Set up editing' })).toBeHidden();
	await expect(page.locator('html')).toHaveCSS('overflow', 'hidden');
	await page.mouse.wheel(0, 800);
	expect(await page.evaluate(() => scrollY)).toBe(400);
	await page.keyboard.press('Escape');
	await expect(page.locator('html')).not.toHaveCSS('overflow', 'hidden');
	expect(await page.evaluate(() => scrollY)).toBe(400);
});

test('an info circle inside a folded box explains without opening the box', async ({ page }) => {
	await page.setViewportSize({ width: 1280, height: 800 });
	await page.goto('desserts/french-classics/creme-brulee');
	const box = page.locator('details.more-details');
	const info = page.getByRole('button', { name: 'What is scaling another way?' });
	await info.click();
	await expect(box).not.toHaveAttribute('open', '');
	await expect(info).toHaveAttribute('aria-expanded', 'true');
	await expect(info).toHaveCSS('cursor', 'pointer');
});

test('every page carries a content security policy that allows only the services it uses', async ({
	page
}) => {
	await page.goto('./');
	const policy = await page
		.locator('meta[http-equiv="content-security-policy"]')
		.getAttribute('content');
	expect(policy).toContain("default-src 'self'");
	expect(policy).toContain("object-src 'none'");
	expect(policy).toMatch(
		/script-src 'self' 'wasm-unsafe-eval' 'sha256-[^']+' https:\/\/challenges\.cloudflare\.com/
	);
	expect(policy).toMatch(/connect-src 'self' \S+workers\.dev https:\/\/api\.github\.com/);
	expect(policy).not.toMatch(/script-src[^;]*'unsafe-inline'/);
});
