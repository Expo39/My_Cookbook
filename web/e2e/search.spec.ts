import { expect, test } from '@playwright/test';
import { watchErrors } from './helpers';

test('search finds a recipe without accents, and keeps the query in the URL', async ({ page }) => {
	const errors = watchErrors(page);
	await page.goto('search');
	const field = page.getByRole('main').getByLabel('Search recipes');
	await field.fill('brulee');
	await expect(page.getByRole('link', { name: 'Crème Brûlée' })).toBeVisible();
	await expect(page).toHaveURL(/\?q=brulee$/);

	await page.reload();
	await expect(field).toHaveValue('brulee');
	await expect(page.getByRole('link', { name: 'Crème Brûlée' })).toBeVisible();
	expect(errors()).toEqual([]);
});

test('the header search opens the search page with the query', async ({ page }) => {
	await page.goto('./');
	await page.getByRole('search').first().getByRole('searchbox').fill('lamb');
	await page.getByRole('search').first().getByRole('button').click();
	await expect(page).toHaveURL(/\/search\?q=lamb$/);
	await expect(page.getByRole('link', { name: /Rack of Lamb/ })).toBeVisible();
});

test('the ingredients mode ranks recipes by how much of them the cook has', async ({ page }) => {
	await page.goto('search');
	await page.getByRole('radio', { name: 'I have these ingredients' }).check();
	await page
		.getByLabel('Ingredients you have')
		.fill('double cream, egg yolks, caster sugar, vanilla');
	const first = page.getByRole('article').first();
	await expect(first.getByRole('link')).toHaveText('Crème Brûlée');
	await expect(first.getByText(/\d+ of \d+/)).toBeVisible();
	await expect(page).toHaveURL(/m=have/);
});

test('a query with no match says so', async ({ page }) => {
	await page.goto('search?q=zzzzqx');
	await expect(page.getByText(/Nothing matches/)).toBeVisible();
});
