import type { Recipe } from '$lib/types/recipe';

/** A recipe someone added on this device. It never leaves the browser unless they share it. */
export interface LocalRecipe {
	id: string;
	recipe: Recipe;
	/** Milliseconds since the epoch of the last save. */
	updated: number;
	/** Set once the recipe has been sent to GitHub; from then on it is the cookbook's, not theirs. */
	shared?: { at: number; commit?: string };
}

const DATABASE = 'sapori';
const STORE = 'recipes';

let opening: Promise<IDBDatabase> | undefined;

function database(): Promise<IDBDatabase> {
	opening ??= new Promise<IDBDatabase>((resolve, reject) => {
		const request = indexedDB.open(DATABASE, 1);
		request.onupgradeneeded = () => request.result.createObjectStore(STORE, { keyPath: 'id' });
		request.onsuccess = () => resolve(request.result);
		request.onerror = () => reject(request.error);
	}).catch((error) => {
		opening = undefined;
		throw error;
	});
	return opening;
}

async function run<T>(
	mode: IDBTransactionMode,
	work: (store: IDBObjectStore) => IDBRequest<T>
): Promise<T> {
	const db = await database();
	return new Promise<T>((resolve, reject) => {
		const transaction = db.transaction(STORE, mode);
		const request = work(transaction.objectStore(STORE));
		transaction.oncomplete = () => resolve(request.result);
		transaction.onerror = () => reject(transaction.error);
		transaction.onabort = () => reject(transaction.error);
	});
}

/** Asks the browser to keep this site's storage when space runs short; it may say no. */
export function keepStorage(): void {
	void navigator.storage?.persist?.().catch(() => false);
}

export const localRecipes = {
	all: (): Promise<LocalRecipe[]> => run('readonly', (store) => store.getAll()),
	get: (id: string): Promise<LocalRecipe | undefined> => run('readonly', (store) => store.get(id)),
	put: (entry: LocalRecipe): Promise<IDBValidKey> => run('readwrite', (store) => store.put(entry)),
	remove: (id: string): Promise<undefined> => run('readwrite', (store) => store.delete(id)),
	clear: (): Promise<undefined> => run('readwrite', (store) => store.clear())
};
