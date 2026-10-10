export interface SiteConfig {
	site?: { url?: string; basePath?: string };
	ai?: { endpoint?: string };
	social?: {
		instagram?: { enabled?: boolean; handle?: string };
	};
}

export interface Social {
	label: string;
	handle: string;
	url: string;
}

const HANDLE = /^[A-Za-z0-9._]{1,30}$/;

/** The Instagram profile to show, or null when it is switched off or the handle is invalid. */
export function instagramFrom(config: SiteConfig): Social | null {
	const instagram = config.social?.instagram;
	const handle = instagram?.handle?.replace(/^@/, '');
	if (!instagram?.enabled || !handle || !HANDLE.test(handle)) return null;
	return { label: 'Instagram', handle: `@${handle}`, url: `https://www.instagram.com/${handle}/` };
}

export const instagram = instagramFrom(__SITE_CONFIG__);
