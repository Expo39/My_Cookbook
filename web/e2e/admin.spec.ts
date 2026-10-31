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
async function mockGitHub(page: Page, options: { build?: 'live' | 'failed'; photo?: string } = {}) {
	const requests: Request[] = [];
	const changed = new Set<string>();
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

		if (options.photo && path === `/contents/recipes/${options.photo}.jpg`) {
			return route.fulfill({ json: { sha: 'photo-sha', content: '' } });
		}
		if (path.startsWith('/compare/')) {
			return route.fulfill({ json: { status: 'identical', files: [] } });
		}
		if (path.startsWith('/git/trees/')) {
			return route.fulfill({
				json: {
					truncated: false,
					tree: recipeIds.map((id) => ({ path: `recipes/${id}.json`, type: 'blob', sha: id }))
				}
			});
		}
		if (path.startsWith('/git/blobs/')) {
			const id = path.replace('/git/blobs/', '');
			return route.fulfill({ json: { content: Buffer.from(original(id)).toString('base64') } });
		}
		if (path.startsWith('/contents/')) {
			const id = path.replace(/^\/contents\/recipes\//, '').replace(/\.json$/, '');
			const stored = (name: string) =>
				name === options.photo
					? `${JSON.stringify({ ...JSON.parse(original(name)), image: { src: `${name.split('/').pop()}.jpg`, alt: 'A photo' } }, null, '\t')}\n`
					: original(name);
			const committed = tree().find((entry) => entry.path === `recipes/${id}.json`)?.sha;
			const text = committed
				? blobs.get(committed)
				: recipeIds.includes(id)
					? stored(id)
					: undefined;
			if (text === undefined) return route.fulfill({ status: 404, json: { message: 'Not Found' } });
			return route.fulfill({
				json: {
					sha: changed.has(id) ? 'sha-newer' : 'sha-stored',
					content: Buffer.from(text).toString('base64')
				}
			});
		}
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
	return { requests, tree, contentAt, commits, changed };
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
	await page.locator('#f-ingredientGroups').fill('200 g caster sugar');
	await page.locator('#f-steps-0-text').fill('Bake at {temp:180} for {timer:30}.');
}

/** The web address follows the title and is folded away; "Change" opens it. */
async function openAddress(page: Page) {
	const address = page.getByLabel('Web address');
	if (!(await address.isVisible())) await page.getByText('Change', { exact: true }).click();
	return address;
}

/** Chooses a section, then its subsection when the path has one. */
async function chooseSection(page: Page, path: string) {
	await page.getByLabel('Section', { exact: true }).selectOption(path.split('/')[0]);
	if (path.includes('/')) await page.locator('#f-section-sub').selectOption(path);
}

/** Owner editing sits in a folded part of Settings. */
async function ownerPanel(page: Page) {
	await page.getByRole('button', { name: 'Settings' }).click();
	const drawer = page.getByRole('dialog', { name: 'Settings' });
	const summary = drawer.getByText("For the cookbook's owner");
	if (
		!(await drawer
			.getByRole('button', { name: /Set up editing|Unlock editing|Lock editing/ })
			.isVisible())
	)
		await summary.click();
	return drawer;
}

test.describe('setting up and unlocking', () => {
	test('sets up editing once, then unlocks with the password', async ({ page }) => {
		const github = await mockGitHub(page);
		await page.goto('./');
		const drawer = await ownerPanel(page);
		await expect(drawer.getByRole('button', { name: 'Set up editing' })).toBeVisible();

		await drawer.getByLabel('GitHub token', { exact: true }).fill('github_pat_example');
		await drawer.getByLabel('Password', { exact: true }).fill('too short');
		await drawer.getByLabel('Repeat the password').fill('too short');
		await drawer.getByRole('button', { name: 'Set up editing' }).click();
		await expect(drawer.getByRole('alert')).toContainText('at least 12 characters');
		expect(github.commits()).toHaveLength(0);

		await drawer.getByLabel('Password', { exact: true }).fill('a long enough password');
		await drawer.getByLabel('Repeat the password').fill('a long enough password');
		await drawer.getByRole('button', { name: 'Set up editing' }).click();
		await expect(drawer.getByText('Editing is unlocked in this tab.')).toBeVisible();

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
		await drawer.getByLabel('Password', { exact: true }).fill('not the right password');
		await drawer.getByRole('button', { name: 'Unlock editing' }).click();
		await expect(drawer.getByRole('alert')).toContainText('That password did not work');

		await drawer.getByLabel('Password', { exact: true }).fill('a long enough password');
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

	test("keeps the cookbook's recipes behind the password and out of search engines", async ({
		page
	}) => {
		await mockGitHub(page);
		await page.goto(`edit?id=${recipeIds[0]}`);
		await expect(
			page.getByRole('heading', { name: 'This recipe is part of the cookbook' })
		).toBeVisible();
		await expect(page.getByRole('main').getByLabel('GitHub token', { exact: true })).toBeVisible();
		await expect(page.locator('meta[name="robots"][content*="noindex"]')).toHaveCount(1);
	});
});

test.describe('the editor', () => {
	test('adds a recipe with a photo to a new subsection in one commit', async ({ page }) => {
		const github = await mockGitHub(page);
		await unlocked(page);
		await page.goto('edit?section=desserts');
		await expect(saveButton(page)).toBeEnabled();

		await fillNewRecipe(page);
		await page.getByRole('button', { name: 'New subsection', exact: true }).click();
		await page.getByLabel('Name', { exact: true }).fill('Tarts');
		await page.getByRole('button', { name: 'Add', exact: true }).click();
		await expect(page.getByLabel('Section', { exact: true })).toHaveValue('desserts');
		await expect(page.locator('#f-section-sub')).toHaveValue('desserts/tarts');
		await expect(page.getByLabel('Web address')).toHaveValue('lemon-tart');
		await expect(page.getByLabel('Web address')).toBeHidden();

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

	test('adds a photo from the recipe page in one commit, and shows it at once', async ({
		page
	}) => {
		const github = await mockGitHub(page);
		await unlocked(page);
		const id = unlinked;
		const title = recipeData(id).recipe.title as string;
		await page.goto(id);
		await expect(page.getByRole('button', { name: 'Add a photo' })).toBeVisible();

		await page.getByLabel(`Choose a photo for ${title}`).setInputFiles({
			name: 'dish.png',
			mimeType: 'image/png',
			buffer: Buffer.from(PNG, 'base64')
		});
		const dialog = page.getByRole('dialog', { name: 'Add this photo' });
		await expect(dialog).toBeVisible();
		await expect(dialog.getByRole('button', { name: 'Save photo' })).toBeDisabled();
		await dialog.getByLabel(/Describe the photo/).fill('The finished dish');
		await dialog.getByRole('button', { name: 'Save photo' }).click();
		await expect(page.getByText('The photo is live.')).toBeVisible();
		await expect(page.locator('img.fresh')).toBeVisible();
		await expect(page.getByRole('button', { name: 'Change photo' })).toBeVisible();

		const slug = id.split('/').pop();
		expect(github.commits()).toHaveLength(1);
		expect(github.commits()[0].body?.message).toBe(`content(recipes): update ${title}`);
		expect(
			github
				.tree()
				.map((entry) => entry.path)
				.sort()
		).toEqual([`recipes/${id}.jpg`, `recipes/${id}.json`]);
		expect(JSON.parse(github.contentAt(`recipes/${id}.json`) as string)).toEqual({
			...JSON.parse(original(id)),
			image: { src: `${slug}.jpg`, alt: 'The finished dish' }
		});
	});

	test('without the token, a photo is kept in this browser, survives a reload and can go', async ({
		page
	}) => {
		const github: string[] = [];
		await page.route('https://api.github.com/**', (route) => {
			github.push(route.request().url());
			return route.fulfill({ json: {} });
		});
		const title = recipeData(unlinked).recipe.title as string;
		await page.goto(unlinked);
		await page.getByLabel(`Choose a photo for ${title}`).setInputFiles({
			name: 'dish.png',
			mimeType: 'image/png',
			buffer: Buffer.from(PNG, 'base64')
		});
		const dialog = page.getByRole('dialog', { name: 'Add this photo' });
		await expect(dialog).toContainText('It is kept in this browser');
		await dialog.getByLabel(/Describe the photo/).fill('The finished dish');
		await dialog.getByRole('button', { name: 'Save photo' }).click();
		await expect(page.getByText('Only on this device')).toBeVisible();
		await expect(page.getByRole('img', { name: 'The finished dish' })).toBeVisible();
		expect(github.filter((url) => !url.endsWith('/permissions'))).toEqual([]);

		await page.reload();
		await expect(page.getByRole('img', { name: 'The finished dish' })).toBeVisible();
		await page.getByRole('button', { name: 'Remove' }).click();
		await expect(page.getByRole('button', { name: 'Add a photo' })).toBeVisible();
		await page.reload();
		await expect(page.getByRole('button', { name: 'Add a photo' })).toBeVisible();
	});

	test("Share with everyone sends a device recipe's photo in the same commit", async ({ page }) => {
		const github = await mockGitHub(page);
		await page.goto('edit');
		const gotIt = page.getByRole('button', { name: 'Got it' });
		if (await gotIt.isVisible()) await gotIt.click();
		await page.getByLabel('Title', { exact: true }).fill('Kusksu');
		await page.getByLabel('Summary', { exact: true }).fill('A broad bean and pasta soup.');
		await page.getByRole('textbox', { name: 'Servings', exact: true }).fill('4');
		await page.getByLabel('Section', { exact: true }).selectOption('soups');
		await page.getByLabel('One ingredient per line').fill('300 g broad beans\n200 g kusksu');
		await page.getByLabel('Step 1', { exact: true }).fill('Simmer the beans and the kusksu.');
		await page.getByRole('button', { name: 'Save recipe' }).click();
		await expect(page.getByText('It is on this device, ready to cook from.')).toBeVisible();

		await page.goto('mine?id=soups/kusksu');
		await page.getByLabel('Choose a photo for Kusksu').setInputFiles({
			name: 'kusksu.png',
			mimeType: 'image/png',
			buffer: Buffer.from(PNG, 'base64')
		});
		const dialog = page.getByRole('dialog', { name: 'Add this photo' });
		await dialog.getByLabel(/Describe the photo/).fill('A bowl of kusksu');
		await dialog.getByRole('button', { name: 'Save photo' }).click();
		await expect(page.getByText('Only on this device')).toBeVisible();

		await page.evaluate(() => sessionStorage.setItem('sapori:admin-token', 'test-token'));
		await page.reload();
		await page.getByRole('button', { name: 'Settings' }).click();
		const drawer = page.getByRole('dialog', { name: 'Settings' });
		await drawer.getByRole('button', { name: 'Share with everyone' }).click();
		await drawer.getByRole('button', { name: 'Share it' }).click();
		await expect(drawer.getByText(/is now in the cookbook/)).toBeVisible();

		expect(github.commits()).toHaveLength(1);
		expect(
			github
				.tree()
				.map((entry) => entry.path)
				.sort()
		).toEqual(['recipes/soups/kusksu.jpg', 'recipes/soups/kusksu.json']);
		expect(JSON.parse(github.contentAt('recipes/soups/kusksu.json') as string).image).toEqual({
			src: 'kusksu.jpg',
			alt: 'A bowl of kusksu'
		});
	});

	test('says what is saved once editing is unlocked', async ({ page }) => {
		await mockGitHub(page);
		await unlocked(page);
		await page.goto('./');
		const drawer = await ownerPanel(page);
		await expect(drawer.getByText('Editing is unlocked in this tab.')).toBeVisible();
		await expect(drawer.getByText('GitHub token saved')).toBeVisible();
		await expect(drawer.getByText('No AI import secret: Import from text is off')).toBeVisible();
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

	test('refuses to save over a recipe that changed on GitHub after it was opened', async ({
		page
	}) => {
		const github = await mockGitHub(page);
		await unlocked(page);
		await page.goto(`edit?id=${unlinked}`);
		await expect(saveButton(page)).toBeEnabled();
		github.changed.add(unlinked);
		await page.getByLabel('Summary').fill('A stale edit.');
		await saveButton(page).click();
		await expect(page.getByText(/changed on GitHub after you opened it/)).toBeVisible();
		expect(github.commits()).toHaveLength(0);
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
		await expect(page.getByText(/things? left to fill in/).first()).toBeVisible();
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

		await expect(page.getByRole('region', { name: 'Before you save' })).toBeHidden();
		await page.getByRole('radio', { name: /^To do/ }).check({ force: true });
		await expect(page.getByRole('region', { name: 'Before you save' })).toBeVisible();
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

test.describe('moving', () => {
	test('moves a linked recipe, its photo and the links to it in one commit', async ({ page }) => {
		const github = await mockGitHub(page, { photo: linked });
		await unlocked(page);
		const { recipe } = recipeData(linked);
		await page.goto(`edit?id=${linked}`);
		await expect(saveButton(page)).toBeEnabled();

		await page.getByRole('button', { name: 'New section', exact: true }).click();
		await page.getByLabel('Name', { exact: true }).fill('Specials');
		await page.getByRole('button', { name: 'Add', exact: true }).click();
		await (await openAddress(page)).fill('house-special');
		const notice = page.getByRole('status').filter({ hasText: 'This moves the recipe.' });
		await expect(notice).toContainText(`/${linked}`);
		await expect(notice).toContainText('/specials/house-special');
		await page.getByRole('button', { name: 'Move and save' }).click();
		await expect(page.getByText('was moved to')).toBeVisible({ timeout: 10_000 });
		await expect(page.getByText('Live.')).toBeVisible();

		expect(github.commits()).toHaveLength(1);
		expect(github.commits()[0].body?.message).toBe(`content(recipes): move ${recipe.title}`);
		const old = `recipes/${linked}`;
		const photo = (folder: string, name: string) => `recipes/${folder}/${name}.jpg`;
		const folder = linked.slice(0, linked.lastIndexOf('/'));
		const written = github.tree().filter((entry) => entry.sha !== null);
		const removed = github.tree().filter((entry) => entry.sha === null);
		expect(removed.map((entry) => entry.path).sort()).toEqual(
			[`${old}.json`, photo(folder, linked.split('/').pop() as string)].sort()
		);
		expect(written.map((entry) => entry.path).sort()).toEqual(
			[
				'recipes/specials/_section.json',
				'recipes/specials/house-special.json',
				photo('specials', 'house-special'),
				...linkers.map((id) => `recipes/${id}.json`)
			].sort()
		);
		expect(written.find((entry) => entry.path.endsWith('.jpg'))?.sha).toBe('photo-sha');
		expect(
			JSON.parse(github.contentAt('recipes/specials/house-special.json') as string)
		).toMatchObject({ title: recipe.title, image: { src: 'house-special.jpg' } });
		for (const id of linkers) {
			const related = JSON.parse(github.contentAt(`recipes/${id}.json`) as string).related;
			expect(related).toContain('specials/house-special');
			expect(related).not.toContain(linked);
		}
		await expect(page.getByLabel('Web address')).toHaveValue('house-special');
		await expect(page).toHaveURL(/edit\?id=specials%2Fhouse-special$/);
	});

	test('refuses an address another recipe already has', async ({ page }) => {
		const github = await mockGitHub(page);
		await unlocked(page);
		await page.goto(`edit?id=${unlinked}`);
		await expect(saveButton(page)).toBeEnabled();
		await (await openAddress(page)).fill(linked.split('/').pop() as string);
		await chooseSection(page, linked.slice(0, linked.lastIndexOf('/')));
		await page.getByRole('button', { name: 'Move and save' }).click();
		await expect(page.getByText('already exists').first()).toBeVisible();
		expect(github.commits()).toHaveLength(0);
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
