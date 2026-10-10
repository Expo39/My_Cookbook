import type { BuildState } from '$lib/admin/github';
import type { CheckResult, Recipe, Section } from '$lib/types/recipe';
import type { StoredRecipe } from './stored';

export const CHANGED_MESSAGE =
	'This recipe was changed on GitHub after you opened it. Nothing was saved. Reload the page and make the change again.';
export const CHANGED_SERVER_MESSAGE =
	'This recipe was changed after you opened it. Nothing was saved. Reload the page and make the change again.';

export interface SaveResult {
	id: string;
	/** The commit that carries the change; absent on the self-hosted server, which has no build. */
	commit?: string;
}

export type BuildStatus = BuildState;

/** Where an edited recipe goes. Sections and the photo must be handed over before `save`. */
export interface RecipeWriter {
	/**
	 * The recipe as it is stored now, not as the published site shows it. An edit must start from
	 * this, and `save` refuses when the stored recipe has changed since. Throws `RecipeNotFoundError`.
	 */
	read(id: string): Promise<Recipe>;
	/**
	 * Writes the recipe, together with anything staged by `createSection` and `uploadImage`.
	 * `previousImage` is the photo file the edit started from; it is deleted when the recipe no longer uses it.
	 */
	save(
		id: string,
		recipe: Recipe,
		extras: { isNew: boolean; previousImage?: string }
	): Promise<SaveResult>;
	/**
	 * Moves the recipe to a new address, with its photo, and points every recipe that listed it under
	 * `related` at the new address. `recipe` carries the edits; `photo` replaces the photo when given.
	 * Anything staged by `createSection` is written too. Throws `WriteError` with code `conflict` when
	 * the recipe changed since it was read or the new address is taken.
	 */
	move(
		from: string,
		to: string,
		recipe: Recipe,
		extras: { previousImage?: string; photo?: Blob }
	): Promise<SaveResult>;
	/** Every recipe as it is stored now, which the link and address checks read. */
	readAll(): Promise<StoredRecipe[]>;
	remove(id: string, extras: { title: string; image?: string }): Promise<SaveResult>;
	/** `path` is the new folder, relative to `recipes/`. */
	createSection(path: string, section: Section): Promise<void>;
	/** Returns the file name to put in `recipe.image.src`. */
	uploadImage(id: string, file: Blob): Promise<{ src: string }>;
	status(result: SaveResult): Promise<BuildStatus>;
}

/** A refused write. `results` holds the checklist when the server ran it. */
export class WriteError extends Error {
	constructor(
		message: string,
		readonly code: string,
		readonly results: CheckResult[] = []
	) {
		super(message);
	}
}
