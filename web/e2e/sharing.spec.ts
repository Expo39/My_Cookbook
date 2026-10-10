import { expect, test, type Page } from '@playwright/test';
import { ingredients, method, waitForCore, watchErrors } from './helpers';

const wellington = 'main-courses/beef-steak/beef-wellington';
const brulee = 'desserts/french-classics/creme-brulee';

async function openSheet(page: Page) {
	await page.getByRole('button', { name: 'Share', exact: true }).click();
	const sheet = page.getByRole('dialog', { name: 'Share this recipe' });
	await expect(sheet).toBeVisible();
	return sheet;
}

const naturalSize = (page: Page) =>
	page
		.getByRole('img', { name: /Preview of the recipe card/ })
		.evaluate((image: HTMLImageElement) => [image.naturalWidth, image.naturalHeight]);

/** A browser without the Web Share API, as desktop Firefox and most Linux builds are. */
const withoutSharing = (page: Page) =>
	page.addInitScript(() => {
		Object.defineProperty(navigator, 'share', { value: undefined, configurable: true });
		Object.defineProperty(navigator, 'canShare', { value: undefined, configurable: true });
	});

test('the share sheet opens from the Share button and closes with Escape', async ({ page }) => {
	const errors = watchErrors(page);
	await page.goto(wellington);
	await waitForCore(page);
	const sheet = await openSheet(page);
	await expect(sheet.getByRole('button', { name: 'Share recipe card' })).toBeVisible();
	await expect(sheet.getByRole('button', { name: 'Share link' })).toBeVisible();
	await expect(sheet.getByRole('button', { name: 'Print card' })).toBeVisible();
	await expect(sheet.getByRole('radio')).toHaveCount(3);
	await page.keyboard.press('Escape');
	await expect(sheet).toBeHidden();
	expect(errors()).toEqual([]);
});

test('Share link falls back to copying the link with the current view state', async ({
	page,
	context
}) => {
	await context.grantPermissions(['clipboard-read', 'clipboard-write']);
	await withoutSharing(page);
	await page.goto(brulee);
	await waitForCore(page);
	await page.getByRole('button', { name: 'More servings' }).first().click();
	await page.getByRole('button', { name: 'More servings' }).first().click();
	await page.getByRole('radio', { name: 'US', exact: true }).check();

	const sheet = await openSheet(page);
	await sheet.getByRole('button', { name: 'Share link' }).click();
	await expect(page.getByText('Link copied')).toBeVisible();
	await expect(sheet).toBeHidden();
	const copied = await page.evaluate(() => navigator.clipboard.readText());
	expect(copied).toContain(`${brulee}?serves=6&u=us`);
});

test('Share recipe card draws a PNG for the current scale, units and variant', async ({ page }) => {
	await withoutSharing(page);
	await page.goto(brulee);
	await waitForCore(page);
	await page.getByRole('button', { name: 'More servings' }).first().click();
	await page.getByRole('button', { name: 'More servings' }).first().click();
	await page.getByRole('radio', { name: 'US', exact: true }).check();
	await page.getByRole('radio', { name: 'Pods' }).check();

	const sheet = await openSheet(page);
	await sheet.getByRole('button', { name: 'Share recipe card' }).click();
	const preview = sheet.getByRole('img', { name: /Preview of the recipe card/ });
	await expect(preview).toBeVisible();
	await expect(preview).toHaveAttribute('data-servings', '6');
	await expect(preview).toHaveAttribute('data-units', 'us');
	await expect(preview).toHaveAttribute('data-variants', 'vanilla:pods');
	expect(await naturalSize(page)).toEqual([1080, 1350]);
	await expect(sheet.getByRole('status')).toHaveText(/cannot share the image/);

	await sheet.getByRole('radio', { name: 'Story 9:16' }).check();
	await expect(preview).toHaveAttribute('data-format', 'story');
	await expect.poll(() => naturalSize(page)).toEqual([1080, 1920]);

	const [download] = await Promise.all([
		page.waitForEvent('download'),
		sheet.getByRole('button', { name: 'Save image' }).click()
	]);
	expect(download.suggestedFilename()).toBe('creme-brulee-story.png');
});

