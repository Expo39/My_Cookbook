import type { BuildState } from '$lib/admin/github';
import type { CheckResult, Recipe, Section } from '$lib/types/recipe';

export interface SaveResult {
	id: string;
	/** The commit that carries the change; absent on the self-hosted server, which has no build. */
	commit?: string;
}

export type BuildStatus = BuildState;

/** Where an edited recipe goes. Sections and the photo must be handed over before `save`. */
export interface RecipeWriter {
	/** Writes the recipe, together with anything staged by `createSection` and `uploadImage`. */
	save(id: string, recipe: Recipe, extras: { isNew: boolean }): Promise<SaveResult>;
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
