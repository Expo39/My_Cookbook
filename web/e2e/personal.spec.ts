import { expect, test, type Page } from '@playwright/test';
import { waitForCore } from './helpers';

/** Adds a recipe through the editor, without a token, the way a visitor would. */
async function addRecipe(page: Page, title: string) {
	await page.goto('edit');
	await page.getByLabel('Title', { exact: true }).fill(title);
	await page.getByLabel('Summary', { exact: true }).fill('A family favourite from the village.');
	await page.getByRole('textbox', { name: 'Servings', exact: true }).fill('4');
	await page.getByLabel('Section', { exact: true }).selectOption('soups');
	await page.getByRole('button', { name: 'Paste a list' }).click();
	await page.getByLabel('One ingredient per line').fill('1 kg pumpkin\n2 onions\nsalt, to taste');
	await page.getByRole('button', { name: 'Review' }).click();
	await page.getByRole('button', { name: /^Add 3 ingredients/ }).click();
	await page
		.getByLabel('Step 1', { exact: true })
		.fill('Simmer the pumpkin and onions for 25 minutes, then blend.');
	await expect(page.getByRole('list', { name: 'Found in step 1' })).toContainText('25 min timer');
	await page.getByRole('button', { name: 'Save recipe' }).click();
	await expect(page.getByText('It is on this device, ready to cook from.')).toBeVisible();
}

test('a recipe added on the device survives a reload and cooks like any other', async ({
	page
}) => {
	await addRecipe(page, "Nanna's minestra");
	await page.reload();
	await page.goto('./');
	const mine = page.getByRole('region', { name: 'Your recipes' });
	await mine.getByRole('link', { name: "Nanna's minestra" }).click();
	await expect(page).toHaveURL(/mine\?id=soups%2Fnannas-minestra/);
	await waitForCore(page);
	await expect(page.getByText('kept in this browser only')).toBeVisible();
	await expect(
		page
			.getByRole('region', { name: 'Method' })
			.getByRole('button', { name: /^Start 25 min timer/ })
	).toBeVisible();
	await page.getByRole('button', { name: 'More servings' }).first().click();
	await expect(page).toHaveURL(/serves=5/);

	// Steps written in words come back as the same words in the editor.
	await page.getByRole('link', { name: 'Edit' }).first().click();
	await expect(page.getByLabel('Step 1', { exact: true })).toHaveValue(
		'Simmer the pumpkin and onions for 25 minutes, then blend.'
	);
});

test('your recipes are found by search and suggested while typing', async ({ page }) => {
	await addRecipe(page, 'Kusksu with broad beans');
	await page.goto('search?q=kusksu');
	await expect(page.getByRole('link', { name: 'Kusksu with broad beans' })).toBeVisible();
	const search = page.getByRole('combobox', { name: 'Search recipes' }).first();
	await search.fill('kusk');
	await expect(page.getByRole('option', { name: /Kusksu with broad beans/ })).toBeVisible();
});

test('clearing your recipes asks first, names how many, and removes them all', async ({ page }) => {
	await addRecipe(page, 'Soppa tal-armla');
	await page.goto('./');
	await page.getByRole('button', { name: 'Settings' }).click();
	const drawer = page.getByRole('dialog', { name: 'Settings' });
	await expect(drawer.getByText('1 recipe on this device')).toBeVisible();
	await drawer.getByRole('button', { name: 'Clear all personal recipes' }).click();
	const confirm = page.getByRole('dialog', { name: 'Clear all personal recipes?' });
	await expect(confirm).toContainText('This deletes 1 recipe from this device');
	await confirm.getByRole('button', { name: 'Delete 1 recipe' }).click();
	await expect(drawer.getByText('No recipes of your own yet')).toBeVisible();
	await page.keyboard.press('Escape');
	await page.reload();
	await expect(page.getByRole('link', { name: 'Soppa tal-armla' })).toHaveCount(0);
});
