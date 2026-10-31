/**
 * The card design as drawing operations. The numbers come from `assets/card-layout.json`, which the
 * build-time renderer in `crates/cookbook-cli/src/cards/layout.rs` reads too, so both draw the same card.
 */
import spec from '../../../../assets/card-layout.json';
import { ellipsize, fitLines, wrap, type Face, type Measure } from './text';

export const layout = spec;

export type FormatId = 'og' | 'portrait' | 'story';
export type Format = (typeof spec.formats)[FormatId];

export interface Line {
	amount: string;
	rest: string;
}

export interface QrMatrix {
	size: number;
	dark: boolean[];
}

export interface Content {
	label: string;
	title: string;
	titleLocal?: string;
	total?: string;
	serves: string;
	ingredients: Line[];
	qr: QrMatrix | null;
	urlText: string;
	hasPhoto: boolean;
	/** "@handle", when the site shows its Instagram account. */
	instagram?: string;
}

export type Op =
	| { kind: 'rect'; x: number; y: number; w: number; h: number; fill: string; opacity: number }
	| { kind: 'photo'; x: number; y: number; w: number; h: number }
	| {
			kind: 'text';
			x: number;
			y: number;
			text: string;
			face: Face;
			size: number;
			fill: string;
			end: boolean;
	  }
	| { kind: 'glyph'; x: number; y: number; size: number; stroke: string }
	| { kind: 'qr'; x: number; y: number; module: number; fill: string };

/** An ingredient line split into its amount and the rest, as the cards set them in two columns. */
export function splitAmount(text: string, amount: string | undefined): Line {
	if (amount && text.startsWith(amount)) {
		return { amount, rest: text.slice(amount.length).trimStart() };
	}
	return { amount: '', rest: text };
}

class Pen {
	ops: Op[] = [];

	/** The baseline of a line of `size` set in a box of `leading` times its size that starts at `top`. */
	baseline(top: number, size: number, leading: number) {
		return top + size * ((leading - 1) / 2 + spec.ascent);
	}

	rect(x: number, y: number, w: number, h: number, fill: string, opacity = 1) {
		this.ops.push({ kind: 'rect', x, y, w, h, fill, opacity });
	}

	text(
		x: number,
		top: number,
		leading: number,
		text: string,
		face: Face,
		size: number,
		fill: string,
		end = false
	) {
		this.ops.push({
			kind: 'text',
			x,
			y: this.baseline(top, size, leading),
			text,
			face,
			size,
			fill,
			end
		});
	}
}

/** "1 h 55 min  |  5 servings", leaving out the time when the recipe has none. */
const metaLine = (content: Content) =>
	[content.total, content.serves].filter(Boolean).join('  |  ');

const scaled = (sizes: number[], u: number) => sizes.map((size) => size * u);

interface Placed {
	amount: string;
	parts: string[];
	column: number;
	row: number;
}

/**
 * Where each ingredient goes on a sheet, shown in full: a long one wraps under itself, and an
 * amount too wide for its column joins the words. The lines shrink a step at a time to a size that
 * still reads, then the list runs in two balanced columns, keeping each ingredient's lines
 * together. Only a list too long even for that ends in "+ N more".
 */
export function planList(lines: Line[], space: number, width: number, u: number, measure: Measure) {
	const s = spec.sheet;
	const columnGap = 2 * s.amountGap * u;
	const attempt = (columns: number, scale: number, partial: boolean) => {
		const size = s.lineSize * u * scale;
		const step = s.lineStep * u * scale;
		const gap = s.amountGap * u * scale;
		const columnWidth = (width - (columns - 1) * columnGap) / columns;
		const amountWidth = s.amountColumn * u * scale * (columns === 2 ? s.pairedAmountShare : 1);
		const items = lines.map((line) => {
			const fits = measure('num', size, line.amount) <= amountWidth;
			const rest = fits || !line.amount ? line.rest : `${line.amount} ${line.rest}`;
			return {
				amount: fits ? line.amount : '',
				parts: wrap(measure, 'body', size, rest, columnWidth - amountWidth - gap)
			};
		});
		const rows = space > 0 ? Math.floor(space / step) : 0;
		const total = items.reduce((sum, item) => sum + item.parts.length, 0);
		const target = Math.min(rows, Math.ceil(total / columns));
		const placed: Placed[] = [];
		let column = 0;
		let row = 0;
		for (const item of items) {
			const height = item.parts.length;
			if (row > 0 && row + height > target && column < columns - 1) {
				column += 1;
				row = 0;
			}
			if (row + height > rows) {
				if (!partial) return undefined;
				break;
			}
			placed.push({ ...item, column, row });
			row += height;
		}
		// A cut list keeps a line free for "+ N more".
		while (placed.length < items.length && placed.length && row >= rows) {
			const last = placed.pop() as Placed;
			({ column, row } = last);
		}
		const more = items.length - placed.length;
		return {
			size,
			step,
			gap,
			columnGap,
			columnWidth,
			amountWidth,
			placed,
			more,
			moreAt: { column, row }
		};
	};
	for (const columns of [1, 2]) {
		for (let scale = 1; scale >= s.minLineScale - 1e-9; scale -= 0.05) {
			const plan = attempt(columns, scale, false);
			if (plan) return plan;
		}
	}
	return attempt(2, s.minLineScale, true) as NonNullable<ReturnType<typeof attempt>>;
}

