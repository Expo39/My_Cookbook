/**
 * The card design as drawing operations. The numbers come from `assets/card-layout.json`, which the
 * build-time renderer in `crates/cookbook-cli/src/cards/layout.rs` reads too, so both draw the same card.
 */
import spec from '../../../../assets/card-layout.json';
import { ellipsize, fitLines, ingredientWindow, type Face, type Measure } from './text';

export const layout = spec;

export type FormatId = 'og' | 'portrait' | 'story' | 'pin';
export type Format = (typeof spec.formats)[FormatId];

/** The formats a reader can pick in the share sheet, with the names the sheet gives them. */
export const SHARE_FORMATS: { id: Exclude<FormatId, 'og'>; label: string; ratio: string }[] = [
	{ id: 'portrait', label: 'Post', ratio: '4:5' },
	{ id: 'story', label: 'Story', ratio: '9:16' },
	{ id: 'pin', label: 'Pin', ratio: '2:3' }
];

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

/** "1 h 55 min  ·  5 servings", leaving out the time when the recipe has none. */
const metaLine = (content: Content) =>
	[content.total, content.serves].filter(Boolean).join('  ·  ');

const scaled = (sizes: number[], u: number) => sizes.map((size) => size * u);

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
		scaled(b.titleSizes, u),
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
		pen.ops.push({ kind: 'photo', x: 0, y: 0, w, h });
		pen.rect(0, blockY, w, blockH, p.ink, spec.scrimOpacity);
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
		const photoH = Math.max(format.photoShare * h, blockH + 0.1 * h);
		const blockY = photoH - blockH;
		pen.ops.push({ kind: 'photo', x: 0, y: 0, w, h: photoH });
		pen.rect(0, blockY, w, blockH, p.ink, spec.scrimOpacity);
		headerBottom = photoH;
		textTop = blockY + pad;
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
	const step = s.lineStep * u;
	const space = qrY - s.footerGap * u - cursor;
	const fit = space > 0 ? Math.floor(space / step) : 0;
	const { shown, more } = ingredientWindow(content.ingredients.length, fit, s.maxLines);

	const lineSize = s.lineSize * u;
	const amountRight = margin + s.amountColumn * u;
	const restX = amountRight + s.amountGap * u;
	const restWidth = w - margin - restX;
	content.ingredients.slice(0, shown).forEach((line, i) => {
		const top = cursor + i * step;
		const leading = step / lineSize;
		if (line.amount) {
			const amount = ellipsize(measure, 'num', lineSize, line.amount, s.amountColumn * u);
			pen.text(amountRight, top, leading, amount, 'num', lineSize, p.ink, true);
		}
		const rest = ellipsize(measure, 'body', lineSize, line.rest, restWidth);
		pen.text(restX, top, leading, rest, 'body', lineSize, p.ink);
	});
	if (more > 0) {
		pen.text(
			restX,
			cursor + shown * step,
			step / lineSize,
			`+ ${more} more`,
			'body',
			lineSize,
			p.muted
		);
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
	const stackH = wordmark * spec.labelLeading + 2 * noteStep;
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
}
