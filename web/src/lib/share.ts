export type ShareOutcome = 'shared' | 'copied' | 'failed' | 'cancelled';

/** Opens the system share sheet when there is one, and otherwise copies the link. */
export async function shareLink(title: string, url: string): Promise<ShareOutcome> {
	if (typeof navigator.share === 'function') {
		try {
			await navigator.share({ title, url });
			return 'shared';
		} catch (error) {
			if (error instanceof DOMException && error.name === 'AbortError') return 'cancelled';
		}
	}
	try {
		await navigator.clipboard.writeText(url);
		return 'copied';
	} catch {
		return 'failed';
	}
}
