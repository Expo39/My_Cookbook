declare global {
	namespace App {}

	/** `static` reads the built JSON; later checkpoints add `api`. Set with PUBLIC_BACKEND at build time. */
	const __BACKEND__: string;
	/** The deployed origin, without the base path. Set with PUBLIC_SITE_URL; the default is `site.url` in cookbook.config.json. */
	const __SITE_URL__: string;
	const __SITE_CONFIG__: import('$lib/config').SiteConfig;
	/** The sous-chef Worker, from PUBLIC_AI_ENDPOINT or `ai.endpoint`; empty when there is none. */
	const __AI_ENDPOINT__: string;
}

export {};
