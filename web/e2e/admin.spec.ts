import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { recipeData, recipeIds } from './helpers';

const recipesDir = new URL('../../recipes/', import.meta.url);
const original = (id: string) => readFileSync(new URL(`${id}.json`, recipesDir), 'utf8');

const related = (id: string): string[] => recipeData(id).recipe.related ?? [];
const linkedTo = new Set(recipeIds.flatMap(related));
const linked = recipeIds.find((id) => linkedTo.has(id)) as string;
const unlinked = recipeIds.find(
	(id) => !linkedTo.has(id) && !recipeData(id).recipe.variants
) as string;
const linkers = recipeIds.filter((id) => related(id).includes(linked));

const PNG =
	'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

interface Request {
	method: string;
	path: string;
	body?: Record<string, unknown>;
}

/** A stand-in for the parts of the GitHub API the editor uses, recording what it is sent. */
async function mockGitHub(page: Page, options: { build?: 'live' | 'failed' } = {}) {
	const requests: Request[] = [];
	const blobs = new Map<string, string>();
	const state = { adminBlob: null as unknown };

	await page.route('**/admin.json', (route) =>
		state.adminBlob
			? route.fulfill({ json: state.adminBlob })
			: route.fulfill({ status: 404, body: '' })
	);

	await page.route('https://api.github.com/**', async (route) => {
		const request = route.request();
		const path = new URL(request.url()).pathname.replace(/^\/repos\/[^/]+\/[^/]+/, '');
		const body = request.postDataJSON() as Record<string, unknown> | null;
		requests.push({ method: request.method(), path, body: body ?? undefined });

		if (path === '/git/blobs') {
			const sha = `blob-${blobs.size + 1}`;
			blobs.set(sha, body?.content as string);
			return route.fulfill({ status: 201, json: { sha } });
		}
		if (path === '/git/trees') {
			for (const entry of (body?.tree ?? []) as { path: string; sha: string }[]) {
				if (entry.path === 'web/static/admin.json') {
					state.adminBlob = JSON.parse(blobs.get(entry.sha) as string);
				}
			}
			return route.fulfill({ status: 201, json: { sha: 'tree-1' } });
		}
		if (path.startsWith('/git/ref/')) return route.fulfill({ json: { object: { sha: 'head-1' } } });
		if (path.startsWith('/git/commits/'))
			return route.fulfill({ json: { tree: { sha: 'tree-0' } } });
		if (path === '/git/commits') return route.fulfill({ status: 201, json: { sha: 'commit-1' } });
		if (path.startsWith('/git/refs/')) return route.fulfill({ json: {} });
		if (path.startsWith('/actions/runs')) {
			const failed = options.build === 'failed';
			return route.fulfill({
				json: {
					workflow_runs: [
						{
							id: 1,
							name: 'CI',
							status: 'completed',
							conclusion: failed ? 'failure' : 'success',
							html_url: 'https://github.com/example/run/1'
						},
						...(failed
							? []
							: [
									{
										id: 2,
										name: 'Deploy',
										status: 'completed',
										conclusion: 'success',
										html_url: 'https://github.com/example/run/2'
									}
								])
					]
				}
			});
		}
		return route.fulfill({ json: { permissions: { push: true } } });
	});

	const tree = () =>
		(requests.filter((r) => r.path === '/git/trees').at(-1)?.body?.tree ?? []) as {
			path: string;
			sha: string | null;
		}[];
	const contentAt = (path: string) => {
		const sha = tree().find((entry) => entry.path === path)?.sha;
		return sha ? blobs.get(sha) : undefined;
	};
	const commits = () => requests.filter((r) => r.path === '/git/commits');
	return { requests, tree, contentAt, commits };
}

/** A tab that is already unlocked, as one is after the password has been entered. */
const unlocked = (page: Page) =>
	page.addInitScript(() => sessionStorage.setItem('sapori:admin-token', 'test-token'));

const saveButton = (page: Page) => page.getByRole('button', { name: 'Save recipe' });

