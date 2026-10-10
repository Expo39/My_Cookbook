import { describe, expect, it } from 'vitest';
import { instagramFrom } from './config';

describe('instagramFrom', () => {
	it('is off unless enabled', () => {
		expect(instagramFrom({})).toBeNull();
		expect(instagramFrom({ social: { instagram: { handle: 'tonys_foods' } } })).toBeNull();
		expect(
			instagramFrom({ social: { instagram: { enabled: false, handle: 'tonys_foods' } } })
		).toBeNull();
	});

	it('builds the profile link when enabled', () => {
		expect(
			instagramFrom({ social: { instagram: { enabled: true, handle: '@tonys_foods' } } })
		).toEqual({
			label: 'Instagram',
			handle: '@tonys_foods',
			url: 'https://www.instagram.com/tonys_foods/'
		});
	});

	it('rejects a handle that is not a valid username', () => {
		expect(
			instagramFrom({ social: { instagram: { enabled: true, handle: 'not a/handle' } } })
		).toBeNull();
	});
});
