import type { RecipeWriter, SaveResult } from '$lib/data/writer';

/**
 * Gives a published recipe a photo, or a new one, in one commit: the photo file and the recipe with
 * its `image` set. It starts from the recipe as stored, so nothing else in the file changes, and the
 * old photo file goes when its name differs from the new one. The description is required.
 */
export async function savePhoto(
	writer: RecipeWriter,
	id: string,
	photo: Blob,
	alt: string
): Promise<SaveResult> {
	// The recipe checklist refuses a photo without a description, so it would fail the build.
	if (!alt.trim()) throw new Error('Describe the photo before saving it.');
	const recipe = await writer.read(id);
	const previousImage = recipe.image?.src;
	const { src } = await writer.uploadImage(id, photo);
	return writer.save(
		id,
		{ ...recipe, image: { src, alt: alt.trim() } },
		{
			isNew: false,
			previousImage
		}
	);
}
