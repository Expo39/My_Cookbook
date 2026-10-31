import { mkdirSync, writeFileSync } from 'node:fs';
import { expect, test, type Locator } from '@playwright/test';
import { waitForCore } from './helpers';

/*
 * Records the video on the how-to page: `make walkthrough`. It is tagged @walkthrough and left out of
 * `make test`, since it is slow on purpose. The sous-chef is mocked, so no network is needed, and
 * each caption shown on screen is also written to a WebVTT file for the video's captions track.
 * Recordings carry no mouse pointer, so the page draws one that glides to each control and
 * ripples when it is pressed, and the video can be followed by eye.
 */

/** A drawn pointer for the recording: an arrow that follows the mouse, and a ripple on each press. */
const POINTER = `addEventListener('DOMContentLoaded', () => {
	const arrow = document.createElement('div');
	arrow.innerHTML = '<svg width="28" height="28" viewBox="0 0 24 24"><path d="M4 2l16 9-7 2-3 7z" fill="#13202b" stroke="#fff" stroke-width="1.5" stroke-linejoin="round"/></svg>';
	Object.assign(arrow.style, { position: 'fixed', left: '0', top: '0', zIndex: '2147483647',
		pointerEvents: 'none', transform: 'translate(-4px, -2px)', filter: 'drop-shadow(0 2px 3px rgb(0 0 0 / 0.35))' });
	document.body.append(arrow);
	addEventListener('mousemove', (event) => {
		arrow.style.left = event.clientX + 'px';
		arrow.style.top = event.clientY + 'px';
	}, true);
	addEventListener('mousedown', (event) => {
		const ring = document.createElement('div');
		Object.assign(ring.style, { position: 'fixed', left: event.clientX - 18 + 'px', top: event.clientY - 18 + 'px',
			width: '36px', height: '36px', borderRadius: '50%', border: '3px solid #0d4f8b', zIndex: '2147483646',
			pointerEvents: 'none', transition: 'transform 450ms ease-out, opacity 450ms ease-out' });
		document.body.append(ring);
		requestAnimationFrame(() => { ring.style.transform = 'scale(1.8)'; ring.style.opacity = '0'; });
		setTimeout(() => ring.remove(), 500);
	}, true);
});`;

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
	await page.addInitScript(POINTER);

	/** Glides the drawn pointer to the middle of `target`, the way a person would reach for it. */
	async function reach(target: Locator) {
		await target.scrollIntoViewIfNeeded();
		const box = await target.boundingBox();
		if (box) await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 30 });
		await page.waitForTimeout(250);
	}

	async function tap(target: Locator) {
		await reach(target);
		await target.click();
	}
	const started = Date.now();
	const cues: Cue[] = [];

	// The worker's status check and Cloudflare Turnstile are faked too, so nothing leaves the machine.
	await page.route('**/status', (route) => route.fulfill({ json: { gemini: 'ok' } }));
	await page.route('https://challenges.cloudflare.com/**', (route) =>
		route.fulfill({
			contentType: 'text/javascript',
			body: `window.turnstile = {
				render: (box, options) => ((window.__turnstile = options), 'widget'),
				execute: () => window.__turnstile.callback('walkthrough'),
				reset: () => {}
			};`
		})
	);
	await page.route('**/chat', async (route) => {
		const body =
			`event: model\ndata: ${JSON.stringify({ model: 'gemini-3.8-flash', fallback: false })}\n\n` +
			answer.map((text) => `event: delta\ndata: ${JSON.stringify({ text })}\n\n`).join('');
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
				// A popover sits in the top layer, so the caption shows over an open dialog too.
				box.popover = 'manual';
				Object.assign(box.style, {
					position: 'fixed',
					inset: 'auto 0 28px 0',
					width: '100%',
					margin: '0',
					padding: '0',
					border: '0',
					background: 'transparent',
					overflow: 'visible',
					display: 'flex',
					justifyContent: 'center',
					pointerEvents: 'none'
				});
				document.body.append(box);
			}
			// Shown again each time, so it stays above a dialog opened since the last caption.
			if (box.matches(':popover-open')) box.hidePopover();
			box.showPopover();
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
	await tap(search);
	await search.pressSequentially('wellin', { delay: 140 });
	await say('Or search: suggestions appear as you type.');
	await tap(page.getByRole('option', { name: /Beef Wellington/ }).first());

	// Cooking
	await waitForCore(page);
	await say('Every recipe scales. Change the servings and every amount follows.');
	await tap(page.getByRole('button', { name: 'More servings' }).first());
	await slowly();
	await tap(page.getByRole('button', { name: 'More servings' }).first());
	await slowly(1200);
	await reach(page.getByRole('radio', { name: 'US', exact: true }).first().locator('..'));
	await page.getByRole('radio', { name: 'US', exact: true }).first().check({ force: true });
	await say('Switch to US units, or tap a tinted amount to step through its units.');
	await reach(page.getByRole('radio', { name: 'Metric', exact: true }).first().locator('..'));
	await page.getByRole('radio', { name: 'Metric', exact: true }).first().check({ force: true });
	const timer = page
		.getByRole('region', { name: 'Method' })
		.getByRole('button', { name: /^Start .* timer/ })
		.first();
	await timer.scrollIntoViewIfNeeded();
	await say('Times in the method are timers. Tap one to start it.', 2400);
	await tap(timer);
	await say('It keeps running at the top of the page while you move around.');

	// Shopping list and favourites
	await page.evaluate(() => scrollTo({ top: 0, behavior: 'smooth' }));
	await slowly();
	await tap(page.getByRole('button', { name: 'Favourite' }).first());
	await say('Keep a recipe in your favourites with one tap.', 2400);
	await tap(page.getByRole('button', { name: 'Add to shopping list' }).first());
	await say('Add its ingredients to the shopping list, at the servings you chose.', 2600);
	await tap(page.getByRole('link', { name: 'Shopping list' }).first());
	await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
	await say('The list is sorted by aisle. Tap an amount to change it, or tick it off.');

	// The sous-chef
	await page.goto(wellington);
	await waitForCore(page);
	await tap(page.getByRole('button', { name: 'Ask the sous-chef' }).first());
	await say('Ask the sous-chef about the recipe: swaps, timings, making it ahead.', 2400);
	await tap(page.getByRole('button', { name: 'Can I make this ahead?' }));
	await say('The answer appears as it is written.', 4200);
	await page.keyboard.press('Escape');

	// Sharing
	await tap(page.getByRole('button', { name: 'Share', exact: true }).first());
	await expect(page.getByRole('dialog', { name: 'Share' })).toBeVisible();
	await say('Share opens on the recipe card, ready to send with its link or copy as text.');
	await page.keyboard.press('Escape');

	// Your own recipe
	await page.goto('edit');
	await tap(page.getByRole('button', { name: 'Got it' }));
	await say('Add a recipe of your own. A title, the ingredients and the method are all it needs.');
	await reach(page.getByLabel('Title', { exact: true }));
	await page.getByLabel('Title', { exact: true }).pressSequentially("Nanna's bread pudding", {
		delay: 60
	});
	await page
		.getByLabel('Summary', { exact: true })
		.fill('Stale bread, milk and sultanas, baked until golden.');
	await page.getByRole('textbox', { name: 'Servings', exact: true }).fill('6');
	await page.getByLabel('Section', { exact: true }).selectOption({ index: 1 });
	await reach(page.getByLabel('One ingredient per line'));
	await page
		.getByLabel('One ingredient per line')
		.fill('400 g stale bread\n500 ml milk\n2 eggs\n100 g sultanas\n80 g sugar');
	await say(
		'Write the ingredients as on paper. Beside them, they read back as the recipe will.',
		2400
	);
	const step = page.getByLabel('Step 1', { exact: true });
	await reach(step);
	await step.pressSequentially('Soak the bread in the milk, then bake for 40 minutes at 180C.', {
		delay: 45
	});
	await say('Write the method as you would say it: times and temperatures become timers.');
	await tap(page.getByRole('button', { name: /Save recipe/ }));
	await say(
		'It is saved in this browser, ready to cook from. Export your recipes from Settings to keep a copy.'
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
