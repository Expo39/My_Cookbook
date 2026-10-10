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
	await expect(page.getByText('Scaled ×2')).toBeVisible();
	await expect(ingredients(page).getByText('1 l')).toBeVisible();
	await expect(page.getByText('Cook in batches')).toBeVisible();
	await expect(method(page).getByText('Check from the original time').first()).toBeVisible();
	await page.getByRole('button', { name: 'Reset', exact: true }).first().click();
	await expect(page).not.toHaveURL(/x=2/);
});

test('an amount cycles through its units on click, and the hint can be dismissed for good', async ({
	page
}) => {
	await page.goto(brulee);
	await waitForCore(page);
	await expect(page.getByText('Tap an amount to change its unit')).toBeVisible();

	const cream = ingredients(page)
		.getByRole('button', { name: /^Show in/ })
		.first();
	await expect(cream).toHaveText('500 ml');
	await expect(cream).toHaveAttribute('aria-label', 'Show in l');
	await cream.click();
	await expect(cream).toHaveText('0.5 l');
	await expect(cream).toHaveAttribute('aria-label', 'Show in tsp');
	await expect(page.getByText('Tap an amount to change its unit')).toHaveCount(0);

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

test('a timer pill counts down and can be stopped', async ({ page }) => {
	await page.goto(brulee);
	await waitForCore(page);
	const pill = method(page).getByRole('button', { name: /Start 15–20 min timer/ });
	await pill.click();
	await expect(method(page).getByRole('button', { name: 'Stop the timer' }).first()).toHaveText(
		/^\s*1[45]:\d\d$/
	);
	await method(page).getByRole('button', { name: 'Stop the timer' }).first().click();
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
	await page.getByText('Scale another way').click();
	await page.getByLabel('Amount').fill('1000');
	await page.getByLabel('Unit').selectOption('ml');
	await page.getByRole('button', { name: 'Scale to this' }).click();
	await expect(page.getByText('Scaled ×2')).toBeVisible();
	await expect(page).toHaveURL(/have=heavy-cream:1000ml/);

	await page.getByLabel('Amount').fill('');
	await page.getByRole('button', { name: 'Scale to this' }).click();
	await expect(page.getByText('Enter an amount above zero.')).toBeVisible();
});

test('the recipe page is structured data for search engines', async ({ page }) => {
	await page.goto(brulee);
	const ld = await page.locator('script[type="application/ld+json"]').textContent();
	const parsed = JSON.parse(ld ?? '{}');
	expect(parsed['@type']).toBe('Recipe');
	expect(parsed.recipeIngredient).toContain('500 ml heavy cream');
	await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', /creme-brulee$/);
});
