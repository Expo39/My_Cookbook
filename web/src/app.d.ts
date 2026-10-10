declare global {
	namespace App {}

	/** `static` reads the built JSON; later checkpoints add `api`. Set with PUBLIC_BACKEND at build time. */
	const __BACKEND__: string;
	/** The deployed origin, without the base path. Set with PUBLIC_SITE_URL; the default is in site.json. */
	const __SITE_URL__: string;
	const __SITE_CONFIG__: import('$lib/config').SiteConfig;
}

export {};
