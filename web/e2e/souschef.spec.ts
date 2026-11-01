import { expect, test, type Page, type Route } from '@playwright/test';
import { waitForCore, watchErrors } from './helpers';

const brulee = 'desserts/french-classics/creme-brulee';

const event = (name: string, data: unknown) => `event: ${name}\ndata: ${JSON.stringify(data)}\n\n`;
const streamed = (route: Route, body: string) =>
	route.fulfill({ status: 200, headers: { 'content-type': 'text/event-stream' }, body });

/**
 * Stands in for every outside service: Cloudflare Turnstile (a script that hands over a token at
 * once), the worker's status check and its answers. Returns what the worker was asked.
 */
async function fakeServices(
	page: Page,
	{ status = { gemini: 'ok', retired: null } as object | number, answer = '' } = {}
) {
	const asked: { body: Record<string, unknown>; token?: string }[] = [];
	await page.route('https://challenges.cloudflare.com/**', (route) =>
		route.fulfill({
			contentType: 'text/javascript',
			body: `window.turnstile = {
				render: (box, options) => ((window.__turnstile = options), 'widget'),
				execute: () => window.__turnstile.callback('person-token'),
				reset: () => {}
			};`
		})
	);
	await page.route('**/status', (route) =>
		typeof status === 'number'
			? route.fulfill({ status, body: '' })
			: route.fulfill({ json: status })
	);
	await page.route('**/chat', (route) => {
		asked.push({
			body: route.request().postDataJSON(),
			token: route.request().headers()['x-turnstile-token']
		});
		return streamed(
			route,
			answer ||
				event('model', { model: 'gemini-3.8-flash', fallback: false }) +
					event('delta', { text: 'Yes, up to a day ahead.' }) +
					event('done', { truncated: false })
		);
	});
	return asked;
}

async function openChef(page: Page) {
	await page.goto(brulee);
	await waitForCore(page);
	await page.getByRole('button', { name: 'Ask the sous-chef' }).first().click();
	const chef = page.getByRole('dialog', { name: 'Ask the sous-chef' });
	await expect(chef).toBeVisible();
	return chef;
}

async function ask(page: Page, question: string) {
	const box = page.getByRole('textbox', { name: 'Your question' });
	await box.fill(question);
	await box.press('Enter');
}

test('answers a question, names the model, and proves it was asked by a person', async ({
	page
}) => {
	const errors = watchErrors(page);
	const asked = await fakeServices(page);
	const chef = await openChef(page);
	await ask(page, 'Can I make it ahead?');
	await expect(chef.getByText('Yes, up to a day ahead.')).toBeVisible();
	await expect(chef.getByText('Answered by gemini-3.8-flash.')).toBeVisible();
	expect(asked).toHaveLength(1);
	expect(asked[0].token).toBe('person-token');
	expect(asked[0].body).toMatchObject({ recipeId: brulee, question: 'Can I make it ahead?' });
	expect(errors()).toEqual([]);
});

test('says when a lighter model steps in, and labels its answer', async ({ page }) => {
	await fakeServices(page, {
		answer:
			event('status', { state: 'fallback' }) +
			event('model', { model: 'gemini-flash-lite-latest', fallback: true }) +
			event('delta', { text: 'Yes.' }) +
			event('done', { truncated: false })
	});
	const chef = await openChef(page);
	await ask(page, 'Can I freeze it?');
	await expect(
		chef.getByText(
			'Answered by the lighter model, gemini-flash-lite-latest, because the main one was busy or slow to start.'
		)
	).toBeVisible();
});

test('warns of high demand as soon as it opens, and still lets the cook ask', async ({ page }) => {
	await fakeServices(page, { status: { gemini: 'busy', retired: null } });
	const chef = await openChef(page);
	await expect(chef.getByText('The AI is in high demand right now.')).toBeVisible();
	await expect(chef.getByRole('textbox', { name: 'Your question' })).toBeEnabled();
});

test('shows the high-demand message when no model can answer, with a way to try again', async ({
	page
}) => {
	await fakeServices(page, {
		answer: event('error', {
			error: 'quota',
			message: 'The sous-chef is unavailable due to high demand. Try again in a few minutes.'
		})
	});
	const chef = await openChef(page);
	await ask(page, 'How long does it keep?');
	await expect(chef.getByRole('alert')).toContainText('unavailable due to high demand');
	await expect(chef.getByRole('button', { name: 'Try again' })).toBeVisible();
});

test('says it cannot be reached, keeps the rest of the page working, and checks again', async ({
	page
}) => {
	await fakeServices(page, { status: 503 });
	const chef = await openChef(page);
	await expect(chef.getByText("The sous-chef can't be reached right now.")).toBeVisible();
	await expect(chef.getByRole('textbox', { name: 'Your question' })).toBeDisabled();

	await page.unroute('**/status');
	await page.route('**/status', (route) => route.fulfill({ json: { gemini: 'ok' } }));
	await chef.getByRole('button', { name: 'Check again' }).click();
	await expect(chef.getByRole('textbox', { name: 'Your question' })).toBeEnabled();

	await page.keyboard.press('Escape');
	await page.getByRole('button', { name: 'More servings' }).first().click();
	await expect(page).toHaveURL(/serves=/);
});

test('says the cook is offline the moment it opens', async ({ page, context }) => {
	await fakeServices(page);
	await page.goto(brulee);
	await waitForCore(page);
	await context.setOffline(true);
	await page.getByRole('button', { name: 'Ask the sous-chef' }).first().click();
	const chef = page.getByRole('dialog', { name: 'Ask the sous-chef' });
	await expect(chef.getByText("You're offline.")).toBeVisible();
	await expect(chef.getByRole('textbox', { name: 'Your question' })).toBeDisabled();
	await context.setOffline(false);
	await expect(chef.getByRole('textbox', { name: 'Your question' })).toBeEnabled();
});

test('tells only the owner when the main model has been retired', async ({ page }) => {
	await fakeServices(page, { status: { gemini: 'ok', retired: 'gemini-3.8-flash' } });
	let chef = await openChef(page);
	await expect(chef.getByText(/For the owner/)).toHaveCount(0);

	await page.evaluate(() => sessionStorage.setItem('sapori:admin-token', 'token'));
	await page.reload();
	chef = await openChef(page);
	await expect(
		chef.getByText('For the owner: Gemini no longer offers "gemini-3.8-flash".')
	).toBeVisible();
});
