declare global {
	namespace App {}

	/** `static` reads the built JSON; later checkpoints add `api`. Set with PUBLIC_BACKEND at build time. */
	const __BACKEND__: string;
	/** The deployed origin, without the base path. Set with PUBLIC_SITE_URL at build time. */
	const __SITE_URL__: string;
	/** Ids of the share cards present in static/cards when the build started. */
	const __CARDS__: string[];
}

export {};
