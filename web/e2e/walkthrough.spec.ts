import { mkdirSync, writeFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { waitForCore } from './helpers';

/*
 * Records the video on the how-to page: `make walkthrough`. It is tagged @walkthrough and left out of
 * `make test`, since it is slow on purpose. The sous-chef is mocked, so no network is needed, and
 * each caption shown on screen is also written to a WebVTT file for the video's captions track.
 */

const wellington = 'main-courses/beef-steak/beef-wellington';
const SIZE = { width: 1280, height: 800 };
const out = new URL('../static/video/', import.meta.url);
const raw = new URL('../test-results/walkthrough/', import.meta.url);

const answer = [
	'Yes. Wrap the parcel tightly in cling film and chill it for up to a day. ',
	'Bake it straight from the fridge, adding about 5 minutes.'
];

interface Cue {
	from: number;
	to: number;
	text: string;
}

const stamp = (ms: number) => {
	const date = new Date(ms);
	const pad = (n: number, width = 2) => String(n).padStart(width, '0');
	return `${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}:${pad(date.getUTCSeconds())}.${pad(date.getUTCMilliseconds(), 3)}`;
};

test.use({ reducedMotion: 'no-preference' });
test.setTimeout(240_000);

test('records the walkthrough @walkthrough', async ({ browser }) => {
	const context = await browser.newContext({
		viewport: SIZE,
		recordVideo: { dir: raw.pathname, size: SIZE }
	});
	const page = await context.newPage();
	const started = Date.now();
	const cues: Cue[] = [];

	await page.route('**/chat', async (route) => {
		const body = answer
			.map((text) => `event: delta\ndata: ${JSON.stringify({ text })}\n\n`)
			.join('');
		await new Promise((resolve) => setTimeout(resolve, 1500));
		await route.fulfill({
			status: 200,
			headers: { 'content-type': 'text/event-stream', 'access-control-allow-origin': '*' },
			body: `${body}event: done\ndata: {"truncated":false}\n\n`
		});
	});

	/** Shows a caption over the page for `ms`, and notes it for the captions file. */
	async function say(text: string, ms = 3200) {
		const from = Date.now() - started;
		await page.evaluate((caption) => {
			let box = document.getElementById('walkthrough-caption');
			if (!box) {
				box = document.createElement('div');
				box.id = 'walkthrough-caption';
				Object.assign(box.style, {
					position: 'fixed',
					insetInline: '0',
					insetBlockEnd: '28px',
					zIndex: '2147483647',
					display: 'flex',
					justifyContent: 'center',
					pointerEvents: 'none'
				});
				document.body.append(box);
			}
			box.innerHTML = '';
			const line = document.createElement('span');
			line.textContent = caption;
			Object.assign(line.style, {
				maxWidth: '80%',
				padding: '10px 18px',
				borderRadius: '6px',
				background: 'rgba(8, 35, 61, 0.88)',
				color: '#fff',
				font: '600 22px/1.35 system-ui, sans-serif',
				textAlign: 'center'
			});
			box.append(line);
		}, text);
		await page.waitForTimeout(ms);
		cues.push({ from, to: Date.now() - started, text });
	}

	const slowly = (ms = 700) => page.waitForTimeout(ms);

	// Finding a recipe
	await page.goto('./');
	await say('The cookbook opens on its sections. Tap one to browse.');
	const search = page.getByRole('combobox', { name: 'Search recipes' }).first();
	await search.click();
	await search.pressSequentially('wellin', { delay: 140 });
	await say('Or search: suggestions appear as you type.');
	await page
		.getByRole('option', { name: /Beef Wellington/ })
		.first()
		.click();

	// Cooking
	await waitForCore(page);
	await say('Every recipe scales. Change the servings and every amount follows.');
	await page.getByRole('button', { name: 'More servings' }).first().click();
	await slowly();
	await page.getByRole('button', { name: 'More servings' }).first().click();
	await slowly(1200);
	await page.getByRole('radio', { name: 'US', exact: true }).first().check({ force: true });
	await say('Switch to US units, or tap a tinted amount to step through its units.');
	await page.getByRole('radio', { name: 'Metric', exact: true }).first().check({ force: true });
	const timer = page
		.getByRole('region', { name: 'Method' })
		.getByRole('button', { name: /^Start .* timer/ })
		.first();
	await timer.scrollIntoViewIfNeeded();
	await say('Times in the method are timers. Tap one to start it.', 2400);
	await timer.click();
	await say('It keeps running at the top of the page while you move around.');

	// Shopping list and favourites
	await page.evaluate(() => scrollTo({ top: 0, behavior: 'smooth' }));
	await slowly();
	await page.getByRole('button', { name: 'Favourite' }).first().click();
	await say('Keep a recipe in your favourites with one tap.', 2400);
	await page.getByRole('button', { name: 'Add to shopping list' }).first().click();
	await say('Add its ingredients to the shopping list, at the servings you chose.', 2600);
	await page.getByRole('link', { name: 'Shopping list' }).first().click();
	await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
	await say('The list is sorted by aisle. Tap an amount to change it, or tick it off.');

	// The sous-chef
	await page.goto(wellington);
	await waitForCore(page);
	await page.getByRole('button', { name: 'Ask the sous-chef' }).first().click();
	await say('Ask the sous-chef about the recipe: swaps, timings, making it ahead.', 2400);
	await page.getByRole('button', { name: 'Can I make this ahead?' }).click();
	await say('The answer appears as it is written.', 4200);
	await page.keyboard.press('Escape');

	// Your own recipe
	await page.goto('edit');
	await say('Add a recipe of your own. A title, the ingredients and the method are all it needs.');
	await page.getByLabel('Title', { exact: true }).pressSequentially("Nanna's bread pudding", {
		delay: 60
	});
	await page
		.getByLabel('Summary', { exact: true })
		.fill('Stale bread, milk and sultanas, baked until golden.');
	await page.getByRole('textbox', { name: 'Servings', exact: true }).fill('6');
	await page.getByLabel('Section', { exact: true }).selectOption({ index: 1 });
	await page.getByRole('button', { name: 'Paste a list' }).click();
	await page
		.getByLabel('One ingredient per line')
		.fill('400 g stale bread\n500 ml milk\n2 eggs\n100 g sultanas\n80 g sugar');
	await say('Paste the whole ingredient list at once.', 2400);
	await page.getByRole('button', { name: 'Review' }).click();
	await slowly(1200);
	await page.getByRole('button', { name: /^Add 5 ingredients/ }).click();
	const step = page.getByLabel('Step 1', { exact: true });
	await step.scrollIntoViewIfNeeded();
	await step.pressSequentially('Soak the bread in the milk, then bake for 40 minutes at 180C.', {
		delay: 45
	});
	await say('Write the method as you would say it: times and temperatures become timers.');
	await page.getByRole('button', { name: /Save recipe/ }).click();
	await say(
		'It is saved in this browser, ready to cook from. Settings can share it with everyone.'
	);

	await page.close();
	await context.close();
	const video = page.video();
	mkdirSync(out, { recursive: true });
	if (video) {
		await video.saveAs(new URL('walkthrough.webm', raw).pathname);
		await video.delete();
	}
	const vtt = cues
		.map((cue, i) => `${i + 1}\n${stamp(cue.from)} --> ${stamp(cue.to)}\n${cue.text}\n`)
		.join('\n');
	writeFileSync(new URL('how-to-use.vtt', out), `WEBVTT\n\n${vtt}`);
});