async function fillNewRecipe(page: Page) {
	await page.getByLabel('Title', { exact: true }).fill('Lemon Tart');
	await page.getByLabel('Summary').fill('A sharp, bright tart with a crisp base.');
	await page.getByLabel('Prep (minutes)').fill('20');
	await page.getByLabel('Cook (minutes)').fill('30');
	await page.getByLabel('Amount', { exact: true }).fill('200');
	await page.getByLabel('Unit', { exact: true }).selectOption('g');
	await page.getByLabel('Ingredient', { exact: true }).fill('caster sugar');
	await page.locator('#f-steps-0-text').fill('Bake at {temp:180} for {timer:30}.');
}

test.describe('setting up and unlocking', () => {
	test('sets up editing once, then unlocks with the password', async ({ page }) => {
		const github = await mockGitHub(page);
		await page.goto('./');
		await page.getByRole('button', { name: 'Settings' }).click();
		const drawer = page.getByRole('dialog', { name: 'Settings' });
		await expect(drawer.getByRole('button', { name: 'Set up editing' })).toBeVisible();

		await drawer.getByLabel('GitHub token').fill('github_pat_example');
		await drawer.getByLabel('Password', { exact: true }).fill('too short');
		await drawer.getByLabel('Repeat the password').fill('too short');
		await drawer.getByRole('button', { name: 'Set up editing' }).click();
		await expect(drawer.getByRole('alert')).toContainText('at least 12 characters');
		expect(github.commits()).toHaveLength(0);

		await drawer.getByLabel('Password', { exact: true }).fill('a long enough password');
		await drawer.getByLabel('Repeat the password').fill('a long enough password');
		await drawer.getByRole('button', { name: 'Set up editing' }).click();
		await expect(drawer.getByText('Editing is unlocked.')).toBeVisible();

		expect(github.commits()).toHaveLength(1);
		expect(github.commits()[0].body?.message).toBe('chore(admin): set up editing');
		expect(github.tree().map((entry) => entry.path)).toEqual(['web/static/admin.json']);
		const blob = JSON.parse(github.contentAt('web/static/admin.json') as string);
		expect(blob).toMatchObject({
			v: 1,
			kdf: { name: 'PBKDF2', hash: 'SHA-256', iterations: 600000 }
		});
		expect(JSON.stringify(blob)).not.toContain('github_pat_example');

		await drawer.getByRole('button', { name: 'Lock editing' }).click();
		await drawer.getByLabel('Password').fill('not the right password');
		await drawer.getByRole('button', { name: 'Unlock editing' }).click();
		await expect(drawer.getByRole('alert')).toContainText('That password did not work');

		await drawer.getByLabel('Password').fill('a long enough password');
		await drawer.getByRole('button', { name: 'Unlock editing' }).click();
		await expect(drawer.getByRole('link', { name: 'New recipe' })).toBeVisible();
	});

	test('shows Edit on a recipe only while editing is unlocked', async ({ page }) => {
		await unlocked(page);
		await page.goto(recipeIds[0]);
		const edit = page.getByRole('link', { name: 'Edit', exact: true });
		await expect(edit).toHaveAttribute(
			'href',
			new RegExp(`edit\\?id=${encodeURIComponent(recipeIds[0])}$`)
		);

		await page.getByRole('button', { name: 'Settings' }).click();
		await page
			.getByRole('dialog', { name: 'Settings' })
			.getByRole('button', { name: 'Lock editing' })
			.click();
		await expect(edit).toBeHidden();
	});

	test('keeps the editor behind the password and out of search engines', async ({ page }) => {
		await mockGitHub(page);
		await page.goto('edit');
		await expect(page.getByRole('heading', { name: 'Editing is locked' })).toBeVisible();
		await expect(page.getByRole('main').getByLabel('GitHub token')).toBeVisible();
		await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex/);
	});
});

