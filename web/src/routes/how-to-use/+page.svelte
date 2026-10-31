<script lang="ts">
	import { base } from '$app/paths';
	import Icon from '$lib/components/Icon.svelte';
	import PageHead from '$lib/components/PageHead.svelte';
	import { editHref, favouritesHref, searchHref, shoppingHref } from '$lib/links';

	const contents = [
		{ id: 'finding', title: 'Finding a recipe' },
		{ id: 'cooking', title: 'Cooking from a recipe' },
		{ id: 'shopping', title: 'The shopping list' },
		{ id: 'favourites', title: 'Favourites' },
		{ id: 'sending', title: 'Sending a recipe to someone' },
		{ id: 'your-recipes', title: 'Your own recipes' },
		{ id: 'sharing', title: 'Sharing a recipe with everyone' },
		{ id: 'sous-chef', title: 'The sous-chef' },
		{ id: 'privacy', title: 'Privacy and bots' },
		{ id: 'questions', title: 'Questions and answers' }
	];

	const questions = [
		{
			q: 'What does the small "i" do?',
			a: 'It explains the thing beside it. Tap it on a phone and the explanation opens underneath; with a mouse, point at it and it appears in a bubble.'
		},
		{
			q: 'How do I send a recipe to a friend?',
			a: 'Tap Share on the recipe. A picture of the recipe card appears straight away, with every ingredient and a code that opens the recipe. On a phone, Send the card opens your phone\'s share sheet, so it goes straight into WhatsApp, Messenger, Instagram or a message, with the link. Tick "Send the whole recipe as text too" to include the full recipe.'
		},
		{
			q: 'Why does my computer say Copy the card instead of Send the card?',
			a: 'Most computer browsers cannot hand a picture to other apps the way phones do. Copy the card copies the picture instead: paste it into a chat, such as WhatsApp or Messenger on the web.'
		},
		{
			q: 'Why is Send the link greyed out?',
			a: 'The recipe is one of your own, kept only on your device, so it has no web address for anyone else to open yet. The card and Copy as text still work.'
		},
		{
			q: 'Are the amounts exact?',
			a: 'They are a guide. Change them to suit your taste, your guests and what you can find; the servings buttons scale everything together.'
		},
		{
			q: 'What does Scale another way do?',
			a: 'It scales from what you have instead of from the servings. Say you have 300 g of mince: enter it under "I have...", and every other amount follows. Where the recipe names a tin, you can also scale to the size of yours.'
		},
		{
			q: 'What is a part of a recipe?',
			a: 'Some dishes are made in pieces, such as the pastry and the filling. Each part has its own heading over its ingredients. A simple recipe needs only one list, so it has no parts at all. Two parts with the same name show as two lists with the same heading, so the editor points it out.'
		},
		{
			q: "What is a part's total?",
			a: 'An optional amount shown beside the part\'s name, for a part weighed out as a whole, such as "Charcuterie 775 g total". It scales with the servings like everything else.'
		},
		{
			q: 'Why do my recipes stay on this device?',
			a: 'There are no accounts, so a recipe you add is kept in this browser. It is yours to change or delete, and nobody else sees it. Clearing your browsing data deletes it, so export your recipes from Settings now and then to keep a copy, as text, a spreadsheet or JSON.'
		},
		{
			q: 'How do I share a recipe with everyone?',
			a: "Use Share with everyone next to it in Settings > Your recipes. Sharing adds it to the cookbook itself, so it needs the GitHub token, which the cookbook's owner unlocks with the password."
		},
		{
			q: 'Why does the sous-chef say the AI is in high demand?',
			a: 'The AI behind it is shared. When the main model is busy, a lighter one answers instead, and the answer says so. If both are busy, the sous-chef says it is unavailable due to high demand: wait a few minutes and ask again.'
		},
		{
			q: "Why does the sous-chef say it can't be reached?",
			a: 'Its service did not answer, perhaps for a moment. Everything else in the cookbook works as normal; tap Check again in a little while.'
		},
		{
			q: 'Do I need to be online?',
			a: 'Only the first time. The cookbook keeps the recipes you open, so they work in the kitchen without a signal. Searching every recipe, sharing and the sous-chef need a connection, and the sous-chef says so when you are offline.'
		},
		{
			q: 'How do I switch between grams and cups?',
			a: 'Each recipe has a units switch beside the ingredients. To open every recipe in the same units, choose them in Settings > Look and units.'
		},
		{
			q: 'Why is there no web address field when I add a recipe?',
			a: "It is made from the title for you. Only the cookbook's owner can change it, under Change in the editor, which moves the recipe to the new address."
		}
	];
