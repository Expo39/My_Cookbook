export type ShareOutcome = 'shared' | 'copied' | 'failed' | 'cancelled';

const aborted = (error: unknown) => error instanceof DOMException && error.name === 'AbortError';

/** Opens the system share sheet when there is one, and otherwise copies the link. */
export async function shareLink(title: string, url: string): Promise<ShareOutcome> {
	if (typeof navigator.share === 'function') {
		try {
			await navigator.share({ title, url });
			return 'shared';
		} catch (error) {
			if (aborted(error)) return 'cancelled';
		}
	}
	try {
		await navigator.clipboard.writeText(url);
		return 'copied';
	} catch {
		return 'failed';
	}
}

export type FileShareOutcome = 'shared' | 'cancelled' | 'unsupported' | 'failed';

/** Shares a file through the system sheet; `unsupported` when the browser cannot share this file. */
export async function shareFile(file: File, title: string): Promise<FileShareOutcome> {
	const data = { files: [file], title };
	if (typeof navigator.canShare !== 'function' || !navigator.canShare(data)) return 'unsupported';
	try {
		await navigator.share(data);
		return 'shared';
	} catch (error) {
		return aborted(error) ? 'cancelled' : 'failed';
	}
}

/** Saves a blob as a file by clicking a link to an object URL. */
export function download(blob: Blob, name: string): void {
	const url = URL.createObjectURL(blob);
	const link = document.createElement('a');
	link.href = url;
	link.download = name;
	document.body.append(link);
	link.click();
	link.remove();
	setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
