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

/** A photo someone gave a recipe on this device, shown only to them. */
export interface LocalPhoto {
	/** The recipe's id: one of theirs, or one of the cookbook's. */
	id: string;
	blob: Blob;
	alt: string;
	updated: number;
}

const DATABASE = 'sapori';
const STORE = 'recipes';
const PHOTOS = 'photos';

let opening: Promise<IDBDatabase> | undefined;

function database(): Promise<IDBDatabase> {
	opening ??= new Promise<IDBDatabase>((resolve, reject) => {
		const request = indexedDB.open(DATABASE, 2);
		request.onupgradeneeded = () => {
			const db = request.result;
			for (const name of [STORE, PHOTOS]) {
				if (!db.objectStoreNames.contains(name)) db.createObjectStore(name, { keyPath: 'id' });
			}
		};
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
	work: (store: IDBObjectStore) => IDBRequest<T>,
	name = STORE
): Promise<T> {
	const db = await database();
	return new Promise<T>((resolve, reject) => {
		const transaction = db.transaction(name, mode);
		const request = work(transaction.objectStore(name));
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

export const localPhotos = {
	get: (id: string): Promise<LocalPhoto | undefined> =>
		run('readonly', (store) => store.get(id), PHOTOS),
	put: (entry: LocalPhoto): Promise<IDBValidKey> =>
		run('readwrite', (store) => store.put(entry), PHOTOS),
	remove: (id: string): Promise<undefined> => run('readwrite', (store) => store.delete(id), PHOTOS)
};