/** The operations for one card, in painting order. */
export function compose(format: Format, content: Content, measure: Measure): Op[] {
	const pen = new Pen();
	if (format.kind === 'banner') banner(pen, format, content, measure);
	else sheet(pen, format, content, measure);
	return pen.ops;
}

function banner(pen: Pen, format: Format, content: Content, measure: Measure) {
	const { banner: b, palette: p } = spec;
	const u = format.width / b.designWidth;
	const { width: w, height: h } = format;
	const margin = b.margin * u;
	const pad = b.pad * u;
	const inner = w - 2 * margin;
	const labelSize = b.labelSize * u;
	const label = ellipsize(measure, 'bodyBold', labelSize, content.label.toUpperCase(), inner);
	const title = fitLines(
		measure,
		'display',
		scaled(content.hasPhoto ? b.photoTitleSizes : b.titleSizes, u),
		content.title,
		inner,
		b.titleLines
	);
	const localSize = b.localSize * u;
	const metaSize = b.metaSize * u;
	const meta = metaLine(content);

	const labelH = labelSize * spec.labelLeading;
	const titleH = title.lines.length * title.size * b.leading;
	const localH = content.titleLocal ? b.localGap * u + localSize * spec.textLeading : 0;
	const metaH = metaSize * spec.textLeading;
	const contentH = labelH + b.labelGap * u + titleH + localH + b.metaGap * u + metaH;

	let y: number;
	if (content.hasPhoto) {
		const blockH = pad + contentH + pad;
		const blockY = h - blockH;
		pen.ops.push({ kind: 'photo', x: 0, y: 0, w, h: blockY });
		pen.rect(0, blockY, w, blockH, p.ink);
		y = blockY + pad;
	} else {
		pen.rect(0, 0, w, h, p.primary);
		y = (h - contentH) / 2;
	}

	const on = p.onPrimary;
	pen.text(margin, y, spec.labelLeading, label, 'bodyBold', labelSize, on);
	y += labelH + b.labelGap * u;
	for (const line of title.lines) {
		pen.text(margin, y, b.leading, line, 'display', title.size, on);
		y += title.size * b.leading;
	}
	if (content.titleLocal) {
		y += b.localGap * u;
		const local = ellipsize(measure, 'body', localSize, content.titleLocal, inner);
		pen.text(margin, y, spec.textLeading, local, 'body', localSize, on);
		y += localSize * spec.textLeading;
	}
	y += b.metaGap * u;
	pen.text(margin, y, spec.textLeading, meta, 'num', metaSize, on);
	pen.text(w - margin, y, spec.textLeading, spec.wordmark, 'display', b.wordmarkSize * u, on, true);
}

