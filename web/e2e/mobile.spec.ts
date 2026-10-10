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
	const lastBottom = await page
		.locator('article')
		.first()
		.evaluate((element) => element.getBoundingClientRect().bottom);
	expect(lastBottom).toBeGreaterThan(0);
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

test('the header and breadcrumb stay on one line, and the servings panel starts folded', async ({
	page
}) => {
	await page.goto(wellington);
	await waitForCore(page);
	const height = (selector: string) =>
		page
			.locator(selector)
			.first()
			.evaluate((element) => element.getBoundingClientRect().height);
	expect(await height('nav[aria-label="Sections"] ul')).toBeLessThan(50);
	expect(await height('nav[aria-label="Breadcrumb"] ol')).toBeLessThan(50);

	const panel = page.getByRole('region', { name: 'Adjust the recipe' });
	const stepper = panel.getByRole('group', { name: 'Servings' });
	await expect(stepper).toBeHidden();
	await expect(panel.locator('summary').first()).toContainText('5 servings');
	await panel.getByText('Scale', { exact: true }).click();
	await expect(stepper).toBeVisible();
});

test('the share sheet is a bottom sheet on a phone', async ({ page }) => {
	await page.goto(wellington);
	await waitForCore(page);
	await page.getByRole('button', { name: 'Share this recipe' }).click();
	const sheet = page.getByRole('dialog', { name: 'Share this recipe' });
	await expect(sheet).toBeVisible();
	const box = await sheet.boundingBox();
	const viewport = page.viewportSize();
	expect(box && viewport && Math.abs(box.y + box.height - viewport.height) < 1).toBe(true);
	expect(box && viewport && box.width === viewport.width).toBe(true);
	for (const button of await sheet.getByRole('button').all()) {
		expect((await button.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44);
	}
});
