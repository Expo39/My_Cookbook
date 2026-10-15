import { readStorage, writeStorage } from './storage';

export type Theme = 'system' | 'light' | 'dark';

export const THEME_KEY = 'sapori:theme';

const isTheme = (value: string | null): value is Theme =>
	value === 'system' || value === 'light' || value === 'dark';

/**
 * Light is the default, set on `<html>` in `app.html`; its inline script applies a stored choice before
 * first paint, and this keeps it in step.
 */
class ThemeStore {
	choice = $state<Theme>('light');

	load(): void {
		const stored = readStorage(THEME_KEY);
		this.choice = isTheme(stored) ? stored : 'light';
	}

	set(choice: Theme): void {
		this.choice = choice;
		if (choice === 'system') delete document.documentElement.dataset.theme;
		else document.documentElement.dataset.theme = choice;
		writeStorage(THEME_KEY, choice === 'light' ? null : choice);
	}
}

export const theme = new ThemeStore();
