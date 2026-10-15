/** One server-sent event: its name (`message` when none was given) and its data. */
export interface SseEvent {
	event: string;
	data: string;
}

/**
 * Reads server-sent events from text that arrives in pieces. A piece may end anywhere, even in the
 * middle of a line, so an event is handed back only once the blank line after it has arrived.
 */
export class SseReader {
	#pending = '';
	/** A carriage return at the end of a piece, held back until it is known whether a line feed follows. */
	#carriage = false;

	push(text: string): SseEvent[] {
		let raw = (this.#carriage ? '\r' : '') + text;
		this.#carriage = raw.endsWith('\r');
		if (this.#carriage) raw = raw.slice(0, -1);
		this.#pending += raw.replace(/\r\n?/g, '\n');
		const events: SseEvent[] = [];
		let end: number;
		while ((end = this.#pending.indexOf('\n\n')) >= 0) {
			const block = this.#pending.slice(0, end);
			this.#pending = this.#pending.slice(end + 2);
			const parsed = parse(block);
			if (parsed) events.push(parsed);
		}
		return events;
	}

	/** An event left without its closing blank line when the stream ended. */
	finish(): SseEvent[] {
		this.#carriage = false;
		const parsed = parse(this.#pending);
		this.#pending = '';
		return parsed ? [parsed] : [];
	}
}

function parse(block: string): SseEvent | null {
	let event = 'message';
	const data: string[] = [];
	for (const line of block.split('\n')) {
		if (line.startsWith('event:')) event = line.slice(6).trim();
		else if (line.startsWith('data:')) data.push(line.slice(5).replace(/^ /, ''));
	}
	return data.length ? { event, data: data.join('\n') } : null;
}
