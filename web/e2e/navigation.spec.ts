import { expect, test } from '@playwright/test';
import { watchErrors } from './helpers';

test('home to section to recipe, and back by breadcrumb', async ({ page }) => {
	const errors = watchErrors(page);
	await page.goto('./');
	await expect(page.getByRole('heading', { level: 1 })).toHaveText("Sapori ta' l-kċina");
	await expect(page.getByText("Antonio's recipes from a Maltese kitchen")).toBeVisible();

	await page.getByRole('main').getByRole('link', { name: 'First Courses' }).click();
	await expect(page).toHaveURL(/\/first-courses$/);
	await expect(page.getByRole('heading', { level: 1 })).toHaveText('First Courses');

	await page.getByRole('link', { name: 'One-Pot Pasta with Fresh Tomatoes' }).click();
	await expect(page).toHaveURL(/\/first-courses\/pasta\/one-pot-pasta-with-fresh-tomatoes$/);
	await expect(page.getByRole('heading', { level: 1 })).toHaveText(
		'One-Pot Pasta with Fresh Tomatoes'
	);

	await page
		.getByRole('navigation', { name: 'Breadcrumb' })
		.getByRole('link', { name: 'Pasta' })
		.click();
	await expect(page.getByRole('heading', { level: 1 })).toHaveText('Pasta');
	expect(errors()).toEqual([]);
});

test('home shows a card for every top-level section and three recent recipes', async ({ page }) => {
	await page.goto('./');
	const main = page.getByRole('main');
	for (const name of ['First Courses', 'Main Courses', 'Soups', 'Desserts', 'Sides']) {
		await expect(main.getByRole('heading', { level: 3, name })).toBeVisible();
	}
	await expect(
		page.getByRole('region', { name: 'Recently added' }).getByRole('article')
	).toHaveCount(3);
});

test('an unknown address shows the not-found page', async ({ page }) => {
	await page.goto('no/such/page');
	await expect(page.getByRole('heading', { level: 1 })).toHaveText(
		'That page is not in the cookbook'
	);
	await expect(page.getByRole('link', { name: 'Back to the home page' })).toBeVisible();
});

test('the recipe is readable and complete with JavaScript off', async ({ browser }) => {
	const context = await browser.newContext({ javaScriptEnabled: false });
	const page = await context.newPage();
	await page.goto('main-courses/beef-steak/beef-wellington');
	await expect(page.getByRole('heading', { level: 1 })).toHaveText('Beef Wellington');
	await expect(page.getByRole('heading', { name: 'Day 1: the night before' })).toBeVisible();
	await expect(page.getByText('1 kg', { exact: true })).toBeVisible();
	await expect(page.getByText('200 °C').first()).toBeVisible();
	await context.close();
});
