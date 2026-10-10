export const PHOTO_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

/** The site's widest generated size is 1600 px, so a larger upload only adds weight to the repository. */
export const MAX_WIDTH = 1600;
const QUALITY = 0.88;

export interface PreparedPhoto {
	blob: Blob;
	width: number;
	height: number;
}

export class PhotoError extends Error {}

export function fitWithin(width: number, height: number, maxWidth = MAX_WIDTH) {
	if (width <= maxWidth) return { width, height };
	return { width: maxWidth, height: Math.round((height * maxWidth) / width) };
}

/** Decodes the file, scales it down to at most 1600 px wide and re-encodes it as a JPEG without metadata. */
export async function preparePhoto(file: File): Promise<PreparedPhoto> {
	if (!PHOTO_TYPES.includes(file.type)) {
		throw new PhotoError('Choose a JPEG, PNG or WebP photo.');
	}
	let bitmap: ImageBitmap;
	try {
		bitmap = await createImageBitmap(file);
	} catch {
		throw new PhotoError('That file could not be read as a photo.');
	}
	const size = fitWithin(bitmap.width, bitmap.height);
	const canvas = document.createElement('canvas');
	canvas.width = size.width;
	canvas.height = size.height;
	const context = canvas.getContext('2d');
	if (!context) throw new PhotoError('This browser cannot resize photos.');
	context.drawImage(bitmap, 0, 0, size.width, size.height);
	bitmap.close();
	const blob = await new Promise<Blob | null>((resolve) =>
		canvas.toBlob(resolve, 'image/jpeg', QUALITY)
	);
	if (!blob) throw new PhotoError('The photo could not be prepared.');
	return { blob, ...size };
}
