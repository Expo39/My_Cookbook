import type { UnitSystem } from '$lib/types/recipe';
import { readStorage, writeStorage } from './storage';

const UNITS_KEY = 'sapori:units';
const UNIT_HINT_KEY = 'sapori:hint:units';

class Preferences {
	units = $state<UnitSystem>('metric');
	unitHintDismissed = $state(false);
	loaded = false;

	load(): void {
		if (this.loaded) return;
		this.loaded = true;
		this.units = readStorage(UNITS_KEY) === 'us' ? 'us' : 'metric';
		this.unitHintDismissed = readStorage(UNIT_HINT_KEY) === '1';
	}

	setUnits(units: UnitSystem): void {
		this.units = units;
		writeStorage(UNITS_KEY, units === 'us' ? 'us' : null);
	}

	dismissUnitHint(): void {
		this.unitHintDismissed = true;
		writeStorage(UNIT_HINT_KEY, '1');
	}
}

export const preferences = new Preferences();