</script>

<PageHead
	title="How to use the cookbook"
	description="Finding, scaling and cooking recipes, the shopping list, adding your own recipes and sharing them."
	path="how-to-use"
/>

<article class="guide">
	<header class="intro">
		<h1>How to use the cookbook</h1>
		<p class="lede">
			Everything the cookbook can do, from finding tonight's dinner to adding your nanna's recipes.
			Nothing here needs an account. Wherever a small "i" appears, tap it (or point at it with a
			mouse) for a short explanation.
		</p>
	</header>

	<figure class="video">
		<video controls preload="none" playsinline poster="{base}/video/how-to-use.jpg">
			<track kind="captions" src="{base}/video/how-to-use.vtt" srclang="en-GB" label="English" />
			<source src="{base}/video/how-to-use.webm" type="video/webm" />
		</video>
		<figcaption>A one-minute walk through the cookbook, with captions.</figcaption>
	</figure>

	<nav class="toc" aria-labelledby="toc-title">
		<h2 id="toc-title" class="label">On this page</h2>
		<ol>
			{#each contents as item (item.id)}
				<li><a href="#{item.id}">{item.title}</a></li>
			{/each}
		</ol>
	</nav>

	<section id="finding" aria-labelledby="finding-title">
		<h2 id="finding-title">Finding a recipe</h2>
		<h3>Browsing</h3>
		<p>
			The home page lists the sections, such as First Courses and Desserts. Tap a section card to
			see its recipes, or one of the smaller sections inside it. On a phone the sections also run
			along the top of every page as a row of chips you can swipe.
		</p>
		<h3>Searching</h3>
		<p>
			Type in the search box at the top of any page, or press <kbd>/</kbd> on a keyboard to jump to it.
			Suggestions appear as you type: recipes by name, recipes that use an ingredient, and the right spelling
			when a word is not recognised. Accents do not matter, so "brulee" finds Crème Brûlée, and several
			words find recipes with all of them, so "pasta tomato" finds the tomato pastas.
		</p>
		<p>
			To cook from what is in your kitchen, open the <a href={searchHref()}>search page</a>, choose
			<strong>I have these ingredients</strong> and list them with commas between, such as "eggs, flour,
			milk". The recipes you can nearly make come first, with how many of their ingredients you already
			have. The search page shows examples you can tap to try, and if you type a comma in the name search
			it offers to switch for you.
		</p>
	</section>

	<section id="cooking" aria-labelledby="cooking-title">
		<h2 id="cooking-title">Cooking from a recipe</h2>
		<h3>Scaling</h3>
		<p>
			Change the servings with the minus and plus buttons, or pick ½x, 2x or 3x. Every amount
			follows, and seasonings grow more gently than the rest so a large batch is not oversalted.
			<strong>Scale another way</strong> works from what you have: say you have 300 g of mince, and the
			recipe scales to match, or to a different tin size where the recipe names one.
		</p>
		<h3>Units</h3>
		<p>
			Switch between <strong>Metric</strong> and <strong>US</strong> on the recipe. Tap any tinted amount
			to step it through the other units of the same system, for example grams to kilograms, or cups to
			tablespoons. The default for every recipe is in Settings.
		</p>
		<h3>Timers</h3>
		<p>
			Times in the method, such as "simmer for 20 minutes", are buttons. Tap one to start a timer.
			Running timers stay at the top of the page while you move around the cookbook; on a phone the
			one that finishes soonest is shown, with the rest a tap away. A finished timer sounds, and
			vibrates where the phone can.
		</p>
		<h3>Cook mode</h3>
		<p>
			<strong>Start cooking</strong> shows one step at a time in large type, with that step's
			ingredients and timers. The screen stays awake while it is open. Tick ingredients off as you
			go; ticks are kept if you leave and come back. <strong>Plan backwards from...</strong> works out
			when to start for the time you want to eat.
		</p>
	</section>

	<section id="shopping" aria-labelledby="shopping-title">
		<h2 id="shopping-title">The shopping list</h2>
		<p>
			<strong>Add to shopping list</strong> on a recipe puts its ingredients, at the servings you
			chose, on the <a href={shoppingHref()}>shopping list</a>. The same ingredient from several
			recipes is added up, and the list is sorted by aisle.
		</p>
		<h3>Changing an amount</h3>
		<p>
			Tap a quantity to change it, for example to buy a whole bag. A small card opens with minus and
			plus, the amount and its unit, so 1500 g can become 1.5 kg, or an item added without an amount
			can be given one. A changed amount turns terracotta and shows what the recipes asked for, with
			<strong>Back to</strong> to undo it.
		</p>
		<h3>Your own items</h3>
		<p>
			<strong>Add an item</strong> takes anything else you need: type "potatoes" or "2 kg potatoes" and
			press Enter. "Ways to add something", beside the box (or under it on a phone), shows the kinds of
			line it understands. The amount can be changed on the list like any other, and pasting several lines
			adds them all. Your items are grouped under "Added by you".
		</p>
		<h3>Removing lines</h3>
		<p>
			Tick a line once it is in the basket. The small cross beside a line removes it, with
			<strong>Undo</strong> for a moment afterwards. <strong>Clear all</strong> empties the list after
			asking first.
		</p>
	</section>

	<section id="favourites" aria-labelledby="favourites-title">
		<h2 id="favourites-title">Favourites</h2>
		<p>
			<strong>Favourite</strong> on a recipe keeps it on the
			<a href={favouritesHref()}>favourites</a> page, together with the recipes you opened most recently.
			Favourites, the shopping list and your notes are kept in this browser, so they are there next time
			without an account.
		</p>
	</section>

	<section id="sending" aria-labelledby="sending-title">
		<h2 id="sending-title">Sending a recipe to someone</h2>
		<p>
			<strong>Share</strong> on a recipe opens a picture of its recipe card straight away: the title,
			the time and servings, every ingredient at the servings and units you chose, and a code that opens
			the recipe. Long ingredients wrap rather than being cut short, and a long list runs in two columns.
		</p>
		<ul class="points">
			<li>
				<strong>Send the card</strong> (on a phone) opens the phone's share sheet, so the card goes
				straight into WhatsApp, Messenger, Instagram or a message, with the recipe's link. Tick
				<strong>Send the whole recipe as text too</strong> to include the full recipe.
			</li>
			<li>
				<strong>Copy the card</strong> (on most computers) copies the picture to paste into a chat.
			</li>
			<li><strong>Save image</strong> keeps the card in your downloads.</li>
			<li><strong>Send the link</strong> shares, or copies, the recipe's address.</li>
			<li><strong>Copy as text</strong> copies the whole recipe to paste anywhere.</li>
			<li><strong>Print</strong> prints the card on an A5 index card.</li>
		</ul>
		<p>
			A recipe of your own has no link yet, so <strong>Send the link</strong> is greyed out; the card
			and the text work as usual.
		</p>
	</section>

	<section id="your-recipes" aria-labelledby="your-recipes-title">
		<h2 id="your-recipes-title">Your own recipes</h2>
		<h3>Adding a recipe</h3>
		<p>
			<a href={editHref()}>Add a recipe</a> from the home page, a section page or Settings. The
			first time, a note explains where it is kept. A title, the ingredients and the method are all
			it needs. Choose a <strong>Section</strong>, then a <strong>Subsection</strong> if you like;
			<strong>New section</strong> and <strong>New subsection</strong> add your own. Write the
			ingredients one per line, as on paper, or paste a list from anywhere; "How it will read"
			beside the box shows each line as the recipe will. A line ending in a colon, such as "For the
			filling:", starts a new part.
			<strong>Line by line</strong> is there for fine-tuning a single ingredient. Write the method
			the way you would say it: "bake for 25 minutes at 200°C" becomes a tappable timer and a
			temperature that converts to Fahrenheit, and the editor shows what it found under each step.
			<strong>Before you save</strong> lists what is still to fill in, in plain words; tap a point to
			go straight to it.
		</p>
		<p>
			Your recipe scales, converts and keeps timers like every other recipe, and appears on the home
			page under "Your recipes" and in its section, marked "Yours". You can change or delete it at
			any time.
		</p>
		<h3>Where they are stored</h3>
		<p>
			Recipes you add are stored only in this browser on this device. Nobody else can see them, and
			they do not follow you to another device. Clearing the browser's data for the site deletes
			them, so keep a copy.
		</p>
		<h3>Exporting and clearing</h3>
		<p>
			Clearing your browsing data deletes your recipes, so export them now and then.
			<strong>Settings &gt; Your recipes &gt; Export your recipes</strong> saves them to your
			downloads as text (to read or print), a spreadsheet (CSV, for Excel or Google Sheets) or JSON
			(everything, as stored). About once a week the home page reminds you; close it and it waits
			another week. <strong>Clear all personal recipes</strong> deletes them from this device after asking
			how many will go.
		</p>
	</section>

	<section id="sharing" aria-labelledby="sharing-title">
		<h2 id="sharing-title">Sharing a recipe with everyone</h2>
		<p>
			A recipe of yours can become part of the cookbook with <strong>Share with everyone</strong> in Settings.
			It is saved to the cookbook's repository on GitHub and appears for everyone after the next deploy,
			usually a minute or two. From then on it belongs to the cookbook: the copy on your device locks,
			and the recipe can only be changed by whoever holds the GitHub token. Sharing is optional, and needs
			three things, which the cookbook's owner sets up once.
		</p>
		<h3>The GitHub token</h3>
		<p>
			The recipes live as files in a GitHub repository. A token is a long password that lets the
			site write to that one repository and nothing else. To create one:
		</p>
		<ol class="steps">
			<li>
				On GitHub, open <strong
					>Settings &gt; Developer settings &gt; Personal access tokens &gt; Fine-grained tokens</strong
				>
				and choose <strong>Generate new token</strong>.
			</li>
			<li>Name it, for example "Cookbook editor", and choose how long it lasts.</li>
			<li>
				Under <strong>Repository access</strong>, choose <strong>Only select repositories</strong> and
				pick the cookbook's repository.
			</li>
			<li>
				Under <strong>Permissions &gt; Repository permissions</strong>, set
				<strong>Contents</strong> to <strong>Read and write</strong>. Leave everything else at
				<strong>No access</strong>.
			</li>
			<li>Generate it and copy it straight away; GitHub shows it only once.</li>
			<li>
				Paste it in <strong>Settings &gt; For the cookbook's owner</strong>, with a password, and
				choose
				<strong>Set up editing</strong>.
			</li>
		</ol>
		<h3>The password</h3>
		<p>
			The password locks the token. The site encrypts the token with it in your browser and keeps
			only the encrypted copy, in a public file called <code>admin.json</code>. On any device,
			entering the password unlocks the token again until the tab is closed. Anyone can download the
			encrypted file and try to guess the password, so it must be at least 12 characters; a few
			unrelated words make a strong one.
		</p>
		<h3>The AI import secret</h3>
		<p>
			With the token unlocked, the editor can turn pasted recipe text into a filled-in form with AI.
			That costs the cookbook's AI allowance, so the AI service asks for a secret that only the
			owner has. It is created when the service is set up (<code>make worker-secrets</code> prints it
			once), and it is kept encrypted with the token. It is optional: everything else works without it.
		</p>
	</section>

	<section id="sous-chef" aria-labelledby="sous-chef-title">
		<h2 id="sous-chef-title">The sous-chef</h2>
		<p>
			<strong>Ask the sous-chef</strong> on a recipe, your own included, opens a chat about that recipe:
			swaps, timings, making it ahead. The answer appears as it is written, and says which model wrote
			it. It is AI, so it can be wrong; check times and temperatures yourself.
		</p>
		<p>
			As soon as it opens, it tells you if you are offline, if it cannot be reached (with
			<strong>Check again</strong>), or if the AI is in high demand. When the main model is busy, a
			lighter one steps in and the answer says so; if both are busy, it says it is unavailable due
			to high demand, with <strong>Try again</strong>. Each person can ask a few questions a minute,
			and a quick, usually invisible check from Cloudflare makes sure a person is asking, not a bot.
		</p>
	</section>

	<section id="privacy" aria-labelledby="privacy-title">
		<h2 id="privacy-title">Privacy and bots</h2>
		<p>
			There are no accounts, adverts or trackers. Favourites, the shopping list, notes, timers and
			your own recipes stay in your browser. A question to the sous-chef is sent, with the recipe it
			is about, to the cookbook's AI service and on to Google's Gemini to be answered, and
			Cloudflare Turnstile checks that a person is asking. Nothing else leaves your device unless
			you send or share a recipe.
		</p>
		<p>
			Search engines are welcome. AI crawlers are asked not to collect the recipes, both in
			<code>robots.txt</code> and on every page. Well-behaved crawlers respect that; it cannot stop one
			that does not.
		</p>
	</section>

	<section id="questions" aria-labelledby="questions-title">
		<h2 id="questions-title">Questions and answers</h2>
		<div class="faq">
			{#each questions as item (item.q)}
				<details>
					<summary>{item.q}<Icon name="chevronDown" size={20} /></summary>
					<p>{item.a}</p>
				</details>
			{/each}
		</div>
	</section>

	<p class="back"><a href="#main"><Icon name="arrowUp" size={18} />Back to the top</a></p>
</article>

<style>
	.guide {
		display: grid;
		gap: var(--space-6);
		max-inline-size: var(--measure);
	}

	@media (min-width: 64rem) {
		.guide {
			grid-template-columns: minmax(0, var(--measure)) 16rem;
			column-gap: var(--space-7);
			max-inline-size: none;
		}

		.guide > :not(.toc) {
			grid-column: 1;
		}

		.toc {
			position: sticky;
			inset-block-start: var(--space-4);
			grid-column: 2;
			grid-row: 1 / span 12;
			align-self: start;
		}
	}

	.intro {
		display: grid;
		gap: var(--space-3);
	}

	.lede {
		color: var(--colour-muted);
		font-size: var(--text-l);
	}

	.video {
		display: grid;
		gap: var(--space-2);
		margin: 0;
	}

	video {
		inline-size: 100%;
		aspect-ratio: 16 / 10;
		border: 1px solid var(--colour-line);
		border-radius: var(--radius-m);
		background: var(--colour-tint);
	}

	figcaption {
		color: var(--colour-muted);
		font-size: var(--text-s);
	}

	.toc {
		display: grid;
		gap: var(--space-2);
		padding: var(--space-4);
		border: 1px solid var(--colour-line);
		border-radius: var(--radius-m);
		background: var(--colour-surface);
	}

	.toc .label {
		color: var(--colour-muted);
	}

	.toc ol {
		display: grid;
		gap: var(--space-1);
		margin: 0;
		padding: 0;
		list-style: none;
	}

	.toc a {
		display: inline-block;
		padding-block: var(--space-1);
		font-weight: 700;
	}

	section {
		display: grid;
		gap: var(--space-3);
		scroll-margin-block-start: var(--space-4);
	}

	.faq {
		border-block-start: 1px solid var(--colour-line);
	}

	.faq details {
		border-block-end: 1px solid var(--colour-line);
	}

	.faq summary {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-3);
		min-block-size: var(--target);
		padding-block: var(--space-3);
		font-weight: 700;
		list-style: none;
	}

	.faq summary::-webkit-details-marker {
		display: none;
	}

	.faq summary :global(svg) {
		flex: none;
		color: var(--colour-primary);
		transition: transform var(--duration-micro) var(--ease-out);
	}

	.faq details[open] summary :global(svg) {
		transform: rotate(180deg);
	}

	.faq p {
		padding-block-end: var(--space-4);
	}

	.points {
		display: grid;
		gap: var(--space-2);
		padding-inline-start: var(--space-5);
		list-style: disc;
	}

	h3 {
		margin-block-start: var(--space-2);
		color: var(--colour-ink);
		font-size: var(--text-l);
	}

	.steps {
		display: grid;
		gap: var(--space-3);
		margin: 0;
		padding: 0;
		list-style: none;
		counter-reset: step;
	}

	.steps li {
		position: relative;
		min-block-size: 1.75rem;
		padding-inline-start: calc(1.75rem + var(--space-3));
		counter-increment: step;
	}

	.steps li::before {
		content: counter(step);
		position: absolute;
		inset-block-start: 0;
		inset-inline-start: 0;
		display: grid;
		place-items: center;
		inline-size: 1.75rem;
		block-size: 1.75rem;
		border-radius: 50%;
		background: var(--colour-tint);
		color: var(--colour-primary);
		font-family: var(--font-num);
		font-weight: 600;
	}

	kbd,
	code {
		padding: 0 var(--space-1);
		border: 1px solid var(--colour-line);
		border-radius: var(--radius-s);
		background: var(--colour-tint);
		font-size: 0.9em;
	}

	.back a {
		display: inline-flex;
		align-items: center;
		gap: var(--space-1);
		min-block-size: var(--target);
		font-weight: 700;
	}
</style>
