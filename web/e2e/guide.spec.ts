import { expect, test } from '@playwright/test';

test('the how-to page is reachable from the header and lists its parts', async ({ page }) => {
	await page.goto('./');
	await page.getByRole('link', { name: 'How to use' }).first().click();
	await expect(page.getByRole('heading', { level: 1 })).toHaveText('How to use the cookbook');
	const contents = page.getByRole('navigation', { name: 'On this page' });
	await expect(contents.getByRole('link')).toHaveCount(10);
	await contents.getByRole('link', { name: 'Sharing a recipe with everyone' }).click();
	await expect(page).toHaveURL(/#sharing$/);
	await expect(page.getByRole('heading', { name: 'The GitHub token' })).toBeVisible();
	const video = page.locator('video');
	await expect(video).toHaveAttribute('preload', 'none');
	await expect(video.locator('track[kind="captions"]')).toHaveCount(1);
});

test('the questions and answers open one at a time and are linked from the footer', async ({
	page
}) => {
	await page.goto('./');
	await page.getByRole('contentinfo').getByRole('link', { name: 'Questions and answers' }).click();
	await expect(page).toHaveURL(/how-to-use#questions$/);
	const question = page.getByText('Why does the sous-chef say the AI is in high demand?');
	const answer = page.getByText(/The AI behind it is shared/);
	await expect(answer).toBeHidden();
	await question.click();
	await expect(answer).toBeVisible();
	await expect(page.getByText('A recipe teaches you to cook.')).toBeVisible();
});

test('AI crawlers are asked to stay away while search engines are welcome', async ({
	page,
	request
}) => {
	await page.goto('./');
	await expect(page.locator('meta[name="robots"][content*="noai"]')).toHaveCount(1);
	const robots = await (await request.get('robots.txt')).text();
	expect(robots).toMatch(/User-agent: GPTBot\nDisallow: \//);
	expect(robots).toMatch(/User-agent: \*\nAllow: \//);
});
