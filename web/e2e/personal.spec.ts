import { expect, test, type Page } from '@playwright/test';
import { waitForCore } from './helpers';

/** Adds a recipe through the editor, without a token, the way a visitor would. */
async function addRecipe(page: Page, title: string) {
	await page.goto('edit');
	const gotIt = page.getByRole('button', { name: 'Got it' });
	if (await gotIt.isVisible()) await gotIt.click();
	await page.getByLabel('Title', { exact: true }).fill(title);
	await page.getByLabel('Summary', { exact: true }).fill('A family favourite from the village.');
	await page.getByRole('textbox', { name: 'Servings', exact: true }).fill('4');
	await page.getByLabel('Section', { exact: true }).selectOption('soups');
	await page.getByLabel('One ingredient per line').fill('1 kg pumpkin\n2 onions\nsalt, to taste');
	const reads = page.getByRole('heading', { name: 'How it will read' }).locator('..');
	await expect(reads.getByRole('listitem')).toHaveCount(3);
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

test('the first time a cook adds a recipe, they are told where it is kept, once', async ({
	page
}) => {
	await page.goto('edit');
	const note = page.getByRole('note').filter({ hasText: 'saved only in this browser' });
	await expect(note).toBeVisible();
	await note.getByRole('button', { name: 'Got it' }).click();
	await expect(note).toHaveCount(0);
	await page.reload();
	await expect(
		page.getByText('Saved only in this browser on this device.', { exact: true })
	).toBeVisible();
	await expect(page.getByRole('button', { name: 'Got it' })).toHaveCount(0);
});

test('the ingredient list reads back as it is written, and line by line keeps every line', async ({
	page
}) => {
	await page.goto('edit');
	await page.getByRole('button', { name: 'Got it' }).click();
	await expect(page.getByText('Ways to write a line')).toBeVisible();
	await page
		.getByLabel('One ingredient per line')
		.fill('1. 400g  plain flour\n\u2022 2 eggs\nFor the filling:\n500 g ricotta\n250');
	const reads = page.getByRole('heading', { name: 'How it will read' }).locator('..');
	await expect(reads.getByRole('listitem')).toHaveCount(4);
	await expect(reads.getByText('For the filling')).toBeVisible();
	await expect(reads.getByRole('listitem').first()).toContainText('400 g');
	await expect(reads.getByText(/Check this line/)).toHaveCount(1);

	await page.getByRole('radio', { name: 'Line by line' }).check({ force: true });
	await expect(page.getByLabel('Name of this part').nth(1)).toHaveValue('For the filling');
	await expect(page.getByLabel('Ingredient', { exact: true })).toHaveCount(4);
	await page.getByLabel('Ingredient', { exact: true }).first().fill('strong flour');
	await page.getByRole('radio', { name: 'Write the list' }).check({ force: true });
	await expect(page.getByLabel('One ingredient per line')).toHaveValue(
		/^400 g strong flour\n2 eggs\n\nFor the filling:\n500 g ricotta\n250$/
	);
});

test('each point under Before you save takes the cook to its field, and the page stays usable', async ({
	page
}) => {
	await page.setViewportSize({ width: 1280, height: 900 });
	await page.goto('edit');
	await page.getByRole('button', { name: 'Got it' }).click();
	await page.getByLabel('Title', { exact: true }).fill('Orange Asparagus');
	await page.getByLabel('Section', { exact: true }).selectOption('sides');
	const checks = page.getByRole('region', { name: 'Before you save' });
	await expect(checks.getByText(/things? left to fill in/)).toBeVisible();
	const targets: Record<string, string> = {
		'There is already a recipe with this name. Change the name a little.': 'f-title',
		'Add a sentence or two about the dish.': 'f-summary',
		'Add the ingredients.': 'f-ingredientGroups',
		'Step 1 is empty. Write it, or remove it.': 'f-steps-0-text'
	};
	for (const [point, field] of Object.entries(targets)) {
		await checks.getByRole('button', { name: point }).click();
		await expect(page.locator(`#${field}`)).toBeFocused();
	}
	await page.getByLabel('Title', { exact: true }).fill('Orange Asparagus, my way');
	await expect(checks.getByRole('button', { name: /already a recipe/ })).toHaveCount(0);
});

test('a new section can be added for a recipe kept on the device', async ({ page }) => {
	await page.goto('edit');
	await page.getByRole('button', { name: 'Got it' }).click();
	await page.getByRole('button', { name: 'New section', exact: true }).click();
	await expect(page.getByText(/stays with your recipe on this device/)).toBeVisible();
	await page.getByLabel('Name', { exact: true }).fill('Family Feasts');
	await page.getByRole('button', { name: 'Add', exact: true }).click();
	await expect(page.getByLabel('Section', { exact: true })).toHaveValue('family-feasts');
});

test('your recipes export as text, a spreadsheet or JSON', async ({ page }) => {
	await addRecipe(page, 'Ross il-forn');
	await page.goto('./');
	await page.getByRole('button', { name: 'Settings' }).click();
	const drawer = page.getByRole('dialog', { name: 'Settings' });
	await expect(drawer.getByText(/Saved only in this browser on this device/)).toBeVisible();
	for (const [label, extension, opening] of [
		['Text', 'txt', 'Ross il-forn\n4 servings'],
		['Spreadsheet (CSV)', 'csv', '\uFEFFTitle,Section,Servings'],
		['JSON', 'json', '{\n  "kind": "sapori-recipes"']
	] as const) {
		await drawer.getByRole('button', { name: 'Export your recipes' }).click();
		const dialog = page.getByRole('dialog', { name: 'Export your recipes' });
		const [download] = await Promise.all([
			page.waitForEvent('download'),
			dialog.getByRole('button', { name: new RegExp(`^${label.replace(/[()]/g, '\\$&')}`) }).click()
		]);
		expect(download.suggestedFilename()).toMatch(
			new RegExp(`^my-recipes-\\d{4}-\\d{2}-\\d{2}\\.${extension}$`)
		);
		const path = await download.path();
		const { readFileSync } = await import('node:fs');
		expect(readFileSync(path, 'utf8').startsWith(opening)).toBe(true);
		await expect(dialog).toBeHidden();
	}
});

test('about once a week the home page reminds a cook to export, until they do', async ({
	page
}) => {
	await addRecipe(page, 'Bigilla');
	await page.goto('./');
	const reminder = page.getByRole('complementary', { name: 'Export your recipes' });
	await expect(reminder).toHaveCount(0);

	await page.evaluate(() =>
		localStorage.setItem(
			'sapori:device-notice',
			JSON.stringify({ read: 1, quiet: Date.now() - 8 * 24 * 60 * 60 * 1000 })
		)
	);
	await page.reload();
	await expect(reminder).toContainText('Your recipes are only in this browser.');
	await reminder.getByRole('button', { name: 'Remind me next week' }).click();
	await expect(reminder).toHaveCount(0);
	await page.reload();
	await expect(reminder).toHaveCount(0);
});

test('a recipe kept on the device can be shared as a card, but has no link yet', async ({
	page
}) => {
	await addRecipe(page, 'Imqarrun il-forn');
	await page.goto('mine?id=soups%2Fimqarrun-il-forn');
	await waitForCore(page);
	await page.getByRole('button', { name: 'Share', exact: true }).click();
	const sheet = page.getByRole('dialog', { name: 'Share' });
	await expect(
		sheet.getByRole('img', { name: /The recipe card for Imqarrun il-forn/ })
	).toBeVisible();
	await expect(sheet.getByRole('button', { name: 'Send the link' })).toBeDisabled();
	await expect(sheet.getByText('so it has no link yet')).toBeVisible();
});

test.describe('the first paint of a reload', () => {
	test.use({ serviceWorkers: 'block' });

	const top = (page: Page, name: string) =>
		page
			.getByRole('heading', { name, exact: true })
			.evaluate((element) => Math.round(element.getBoundingClientRect().top + scrollY));

	test('holds room for your recipes on the home and section pages, so nothing below jumps', async ({
		page
	}) => {
		await addRecipe(page, "Nanna's minestra");
		await addRecipe(page, 'Kusksu');
		await page.goto('./');
		await expect(page.getByRole('region', { name: 'Your recipes' }).getByRole('link')).toHaveCount(
			3
		);
		const settled = await top(page, 'Recently added');

		await page.route('**/_app/immutable/**/*.js', (route) => route.abort());
		await page.reload();
		await expect(page.locator('ul[data-ghosts="mine"] > li:visible')).toHaveCount(2);
		await expect(page.getByText('Add your own recipes and cook from them here.')).toBeHidden();
		expect(Math.abs((await top(page, 'Recently added')) - settled)).toBeLessThanOrEqual(8);

		await page.goto('soups');
		await expect(page.locator('ul[data-ghosts="mine"] > li:visible')).toHaveCount(2);
		await page.goto('desserts');
		await expect(page.locator('ul[data-ghosts="mine"] > li:visible')).toHaveCount(0);
	});

	test('draws the final page at once for a visitor with nothing saved', async ({ page }) => {
		await page.route('**/_app/immutable/**/*.js', (route) => route.abort());
		await page.goto('./');
		await expect(page.getByText('Add your own recipes and cook from them here.')).toBeVisible();
		await expect(page.locator('ul[data-ghosts] > li:visible')).toHaveCount(0);
		await page.goto('favourites');
		await expect(page.getByText('No favourites yet.')).toBeVisible();
	});

	test('holds room for favourites and recently viewed recipes', async ({ page }) => {
		await page.goto('desserts/french-classics/creme-brulee');
		await waitForCore(page);
		await page.getByRole('button', { name: 'Favourite' }).first().click();
		await page.route('**/_app/immutable/**/*.js', (route) => route.abort());
		await page.goto('favourites');
		await expect(page.locator('ul[data-ghosts="favourites"] > li:visible')).toHaveCount(1);
		await expect(page.locator('ul[data-ghosts="recent"] > li:visible')).toHaveCount(1);
		await expect(page.getByText('No favourites yet.')).toBeHidden();
		await expect(page.getByText('Recipes you open will appear here.')).toBeHidden();
	});
});
