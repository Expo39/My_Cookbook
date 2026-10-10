/** Moves the item at `from` to `to`, in place. */
export function moveItem<T>(list: T[], from: number, to: number): void {
	if (from === to || from < 0 || to < 0 || from >= list.length || to >= list.length) return;
	const [item] = list.splice(from, 1);
	list.splice(to, 0, item);
}

export function removeItem<T>(list: T[], index: number): void {
	list.splice(index, 1);
}