test.describe('the editor', () => {
	test('adds a recipe with a photo to a new subsection in one commit', async ({ page }) => {
		const github = await mockGitHub(page);
		await unlocked(page);
		await page.goto('edit?section=desserts');
		await expect(saveButton(page)).toBeEnabled();

		await fillNewRecipe(page);
		await page.getByLabel('New section').fill('Tarts');
		await page.getByRole('button', { name: /^Add inside/ }).click();
		await expect(page.getByLabel('Section', { exact: true })).toHaveValue('desserts/tarts');
		await expect(page.getByLabel('Web address')).toHaveValue('lemon-tart');

		await page.locator('#photo-file').setInputFiles({
			name: 'tart.png',
			mimeType: 'image/png',
			buffer: Buffer.from(PNG, 'base64')
		});
		await expect(page.getByRole('img', { name: 'The chosen photo' })).toBeVisible();
		await page.getByLabel('Describe the photo').fill('A golden lemon tart');

		await expect(
			page
				.getByRole('status')
				.filter({ hasText: /Ready to save|suggestion/ })
				.first()
		).toBeVisible();
		await saveButton(page).click();
		await expect(page.getByText('Live.')).toBeVisible();

		expect(github.commits()).toHaveLength(1);
		expect(github.commits()[0].body?.message).toBe('content(recipes): add Lemon Tart');
		expect(
			github
				.tree()
				.map((entry) => entry.path)
				.sort()
		).toEqual([
			'recipes/desserts/tarts/_section.json',
			'recipes/desserts/tarts/lemon-tart.jpg',
			'recipes/desserts/tarts/lemon-tart.json'
		]);
		expect(JSON.parse(github.contentAt('recipes/desserts/tarts/_section.json') as string)).toEqual({
			title: 'Tarts'
		});
		const saved = github.contentAt('recipes/desserts/tarts/lemon-tart.json') as string;
		expect(saved.endsWith('}\n')).toBe(true);
		expect(JSON.parse(saved)).toMatchObject({
			title: 'Lemon Tart',
			servings: 4,
			times: { prep: 20, cook: 30 },
			image: { src: 'lemon-tart.jpg', alt: 'A golden lemon tart' },
			ingredientGroups: [{ items: [{ amount: { qty: 200, unit: 'g' }, item: 'caster sugar' }] }],
			steps: [{ text: 'Bake at {temp:180} for {timer:30}.' }]
		});
		const photo = github.requests.find((r) => r.body?.encoding === 'base64');
		expect(photo).toBeDefined();
	});

	test('edits a recipe and changes nothing else in its file', async ({ page }) => {
		const github = await mockGitHub(page);
		await unlocked(page);
		const id = unlinked;
		const before = original(id);
		const summary = recipeData(id).recipe.summary as string;

		await page.goto(`edit?id=${id}`);
		await expect(saveButton(page)).toBeEnabled();
		await page.getByLabel('Summary').fill('A new summary for this recipe.');
		await saveButton(page).click();
		await expect(page.getByText('Live.')).toBeVisible();

		expect(github.commits()[0].body?.message).toContain('content(recipes): update');
		expect(github.tree().map((entry) => entry.path)).toEqual([`recipes/${id}.json`]);
		expect(github.contentAt(`recipes/${id}.json`)).toBe(
			before.replace(JSON.stringify(summary), JSON.stringify('A new summary for this recipe.'))
		);
	});

	test('shows a failed build with a link to the run', async ({ page }) => {
		await mockGitHub(page, { build: 'failed' });
		await unlocked(page);
		await page.goto(`edit?id=${unlinked}`);
		await expect(saveButton(page)).toBeEnabled();
		await page.getByLabel('Summary').fill('Changed.');
		await saveButton(page).click();
		await expect(page.getByText('The build failed.')).toBeVisible();
		await expect(page.getByRole('link', { name: 'See what went wrong' })).toHaveAttribute(
			'href',
			'https://github.com/example/run/1'
		);
	});

	test('does not save a recipe that fails the checklist, and points at the problem', async ({
		page
	}) => {
		const github = await mockGitHub(page);
		await unlocked(page);
		await page.goto('edit?section=desserts');
		await expect(saveButton(page)).toBeEnabled();

		await saveButton(page).click();
		await expect(page.getByLabel('Title', { exact: true })).toBeFocused();
		await expect(page.getByRole('alert').filter({ hasText: /./ }).first()).toBeVisible();
		expect(github.commits()).toHaveLength(0);

		await page.getByLabel('Title', { exact: true }).fill('Lemon Tart');
		await expect(page.getByText(/to fix before saving/).first()).toBeVisible();
	});

	test('offers a saved draft back after a reload', async ({ page }) => {
		await mockGitHub(page);
		await unlocked(page);
		await page.goto('edit?section=desserts');
		await page.getByLabel('Title', { exact: true }).fill('Half-written tart');
		await page.waitForTimeout(800);
		await page.reload({ waitUntil: 'domcontentloaded' }).catch(() => undefined);
		await page.getByRole('button', { name: 'Restore the draft' }).click();
		await expect(page.getByLabel('Title', { exact: true })).toHaveValue('Half-written tart');
	});

	test('previews the recipe as the public page shows it', async ({ page }) => {
		await mockGitHub(page);
		await unlocked(page);
		await page.goto('edit?section=desserts');
		await expect(saveButton(page)).toBeEnabled();
		await fillNewRecipe(page);
		const preview = page.getByRole('region', { name: 'Preview' });
		await expect(preview.getByRole('heading', { name: 'Lemon Tart', level: 1 })).toBeVisible();
		await expect(preview.getByText('caster sugar')).toBeVisible();
	});

	test('fits a phone, with the form, checks and preview on separate tabs', async ({ page }) => {
		await mockGitHub(page);
		await unlocked(page);
		await page.setViewportSize({ width: 375, height: 812 });
		await page.goto('edit?section=desserts');
		await expect(saveButton(page)).toBeEnabled();
		expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
			375
		);

		await expect(page.getByRole('region', { name: 'Checklist' })).toBeHidden();
		await page.getByRole('radio', { name: /^Checks/ }).check({ force: true });
		await expect(page.getByRole('region', { name: 'Checklist' })).toBeVisible();
		await page.getByRole('radio', { name: 'Preview' }).check({ force: true });
		await expect(page.getByRole('region', { name: 'Preview' })).toBeVisible();
		await expect(page.getByLabel('Title', { exact: true })).toBeHidden();
	});
});

