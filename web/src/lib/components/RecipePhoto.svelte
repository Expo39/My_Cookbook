<script lang="ts">
	import { fallbackSrc, srcset, type Photo } from '$lib/photo';

	let {
		id,
		photo,
		sizes,
		hero = false
	}: {
		/** The recipe id, which names the folder under `/img`. */
		id: string;
		photo: Photo;
		sizes: string;
		/** The first screenful: loaded at once and at high priority. */
		hero?: boolean;
	} = $props();
</script>

<picture class:hero>
	<source type="image/webp" srcset={srcset(id, photo.widths, 'webp')} {sizes} />
	<img
		src={fallbackSrc(id, photo.widths)}
		srcset={srcset(id, photo.widths, 'jpg')}
		{sizes}
		width={photo.width}
		height={photo.height}
		alt={photo.alt}
		loading={hero ? 'eager' : 'lazy'}
		fetchpriority={hero ? 'high' : 'auto'}
		decoding={hero ? 'sync' : 'async'}
	/>
</picture>

<style>
	picture {
		display: block;
		aspect-ratio: 3 / 2;
		border-radius: var(--radius-m);
		background: var(--colour-tint);
		overflow: hidden;
	}

	img {
		display: block;
		inline-size: 100%;
		block-size: 100%;
		object-fit: cover;
	}

	@media print {
		picture {
			display: none;
		}
	}

	@media (min-width: 48rem) {
		.hero {
			aspect-ratio: 2 / 1;
		}
	}
</style>
