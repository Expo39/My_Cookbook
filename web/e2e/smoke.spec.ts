import { expect, test } from '@playwright/test';
import { ingredients, recipeData, recipeIds, waitForCore, watchErrors } from './helpers';

test.describe.configure({ mode: 'parallel' });

for (const id of recipeIds) {
	test(`recipe page works: ${id}`, async ({ page }) => {
		const errors = watchErrors(page);
		const { recipe, view } = recipeData(id);

		await page.goto(id);
		await expect(page.getByRole('heading', { level: 1 })).toHaveText(recipe.title);
		await expect(page).toHaveTitle(new RegExp(recipe.title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
		await expect(ingredients(page).getByRole('checkbox').first()).toBeVisible();
		await waitForCore(page);

		const before = await ingredients(page).innerText();
		await page.getByRole('button', { name: 'More servings' }).first().click();
		await expect(page).toHaveURL(/serves=/);
		const canChange = view.groups.some((group: { items: { amount?: unknown; mode: string }[] }) =>
			group.items.some((item) => item.amount && item.mode !== 'fixed')
		);
		if (canChange) await expect.poll(() => ingredients(page).innerText()).not.toBe(before);

		await page.getByRole('radio', { name: 'US', exact: true }).check();
		await expect(page).toHaveURL(/u=us/);

		await ingredients(page).getByRole('checkbox').first().check();
		await expect(ingredients(page).getByText(/^1 of \d+$/)).toBeVisible();

		expect(errors()).toEqual([]);
	});
}
