import { expect, test } from '@playwright/test';
import { ingredients, method, waitForCore, watchErrors } from './helpers';

const brulee = 'desserts/french-classics/creme-brulee';

test('the Pods variant changes the ingredient and the step', async ({ page }) => {
	const errors = watchErrors(page);
	await page.goto(brulee);
	await waitForCore(page);
	await expect(ingredients(page).getByText('vanilla extract')).toBeVisible();

	await page.getByRole('radio', { name: 'Pods' }).check();
	await expect(ingredients(page).getByText('vanilla pod')).toBeVisible();
	await expect(ingredients(page).getByText('vanilla extract')).toHaveCount(0);
	await expect(method(page).getByText('Split the vanilla pod')).toBeVisible();
	await expect(page).toHaveURL(/v=vanilla:pods/);
	await expect(page.getByText('Vanilla pods give the most authentic flavour')).toBeVisible();
	expect(errors()).toEqual([]);
});

test('the view state survives a reload and loads from a shared link', async ({ page }) => {
	await page.goto(brulee);
	await waitForCore(page);
	await page.getByRole('button', { name: 'More servings' }).first().click();
	await page.getByRole('button', { name: 'More servings' }).first().click();
	await page.getByRole('radio', { name: 'US', exact: true }).check();
	await page.getByRole('radio', { name: 'Pods' }).check();
	await expect(page).toHaveURL(/serves=6&u=us&v=vanilla:pods$/);

	await page.reload();
	await waitForCore(page);
	await expect(page.getByRole('group', { name: 'Servings' }).first().locator('output')).toHaveText(
		'6 servings'
	);
	await expect(page.getByRole('radio', { name: 'US', exact: true })).toBeChecked();
	await expect(page.getByRole('radio', { name: 'Pods' })).toBeChecked();
	await expect(ingredients(page).getByText('vanilla pod')).toBeVisible();
	await expect(ingredients(page)).toContainText('cup');

	const history = await page.evaluate(() => history.length);
	await page.getByRole('button', { name: 'Fewer servings' }).first().click();
	await expect(page).toHaveURL(/serves=5/);
	expect(await page.evaluate(() => history.length)).toBe(history);
});

test('a shared link can scale by multiplier', async ({ page }) => {
	await page.goto(`${brulee}?x=2`);
	await waitForCore(page);
	await expect(page.getByText('Scaled x2')).toBeVisible();
	await expect(ingredients(page).getByText('1 l')).toBeVisible();
	await expect(page.getByText('Cook in batches')).toBeVisible();
	await expect(method(page).getByText('Check from the original time').first()).toBeVisible();
	await page.getByRole('button', { name: 'Reset', exact: true }).first().click();
	await expect(page).not.toHaveURL(/x=2/);
});

test('an amount toggles through the units of the chosen system only, and the hint can be dismissed for good', async ({
	page
}) => {
	await page.goto(brulee);
	await waitForCore(page);
	await expect(page.getByText('Tap an amount to change its unit')).toBeVisible();

	const cream = ingredients(page)
		.getByRole('button', { name: /, show in / })
		.first();
	await expect(cream).toHaveText('500 ml');
	await expect(cream).toHaveAttribute('aria-label', '500 ml, show in l');
	await cream.click();
	await expect(cream).toHaveText('0.5 l');
	await expect(page.getByText('Tap an amount to change its unit')).toHaveCount(0);
	const seen = ['500 ml', '0.5 l'];
	for (let n = 0; n < 3; n++) {
		await cream.click();
		seen.push((await cream.textContent()) ?? '');
	}
	expect(seen.at(-1)).toBe('500 ml');
	expect(seen.some((text) => /cup|oz/.test(text))).toBe(false);

	await page.getByRole('radio', { name: 'US', exact: true }).check({ force: true });
	const us = ingredients(page)
		.getByRole('button', { name: /, show in / })
		.first();
	for (let n = 0; n < 4; n++) {
		expect(await us.textContent()).not.toMatch(/ml|\bl\b/);
		await us.click();
	}

	await page.reload();
	await waitForCore(page);
	await expect(page.getByText('Tap an amount to change its unit')).toHaveCount(0);
});

