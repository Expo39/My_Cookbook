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
	await page.keyboard.press('/');
	const box = page.getByRole('search').first().getByRole('combobox');
	await expect(box).toBeFocused();
	await box.fill('lamb');
	await box.press('Enter');
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

test('suggestions appear while typing and the keyboard picks one', async ({ page }) => {
	await page.goto('./');
	const box = page.getByRole('main').getByRole('combobox', { name: 'Search recipes' });
	await box.fill('wellin');
	const list = page.getByRole('main').getByRole('listbox', { name: 'Suggestions' });
	await expect(list.getByRole('option', { name: 'Beef Wellington' })).toBeVisible();
	await box.press('ArrowDown');
	await expect(box).toHaveAttribute('aria-activedescendant', /option-0$/);
	await box.press('Enter');
	await expect(page).toHaveURL(/beef-wellington$/);
});

test('a misspelt query is offered the spelling the cookbook knows', async ({ page }) => {
	await page.goto('search?q=wellingtn');
	await page.getByRole('button', { name: 'wellington' }).click();
	await expect(page.getByRole('main').getByLabel('Search recipes')).toHaveValue('wellington');
	await expect(page.getByRole('link', { name: 'Beef Wellington' })).toBeVisible();
});

test('the search page shows how to search, and each example tries itself', async ({ page }) => {
	await page.goto('search');
	const guide = page.getByRole('heading', { name: 'How to search' }).locator('..');
	await expect(guide).toBeVisible();
	await guide.getByRole('button', { name: 'pasta tomato' }).click();
	const field = page.getByRole('main').getByLabel('Search recipes', { exact: true });
	await expect(field).toHaveValue('pasta tomato');
	await expect(page.getByText(/recipes? found/)).toBeVisible();
	await expect(guide).toBeHidden();

	await field.fill('');
	await page.getByRole('radio', { name: 'I have these ingredients' }).check({ force: true });
	await page.getByRole('button', { name: 'eggs, flour, milk' }).click();
	await expect(page.getByLabel('Ingredients you have', { exact: true })).toHaveValue(
		'eggs, flour, milk'
	);
	await expect(page.getByText(/recipes? found/)).toBeVisible();
});

test('a comma in the name search offers the ingredients search instead', async ({ page }) => {
	await page.goto('search?q=eggs%2C%20flour');
	await expect(page.getByText('Looks like a list of ingredients.')).toBeVisible();
	await page.getByRole('button', { name: 'Search by ingredients' }).click();
	await expect(page.getByRole('radio', { name: 'I have these ingredients' })).toBeChecked();
	await expect(page.getByText('Looks like a list of ingredients.')).toHaveCount(0);
	await expect(page).toHaveURL(/m=have/);
});

test('the info circle explains the search in use', async ({ page }) => {
	await page.goto('search');
	await page.getByRole('button', { name: 'What is searching?' }).click();
	await expect(page.getByText(/Several words find recipes with all of them/)).toBeAttached();
});

test.describe('a reload of a search', () => {
	test.use({ serviceWorkers: 'block' });

	test('waits for the results instead of showing the help first', async ({ page }) => {
		await page.route('**/_app/immutable/**/*.js', (route) => route.abort());
		await page.goto('search?q=pasta');
		await expect(page.getByRole('heading', { name: 'How to search' })).toBeHidden();
		await expect(page.getByText('Loading search...')).toBeVisible();
		await page.goto('search');
		await expect(page.getByRole('heading', { name: 'How to search' })).toBeVisible();
	});
});
