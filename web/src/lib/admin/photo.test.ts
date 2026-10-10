import { describe, expect, it } from 'vitest';
import { fitWithin, MAX_WIDTH } from './photo';

describe('fitWithin', () => {
	it('leaves a photo that is narrow enough alone', () => {
		expect(fitWithin(1200, 800)).toEqual({ width: 1200, height: 800 });
		expect(fitWithin(MAX_WIDTH, 900)).toEqual({ width: MAX_WIDTH, height: 900 });
	});

	it('scales a wide photo down to the limit, keeping its shape', () => {
		expect(fitWithin(4000, 3000)).toEqual({ width: 1600, height: 1200 });
		expect(fitWithin(3201, 1000)).toEqual({ width: 1600, height: 500 });
	});

	it('takes another limit', () => {
		expect(fitWithin(2000, 1000, 1000)).toEqual({ width: 1000, height: 500 });
	});
});