function sheet(pen: Pen, format: Format, content: Content, measure: Measure) {
	const { sheet: s, palette: p } = spec;
	const u = format.width / s.designWidth;
	const { width: w, height: h } = format;
	const margin = s.margin * u;
	const pad = s.pad * u;
	const inner = w - 2 * margin;

	const labelSize = s.labelSize * u;
	const label = ellipsize(measure, 'bodyBold', labelSize, content.label.toUpperCase(), inner);
	const title = fitLines(
		measure,
		'display',
		scaled(s.titleSizes, u),
		content.title,
		inner,
		s.titleLines
	);
	const localSize = s.localSize * u;
	const metaSize = s.metaSize * u;

	const labelH = labelSize * spec.labelLeading;
	const titleH = title.lines.length * title.size * s.leading;
	const localH = content.titleLocal ? s.localGap * u + localSize * spec.textLeading : 0;
	const contentH =
		labelH + s.labelGap * u + titleH + localH + s.metaGap * u + metaSize * spec.textLeading;

	let headerBottom: number;
	let textTop: number;
	if (content.hasPhoto) {
		const blockH = pad + contentH + pad;
		const photoH = Math.round(format.photoShare * h);
		pen.ops.push({ kind: 'photo', x: 0, y: 0, w, h: photoH });
		pen.rect(0, photoH, w, blockH, p.ink);
		headerBottom = photoH + blockH;
		textTop = photoH + pad;
	} else {
		const top = Math.max(format.safeTop, pad);
		const blockH = top + contentH + pad;
		pen.rect(0, 0, w, blockH, p.primary);
		headerBottom = blockH;
		textTop = top;
	}

	const on = p.onPrimary;
	let y = textTop;
	pen.text(margin, y, spec.labelLeading, label, 'bodyBold', labelSize, on);
	y += labelH + s.labelGap * u;
	for (const line of title.lines) {
		pen.text(margin, y, s.leading, line, 'display', title.size, on);
		y += title.size * s.leading;
	}
	if (content.titleLocal) {
		y += s.localGap * u;
		const local = ellipsize(measure, 'body', localSize, content.titleLocal, inner);
		pen.text(margin, y, spec.textLeading, local, 'body', localSize, on);
		y += localSize * spec.textLeading;
	}
	y += s.metaGap * u;
	pen.text(margin, y, spec.textLeading, metaLine(content), 'num', metaSize, on);

	let cursor = headerBottom + s.bodyGap * u;
	const listLabel = s.listLabelSize * u;
	pen.text(margin, cursor, spec.labelLeading, 'INGREDIENTS', 'bodyBold', listLabel, p.primary);
	cursor += listLabel * spec.labelLeading + s.listGap * u;

	const qrBox = Math.round(s.qrBox * u);
	const qrX = Math.round(w - margin - qrBox);
	const qrY = Math.round(h - format.safeBottom - margin - qrBox);
	const space = qrY - s.footerGap * u - cursor;
	const list = planList(content.ingredients, space, w - 2 * margin, u, measure);
	const leading = list.step / list.size;
	const slot = (column: number) => {
		const amountRight = margin + column * (list.columnWidth + list.columnGap) + list.amountWidth;
		return { amountRight, restX: amountRight + list.gap };
	};
	for (const item of list.placed) {
		const { amountRight, restX } = slot(item.column);
		item.parts.forEach((part, k) => {
			const top = cursor + (item.row + k) * list.step;
			if (k === 0 && item.amount) {
				pen.text(amountRight, top, leading, item.amount, 'num', list.size, p.ink, true);
			}
			pen.text(restX, top, leading, part, 'body', list.size, p.ink);
		});
	}
	if (list.more > 0) {
		const { restX } = slot(list.moreAt.column);
		const top = cursor + list.moreAt.row * list.step;
		pen.text(restX, top, leading, `+ ${list.more} more`, 'body', list.size, p.muted);
	}

	if (content.qr) {
		pen.rect(qrX, qrY, qrBox, qrBox, p.surface);
		const quiet = s.qrQuiet * u;
		const module = Math.max(1, Math.floor((qrBox - 2 * quiet) / content.qr.size));
		const offset = Math.floor((qrBox - module * content.qr.size) / 2);
		pen.ops.push({
			kind: 'qr',
			x: Math.trunc(qrX + offset),
			y: Math.trunc(qrY + offset),
			module,
			fill: p.ink
		});
	}

	const wordmark = s.wordmarkSize * u;
	const note = s.noteSize * u;
	const noteStep = s.noteStep * u;
	const stackH = wordmark * spec.labelLeading + (content.instagram ? 3 : 2) * noteStep;
	let ny = qrY + (qrBox - stackH) / 2;
	const leftWidth = qrX - margin - s.footerGap * u;
	const mark = ellipsize(measure, 'display', wordmark, spec.wordmark, leftWidth);
	pen.text(margin, ny, spec.labelLeading, mark, 'display', wordmark, p.primary);
	ny += wordmark * spec.labelLeading;
	const hint = ellipsize(measure, 'body', note, spec.qrNote, leftWidth);
	pen.text(margin, ny, noteStep / note, hint, 'body', note, p.muted);
	ny += noteStep;
	const url = ellipsize(measure, 'body', note, content.urlText, leftWidth);
	pen.text(margin, ny, noteStep / note, url, 'body', note, p.muted);
	if (content.instagram) {
		ny += noteStep;
		const gap = s.glyphGap * u;
		pen.ops.push({
			kind: 'glyph',
			x: margin,
			y: ny + (noteStep - note) / 2,
			size: note,
			stroke: p.muted
		});
		const handle = ellipsize(measure, 'body', note, content.instagram, leftWidth - note - gap);
		pen.text(margin + note + gap, ny, noteStep / note, handle, 'body', note, p.muted);
	}
}
