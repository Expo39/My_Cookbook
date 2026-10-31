import { describe, expect, it, vi } from 'vitest';
import type { RecipeWriter } from '$lib/data/writer';
import type { Recipe } from '$lib/types/recipe';
import { savePhoto } from './photo-save';

const stored = {
	title: 'Minestra',
	summary: 'A soup.',
	servings: 4,
	ingredientGroups: [{ items: [{ item: 'pumpkin' }] }],
	steps: [{ text: 'Simmer.' }]
} as unknown as Recipe;

function fakeWriter(recipe: Recipe) {
	const calls: string[] = [];
	const writer = {
		read: vi.fn(async () => recipe),
		uploadImage: vi.fn(async () => {
			calls.push('upload');
			return { src: 'minestra.jpg' };
		}),
		save: vi.fn(async () => {
			calls.push('save');
			return { id: 'soups/minestra', commit: 'abc' };
		})
	} as unknown as RecipeWriter;
	return { writer, calls };
}

describe('savePhoto', () => {
	it('refuses a photo without a description, which the checklist would fail', async () => {
		const { writer } = fakeWriter(stored);
		await expect(savePhoto(writer, 'soups/minestra', new Blob(['x']), '  ')).rejects.toThrow(
			'Describe the photo'
		);
		expect(writer.read).not.toHaveBeenCalled();
	});

	it('uploads the photo, then saves the stored recipe with only its image set', async () => {
		const { writer, calls } = fakeWriter(stored);
		const result = await savePhoto(writer, 'soups/minestra', new Blob(['x']), '  A bowl of soup ');

		expect(calls).toEqual(['upload', 'save']);
		expect(writer.save).toHaveBeenCalledWith(
			'soups/minestra',
			{ ...stored, image: { src: 'minestra.jpg', alt: 'A bowl of soup' } },
			{ isNew: false, previousImage: undefined }
		);
		expect(result.commit).toBe('abc');
	});

	it('names the photo it replaces, so the old file can be removed', async () => {
		const { writer } = fakeWriter({ ...stored, image: { src: 'minestra.png', alt: 'Old' } });
		await savePhoto(writer, 'soups/minestra', new Blob(['x']), 'New');
		expect(writer.save).toHaveBeenCalledWith(
			'soups/minestra',
			expect.objectContaining({ image: { src: 'minestra.jpg', alt: 'New' } }),
			{ isNew: false, previousImage: 'minestra.png' }
		);
	});

	it('saves nothing when the recipe cannot be read', async () => {
		const { writer } = fakeWriter(stored);
		vi.mocked(writer.read).mockRejectedValueOnce(new Error('gone'));
		await expect(savePhoto(writer, 'soups/minestra', new Blob(['x']), 'Soup')).rejects.toThrow(
			'gone'
		);
		expect(writer.uploadImage).not.toHaveBeenCalled();
		expect(writer.save).not.toHaveBeenCalled();
	});
});
