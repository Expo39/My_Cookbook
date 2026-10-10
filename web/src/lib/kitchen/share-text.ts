export type TextShareOutcome = 'shared' | 'copied' | 'failed' | 'cancelled';

/** Opens the system share sheet with plain text when there is one, and otherwise copies the text. */
export async function shareText(title: string, text: string): Promise<TextShareOutcome> {
	if (typeof navigator.share === 'function') {
		try {
			await navigator.share({ title, text });
			return 'shared';
		} catch (error) {
			if (error instanceof DOMException && error.name === 'AbortError') return 'cancelled';
		}
	}
	try {
		await navigator.clipboard.writeText(text);
		return 'copied';
	} catch {
		return 'failed';
	}
}