test.describe('deleting', () => {
	test('refuses to delete a recipe that others link to, and names them', async ({ page }) => {
		const github = await mockGitHub(page);
		await unlocked(page);
		await page.goto(`edit?id=${linked}`);
		await expect(saveButton(page)).toBeEnabled();
		await page.getByRole('button', { name: 'Delete this recipe' }).click();

		const dialog = page.getByRole('dialog', { name: 'Delete this recipe' });
		await expect(dialog.getByText(/cannot be deleted yet/)).toBeVisible();
		for (const id of linkers) {
			await expect(
				dialog.getByRole('link', { name: recipeData(id).recipe.title, exact: true })
			).toBeVisible();
		}
		await expect(dialog.getByRole('button', { name: 'Delete the recipe' })).toHaveCount(0);
		expect(github.commits()).toHaveLength(0);
	});

	test('deletes a recipe nothing links to, after its title is typed', async ({ page }) => {
		const github = await mockGitHub(page);
		await unlocked(page);
		const { recipe } = recipeData(unlinked);
		await page.goto(`edit?id=${unlinked}`);
		await expect(saveButton(page)).toBeEnabled();
		await page.getByRole('button', { name: 'Delete this recipe' }).click();

		const dialog = page.getByRole('dialog', { name: 'Delete this recipe' });
		const confirm = dialog.getByRole('button', { name: 'Delete the recipe' });
		await expect(confirm).toBeDisabled();
		await dialog.getByLabel("Type the recipe's title to confirm").fill(recipe.title);
		await confirm.click();
		await expect(page.getByText('was deleted.')).toBeVisible();
		await expect(page.getByText('Live.')).toBeVisible();

		expect(github.commits()[0].body?.message).toBe(`content(recipes): remove ${recipe.title}`);
		const removed = github
			.tree()
			.filter((entry) => entry.sha === null)
			.map((entry) => entry.path);
		expect(removed).toContain(`recipes/${unlinked}.json`);
		expect(github.tree().every((entry) => entry.sha === null)).toBe(true);
	});
});

test('the editor is reachable from the drawer once unlocked', async ({ page }) => {
	await unlocked(page);
	await page.goto('./');
	await page.getByRole('button', { name: 'Settings' }).click();
	await page
		.getByRole('dialog', { name: 'Settings' })
		.getByRole('link', { name: 'New recipe' })
		.click();
	await expect(page.getByRole('heading', { name: 'New recipe', level: 1 })).toBeVisible();
});
