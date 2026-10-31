import { expect, test, type Page } from '@playwright/test';
import { ingredients, method, waitForCore, watchErrors } from './helpers';

const wellington = 'main-courses/beef-steak/beef-wellington';
const brulee = 'desserts/french-classics/creme-brulee';

async function openSheet(page: Page) {
	await page.getByRole('button', { name: 'Share', exact: true }).click();
	const sheet = page.getByRole('dialog', { name: 'Share' });
	await expect(sheet).toBeVisible();
	return sheet;
}

const preview = (page: Page) => page.getByRole('img', { name: /The recipe card for/ });

const naturalSize = (page: Page) =>
	preview(page).evaluate((image: HTMLImageElement) => [image.naturalWidth, image.naturalHeight]);

/** A browser without the Web Share API, as desktop Firefox and most Linux builds are. */
const withoutSharing = (page: Page) =>
	page.addInitScript(() => {
		Object.defineProperty(navigator, 'share', { value: undefined, configurable: true });
		Object.defineProperty(navigator, 'canShare', { value: undefined, configurable: true });
	});

/** A phone's share sheet: it records what it was handed. */
const withSharing = (page: Page) =>
	page.addInitScript(() => {
		const shared: { files: { name: string; type: string }[]; title?: string; text?: string }[] = [];
		Object.assign(window, { shared });
		Object.defineProperty(navigator, 'canShare', { value: () => true, configurable: true });
		Object.defineProperty(navigator, 'share', {
			configurable: true,
			value: async (data: { files: File[]; title?: string; text?: string }) => {
				shared.push({
					files: data.files.map(({ name, type }) => ({ name, type })),
					title: data.title,
					text: data.text
				});
			}
		});
	});

const sharedItems = (page: Page) =>
	page.evaluate(
		() =>
			(window as unknown as { shared: { files: unknown[]; title?: string; text?: string }[] })
				.shared
	);

test('the sheet opens straight onto a preview of the card, and closes with Escape', async ({
	page
}) => {
	const errors = watchErrors(page);
	await withoutSharing(page);
	await page.goto(wellington);
	await waitForCore(page);
	const sheet = await openSheet(page);
	await expect(preview(page)).toBeVisible();
	expect(await naturalSize(page)).toEqual([1080, 1350]);
	for (const name of ['Copy the card', 'Save image', 'Send the link', 'Copy as text', 'Print']) {
		await expect(sheet.getByRole('button', { name })).toBeVisible();
	}
	await expect(sheet.getByRole('checkbox', { name: /whole recipe as text/ })).not.toBeChecked();
	await expect(sheet.getByRole('radio')).toHaveCount(0);
	await page.keyboard.press('Escape');
	await expect(sheet).toBeHidden();
	expect(errors()).toEqual([]);
});

test('the card is drawn for the servings, units and variant on the page', async ({ page }) => {
	await withoutSharing(page);
	await page.goto(brulee);
	await waitForCore(page);
	await page.getByRole('button', { name: 'More servings' }).first().click();
	await page.getByRole('button', { name: 'More servings' }).first().click();
	await page.getByRole('radio', { name: 'US', exact: true }).check();
	await page.getByRole('radio', { name: 'Pods' }).check();

	await openSheet(page);
	await expect(preview(page)).toHaveAttribute('data-servings', '6');
	await expect(preview(page)).toHaveAttribute('data-units', 'us');
	await expect(preview(page)).toHaveAttribute('data-variants', 'vanilla:pods');
	const [download] = await Promise.all([
		page.waitForEvent('download'),
		page.getByRole('button', { name: 'Save image' }).click()
	]);
	expect(download.suggestedFilename()).toBe('creme-brulee.png');
});

test('Send the link falls back to copying the link with the current view state', async ({
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
	await sheet.getByRole('button', { name: 'Send the link' }).click();
	await expect(page.getByText('Link copied')).toBeVisible();
	await expect(sheet).toBeHidden();
	const copied = await page.evaluate(() => navigator.clipboard.readText());
	expect(copied).toContain(`${brulee}?serves=6&u=us`);
});

test('a phone sends the card with the link, or with the whole recipe as text', async ({ page }) => {
	await withSharing(page);
	await page.goto(wellington);
	await waitForCore(page);
	let sheet = await openSheet(page);
	await sheet.getByRole('button', { name: 'Send the card' }).click();
	await expect(sheet).toBeHidden();

	sheet = await openSheet(page);
	await sheet.getByRole('checkbox', { name: /whole recipe as text/ }).check();
	await sheet.getByRole('button', { name: 'Send the card' }).click();
	await expect(sheet).toBeHidden();

	const [withLink, withText] = await sharedItems(page);
	expect(withLink).toMatchObject({
		files: [{ name: 'beef-wellington.png', type: 'image/png' }],
		title: 'Beef Wellington'
	});
	expect(withLink.text).toMatch(new RegExp(`${wellington}$`));
	expect(withText.text).toContain('Beef Wellington');
	expect(withText.text).toContain('Ingredients');
	expect(withText.text).toContain('Method');
	expect(withText.text).toContain(wellington);
});

test('a browser that cannot send pictures copies the card instead', async ({ page }) => {
	await withoutSharing(page);
	await page.addInitScript(() => {
		const copied: string[] = [];
		Object.assign(window, { copied });
		Object.defineProperty(navigator, 'clipboard', {
			configurable: true,
			value: {
				write: async (items: ClipboardItem[]) =>
					copied.push(...items.flatMap((item) => item.types)),
				writeText: async () => undefined
			}
		});
	});
	await page.goto(wellington);
	await waitForCore(page);
	const sheet = await openSheet(page);
	await sheet.getByRole('button', { name: 'Copy the card' }).click();
	await expect(page.getByText('Card copied. Paste it into any chat.')).toBeVisible();
	expect(await page.evaluate(() => (window as unknown as { copied: string[] }).copied)).toEqual([
		'image/png'
	]);
});

test('Copy as text copies the whole recipe as it is shown, with its link', async ({
	page,
	context
}) => {
	await context.grantPermissions(['clipboard-read', 'clipboard-write']);
	await page.goto(`${wellington}?serves=10`);
	await waitForCore(page);
	const sheet = await openSheet(page);
	await sheet.getByRole('button', { name: 'Copy as text' }).click();
	await expect(page.getByText('Recipe copied. Paste it anywhere.')).toBeVisible();
	const text = await page.evaluate(() => navigator.clipboard.readText());
	expect(text.split('\n').slice(0, 2)).toEqual(['Beef Wellington', '10 servings']);
	expect(text).toMatch(/\nIngredients\n- .+/);
	expect(text).toMatch(/\nMethod\n[\s\S]*?\n1\. .+/);
	expect(text).toContain(`${wellington}?serves=10`);
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
	await sheet.getByRole('button', { name: 'Print' }).click();
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
