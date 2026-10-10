import { compose, layout, type Content, type FormatId, type Op, type QrMatrix } from './layout';
import type { Face, Measure } from './text';

const font = (face: Face, size: number): string => {
	const { family, weight } = layout.fonts[face];
	return `${weight} ${size}px "${family}"`;
};

export const canvasMeasure =
	(ctx: CanvasRenderingContext2D): Measure =>
	(face, size, text) => {
		ctx.font = font(face, size);
		return ctx.measureText(text).width;
	};

/** The characters a card draws, so the font subsets that hold them are fetched. */
const textOf = (content: Content): string =>
	[
		content.label,
		content.title,
		content.titleLocal ?? '',
		content.total ?? '',
		content.serves,
		content.urlText,
		layout.wordmark,
		layout.qrNote,
		...content.ingredients.flatMap((line) => [line.amount, line.rest])
	].join(' ');

async function loadFonts(content: Content): Promise<void> {
	const text = `${textOf(content)} ${textOf(content).toUpperCase()}`;
	await Promise.all(
		Object.values(layout.fonts).map(({ family, weight }) =>
			document.fonts.load(`${weight} 32px "${family}"`, text)
		)
	);
}

/** Draws `image` over the rectangle, cropping the middle of the picture as the build-time cards do. */
function drawCover(
	ctx: CanvasRenderingContext2D,
	image: CanvasImageSource & { width: number; height: number },
	[x, y, w, h]: [number, number, number, number]
) {
	const scale = Math.max(w / image.width, h / image.height);
	const [sw, sh] = [w / scale, h / scale];
	ctx.drawImage(image, (image.width - sw) / 2, (image.height - sh) / 2, sw, sh, x, y, w, h);
}

function draw(
	ctx: CanvasRenderingContext2D,
	ops: Op[],
	photo: (CanvasImageSource & { width: number; height: number }) | null,
	qr: QrMatrix | null
) {
	ctx.textBaseline = 'alphabetic';
	for (const op of ops) {
		ctx.globalAlpha = 1;
		if (op.kind === 'rect') {
			ctx.globalAlpha = op.opacity;
			ctx.fillStyle = op.fill;
			ctx.fillRect(op.x, op.y, op.w, op.h);
		} else if (op.kind === 'photo') {
			if (photo) drawCover(ctx, photo, [op.x, op.y, op.w, op.h]);
		} else if (op.kind === 'text') {
			ctx.font = font(op.face, op.size);
			ctx.fillStyle = op.fill;
			ctx.textAlign = op.end ? 'right' : 'left';
			ctx.fillText(op.text, op.x, op.y);
		} else if (qr) {
			ctx.fillStyle = op.fill;
			for (let row = 0; row < qr.size; row++) {
				for (let column = 0; column < qr.size; column++) {
					if (qr.dark[row * qr.size + column]) {
						ctx.fillRect(op.x + column * op.module, op.y + row * op.module, op.module, op.module);
					}
				}
			}
		}
	}
	ctx.globalAlpha = 1;
}

export interface RenderInput {
	format: FormatId;
	content: Content;
	photo: (CanvasImageSource & { width: number; height: number }) | null;
}

/** Paints a card to a canvas of the format's size, in the fonts the page has loaded. */
export async function renderCard({
	format,
	content,
	photo
}: RenderInput): Promise<HTMLCanvasElement> {
	const spec = layout.formats[format];
	const canvas = document.createElement('canvas');
	canvas.width = spec.width;
	canvas.height = spec.height;
	const ctx = canvas.getContext('2d');
	if (!ctx) throw new Error('The browser cannot draw the card.');
	await loadFonts(content);
	const ops = compose(spec, content, canvasMeasure(ctx));
	ctx.fillStyle = layout.palette.bg;
	ctx.fillRect(0, 0, spec.width, spec.height);
	draw(ctx, ops, photo, content.qr);
	return canvas;
}

export function toBlob(canvas: HTMLCanvasElement): Promise<Blob> {
	return new Promise((resolve, reject) =>
		canvas.toBlob(
			(blob) => (blob ? resolve(blob) : reject(new Error('The card could not be saved.'))),
			'image/png'
		)
	);
}

/** Loads a picture from the same site so it can be drawn; `null` when it cannot be read. */
export async function loadPhoto(url: string): Promise<HTMLImageElement | null> {
	const image = new Image();
	image.src = url;
	try {
		await image.decode();
		return image;
	} catch {
		return null;
	}
}
