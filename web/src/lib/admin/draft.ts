import { readJson, writeStorage, writeJson } from '$lib/stores/storage';

export const draftKey = (id: string): string => `sapori:draft:${id}`;

export interface Draft<T> {
	savedAt: number;
	form: T;
}

/** The unsaved form for a recipe id (or `new`). Storage may be blocked, in which case nothing is kept. */
export function saveDraft<T>(id: string, form: T, now = Date.now()): void {
	writeJson(draftKey(id), { savedAt: now, form } satisfies Draft<T>);
}

export function loadDraft<T>(id: string): Draft<T> | undefined {
	const value = readJson(draftKey(id)) as Partial<Draft<T>> | undefined;
	return value && typeof value.savedAt === 'number' && value.form ? (value as Draft<T>) : undefined;
}

export const clearDraft = (id: string): void => writeStorage(draftKey(id), null);