test('the hint can be dismissed without using it', async ({ page }) => {
	await page.goto(brulee);
	await waitForCore(page);
	await page.getByRole('button', { name: 'Dismiss the hint' }).click();
	await page.reload();
	await waitForCore(page);
	await expect(page.getByText('Tap an amount to change its unit')).toHaveCount(0);
});

test('ticks stay between visits and can be reset', async ({ page }) => {
	await page.goto(brulee);
	await waitForCore(page);
	await ingredients(page).getByRole('checkbox').nth(1).check();
	await method(page).getByRole('checkbox').first().check();
	await expect(ingredients(page).getByText('1 of 5')).toBeVisible();
	await expect(method(page).getByText('1 of 9')).toBeVisible();

	await page.reload();
	await expect(ingredients(page).getByText('1 of 5')).toBeVisible();
	await expect(ingredients(page).getByRole('checkbox').nth(1)).toBeChecked();
	await ingredients(page).getByRole('button', { name: 'Reset' }).click();
	await expect(ingredients(page).getByText('0 of 5')).toBeVisible();
	await expect(method(page).getByText('1 of 9')).toBeVisible();
});

test('a timer pill starts a timer that counts down and can be dismissed from the strip', async ({
	page
}) => {
	await page.goto(brulee);
	await waitForCore(page);
	const pill = method(page).getByRole('button', { name: /Start 15-20 min timer/ });
	await pill.click();
	const shown = method(page).getByRole('button', { name: /^Show the .* timer/ });
	await expect(shown).toHaveText(/^\s*1[45]:\d\d$/);
	const timers = page.getByRole('region', { name: 'Timers' });
	await timers.getByRole('button', { name: /^Dismiss/ }).click();
	await expect(pill).toBeVisible();
});

test('oven temperatures follow the units and carry the gas mark', async ({ page }) => {
	await page.goto(brulee);
	await waitForCore(page);
	await expect(method(page).getByText('130 °C (120 °C fan)')).toHaveAttribute(
		'title',
		'Gas mark ½'
	);
	await page.getByRole('radio', { name: 'US', exact: true }).check();
	await expect(method(page).getByText(/275 °F/)).toBeVisible();
});

test('scaling to a pan and by an ingredient work from the extra controls', async ({ page }) => {
	await page.goto('desserts/french-classics/creme-brulee');
	await waitForCore(page);
	await expect(page.getByRole('button', { name: 'What is scaling another way?' })).toBeVisible();
	await page.getByText('Scale another way').click();
	await page.getByLabel('Amount', { exact: true }).fill('1000');
	await page.getByLabel('Unit', { exact: true }).selectOption('ml');
	await page.getByRole('button', { name: 'Scale to this' }).click();
	await expect(page.getByText('Scaled x2')).toBeVisible();
	await expect(page).toHaveURL(/have=double-cream:1000ml/);

	await page.getByLabel('Amount', { exact: true }).fill('');
	await page.getByRole('button', { name: 'Scale to this' }).click();
	await expect(page.getByText('Enter an amount above zero.')).toBeVisible();
});

test('the recipe page is structured data for search engines', async ({ page }) => {
	await page.goto(brulee);
	const ld = await page.locator('script[type="application/ld+json"]').textContent();
	const parsed = JSON.parse(ld ?? '{}');
	expect(parsed['@type']).toBe('Recipe');
	expect(parsed.recipeIngredient).toContain('500 ml double cream');
	await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', /creme-brulee$/);
});

test('step text joins exactly as written around timers, and a redundant alt is not shown', async ({
	page
}) => {
	await page.goto('main-courses/beef-steak/beef-wellington');
	await expect(method(page)).toContainText('chill for 15 min, until it has set.');
	await expect(method(page)).toContainText('Rest for 15-20 min. Slice');
	await expect(ingredients(page)).toContainText('1 kg chateaubriand beef fillet');
	await expect(ingredients(page)).not.toContainText('(1 kg)');
});

test('counts use the singular when there is one', async ({ page }) => {
	await page.goto('./');
	await expect(page.getByText('1 recipe', { exact: true }).first()).toBeVisible();
	await expect(page.getByText('1 recipes')).toHaveCount(0);
});
