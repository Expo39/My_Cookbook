/** Storage can be blocked or full, so every access is guarded and failures are silent. */
export function readStorage(key: string): string | null {
	try {
		return localStorage.getItem(key);
	} catch {
		return null;
	}
}

export function writeStorage(key: string, value: string | null): void {
	try {
		if (value === null) localStorage.removeItem(key);
		else localStorage.setItem(key, value);
	} catch {
		/* the choice only lasts for this visit */
	}
}

/** Parsed JSON from storage, or `undefined` when it is missing, corrupt or blocked. */
export function readJson(key: string): unknown {
	try {
		const text = readStorage(key);
		return text === null ? undefined : JSON.parse(text);
	} catch {
		return undefined;
	}
}

export const writeJson = (key: string, value: unknown): void =>
	writeStorage(key, JSON.stringify(value));

export function readList(key: string): string[] {
	try {
		const parsed: unknown = JSON.parse(readStorage(key) ?? '[]');
		return Array.isArray(parsed) ? parsed.filter((item) => typeof item === 'string') : [];
	} catch {
		return [];
	}
}

export const writeList = (key: string, list: Iterable<string>): void => {
	const items = [...list];
	writeStorage(key, items.length ? JSON.stringify(items) : null);
};
