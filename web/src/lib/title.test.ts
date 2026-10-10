import { describe, expect, it } from 'vitest';
import { siteTitle } from './title';

describe('site title', () => {
	it('is not empty', () => {
		expect(siteTitle.length).toBeGreaterThan(0);
	});
});
