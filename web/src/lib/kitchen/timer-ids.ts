import type { RenderedSegment } from '$lib/types/recipe';

export type TimerSegment = Extract<RenderedSegment, { type: 'timer' }>;

export interface TimerSpec {
	id: string;
	name: string;
	minutes: number;
	text: string;
}

const capitalise = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

/** The timers in one step, each with a stable id so a reload or a second tap finds the same one. */
export function stepTimers(
	recipe: { id: string; title: string },
	number: number,
	segments: RenderedSegment[]
): TimerSpec[] {
	return segments
		.filter((segment): segment is TimerSegment => segment.type === 'timer')
		.map((segment, position) => ({
			id: `${recipe.id}#${number}.${position}`,
			name: segment.name ? capitalise(segment.name) : `${recipe.title}, step ${number}`,
			minutes: segment.minMinutes,
			text: segment.text
		}));
}
