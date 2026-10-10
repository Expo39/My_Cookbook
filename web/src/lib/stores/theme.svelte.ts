import { readStorage, writeStorage } from './storage';

export type Theme = 'system' | 'light' | 'dark';

export const THEME_KEY = 'sapori:theme';

const isTheme = (value: string | null): value is Theme =>
	value === 'system' || value === 'light' || value === 'dark';

/** The inline script in `app.html` applies the stored choice before first paint; this keeps it in step. */
class ThemeStore {
	choice = $state<Theme>('system');

	load(): void {
		const stored = readStorage(THEME_KEY);
		this.choice = isTheme(stored) ? stored : 'system';
	}

	set(choice: Theme): void {
		this.choice = choice;
		if (choice === 'system') delete document.documentElement.dataset.theme;
		else document.documentElement.dataset.theme = choice;
		writeStorage(THEME_KEY, choice === 'system' ? null : choice);
	}
}

export const theme = new ThemeStore();
