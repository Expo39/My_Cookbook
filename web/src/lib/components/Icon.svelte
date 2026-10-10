<script lang="ts" module>
	const icons = {
		search: ['M3 11a8 8 0 1 0 16 0a8 8 0 1 0-16 0', 'm21 21-4.3-4.3'],
		sliders: [
			'M21 4h-7',
			'M10 4H3',
			'M21 12h-9',
			'M8 12H3',
			'M21 20h-5',
			'M12 20H3',
			'M14 2v4',
			'M8 10v4',
			'M16 18v4'
		],
		heart: [
			'M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z'
		],
		share: [
			'M15 5a3 3 0 1 0 6 0a3 3 0 1 0-6 0',
			'M3 12a3 3 0 1 0 6 0a3 3 0 1 0-6 0',
			'M15 19a3 3 0 1 0 6 0a3 3 0 1 0-6 0',
			'M8.59 13.51l6.83 3.98',
			'M15.41 6.51l-6.82 3.98'
		],
		minus: ['M5 12h14'],
		plus: ['M5 12h14', 'M12 5v14'],
		check: ['M20 6 9 17l-5-5'],
		x: ['M18 6 6 18', 'm6 6 12 12'],
		chevronDown: ['m6 9 6 6 6-6'],
		chevronRight: ['m9 18 6-6-6-6'],
		arrowUp: ['m5 12 7-7 7 7', 'M12 19V5'],
		clock: ['M2 12a10 10 0 1 0 20 0a10 10 0 1 0-20 0', 'M12 6v6l4 2'],
		timer: ['M10 2h4', 'M12 14l3-3', 'M4 14a8 8 0 1 0 16 0a8 8 0 1 0-16 0'],
		bulb: [
			'M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 1 .2 2.2 1.5 3.5.7.7 1.3 1.5 1.5 2.5',
			'M9 18h6',
			'M10 22h4'
		],
		play: ['M6 3l14 9-14 9V3z'],
		reset: ['M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8', 'M3 3v5h5'],
		alert: [
			'm21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3',
			'M12 9v4',
			'M12 17h.01'
		],
		info: ['M2 12a10 10 0 1 0 20 0a10 10 0 1 0-20 0', 'M12 16v-4', 'M12 8h.01'],
		hat: [
			'M17 21a1 1 0 0 0 1-1v-5.35c0-.457.316-.844.727-1.041a4 4 0 0 0-2.134-7.589 5 5 0 0 0-9.186 0 4 4 0 0 0-2.134 7.588c.411.198.727.585.727 1.041V20a1 1 0 0 0 1 1Z',
			'M6 17h12'
		]
	};

	export type IconName = keyof typeof icons;
</script>

<script lang="ts">
	let { name, size = 20 }: { name: IconName; size?: number } = $props();
</script>

<svg
	width={size}
	height={size}
	viewBox="0 0 24 24"
	fill="none"
	stroke="currentColor"
	stroke-width="1.75"
	stroke-linecap="round"
	stroke-linejoin="round"
	aria-hidden="true"
	focusable="false"
>
	{#each icons[name] as d (d)}
		<path {d} />
	{/each}
</svg>