test('a browser that can share files gets the card through the system sheet', async ({ page }) => {
	await page.addInitScript(() => {
		const shared: { files: { name: string; type: string; size: number }[]; title?: string }[] = [];
		Object.assign(window, { shared });
		Object.defineProperty(navigator, 'canShare', { value: () => true, configurable: true });
		Object.defineProperty(navigator, 'share', {
			configurable: true,
			value: async (data: { files: File[]; title?: string }) => {
				shared.push({
					files: data.files.map(({ name, type, size }) => ({ name, type, size })),
					title: data.title
				});
			}
		});
	});
	await page.goto(wellington);
	await waitForCore(page);
	const sheet = await openSheet(page);
	await sheet.getByRole('radio', { name: 'Pin 2:3' }).check();
	await sheet.getByRole('button', { name: 'Share recipe card' }).click();
	await expect(sheet).toBeHidden();
	const shared = await page.evaluate(() => (window as unknown as { shared: unknown[] }).shared);
	expect(shared).toMatchObject([
		{ files: [{ name: 'beef-wellington-pin.png', type: 'image/png' }], title: 'Beef Wellington' }
	]);
});

test('the Open Graph tags and the cards they point to are in place', async ({ page }) => {
	await page.goto(wellington);
	const meta = (selector: string) => page.locator(selector).getAttribute('content');
	const og = await meta('meta[property="og:image"]');
	expect(og).toMatch(new RegExp(`/cards/${wellington}/og\\.png$`));
	expect(await meta('meta[property="og:image:width"]')).toBe('1200');
	expect(await meta('meta[property="og:image:height"]')).toBe('630');
	expect(await meta('meta[property="og:image:alt"]')).toContain('Beef Wellington');
	expect(await meta('meta[name="twitter:card"]')).toBe('summary_large_image');
	expect(await meta('meta[name="twitter:image"]')).toBe(og);

	const ld = JSON.parse(
		(await page.locator('script[type="application/ld+json"]').textContent()) ?? '{}'
	);
	expect(ld.image).toEqual([
		expect.stringMatching(/\/og\.png$/),
		expect.stringMatching(/\/portrait\.png$/)
	]);

	for (const [name, size] of [
		['og', [1200, 630]],
		['portrait', [1080, 1350]],
		['story', [1080, 1920]]
	] as const) {
		const response = await page.request.get(`cards/${wellington}/${name}.png`);
		expect(response.headers()['content-type']).toBe('image/png');
		const header = await response.body();
		expect([header.readUInt32BE(16), header.readUInt32BE(20)]).toEqual(size);
	}
});

test('Print card prints an A5 index card and nothing else', async ({ page }) => {
	await page.addInitScript(() => {
		Object.assign(window, { printed: 0 });
		window.print = () => {
			(window as unknown as { printed: number }).printed++;
		};
	});
	await page.goto(`${wellington}?serves=10`);
	await waitForCore(page);
	const sheet = await openSheet(page);
	await sheet.getByRole('button', { name: 'Print card' }).click();
	await expect(sheet).toBeHidden();
	await page.waitForFunction(() => (window as unknown as { printed: number }).printed === 1);

	await page.emulateMedia({ media: 'print' });
	const card = page.getByRole('region', { name: 'Index card' });
	await expect(card).toBeVisible();
	await expect(card.getByRole('heading', { name: 'Beef Wellington' })).toBeVisible();
	await expect(card).toContainText('10 servings');
	await expect(card.getByText('chateaubriand beef fillet')).toBeVisible();
	await expect(card.getByRole('img', { name: 'QR code for this recipe' })).toBeVisible();
	await expect(page.getByRole('heading', { level: 1 })).toBeHidden();
	await expect(ingredients(page)).toBeHidden();
	await expect(method(page)).toBeHidden();

	await page.emulateMedia({ media: 'screen' });
	await expect(card).toBeHidden();
});
