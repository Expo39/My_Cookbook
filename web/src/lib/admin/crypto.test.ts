import { describe, expect, it } from 'vitest';
import {
	BlobFormatError,
	decryptSecrets,
	encryptSecrets,
	readBlob,
	WrongPasswordError
} from './crypto';

// A low count keeps the suite fast; the derivation is the same at 600,000.
const ITERATIONS = 1000;
const secrets = { token: 'github_pat_example', aiImportSecret: 'import-secret' };

describe('the admin blob', () => {
	it('decrypts to the secrets it was made from', async () => {
		const blob = await encryptSecrets(secrets, 'a long enough password', ITERATIONS);
		expect(await decryptSecrets(blob, 'a long enough password')).toEqual(secrets);
	});

	it('keeps the secrets out of the public file', async () => {
		const blob = await encryptSecrets(secrets, 'a long enough password', ITERATIONS);
		expect(JSON.stringify(blob)).not.toContain('github_pat_example');
		expect(blob.kdf).toEqual({ name: 'PBKDF2', hash: 'SHA-256', iterations: ITERATIONS });
	});

	it('uses a fresh salt and iv every time', async () => {
		const first = await encryptSecrets(secrets, 'a long enough password', ITERATIONS);
		const second = await encryptSecrets(secrets, 'a long enough password', ITERATIONS);
		expect(first.salt).not.toBe(second.salt);
		expect(first.iv).not.toBe(second.iv);
	});

	it('rejects a wrong password', async () => {
		const blob = await encryptSecrets(secrets, 'a long enough password', ITERATIONS);
		await expect(decryptSecrets(blob, 'another password!')).rejects.toBeInstanceOf(
			WrongPasswordError
		);
	});

	it('rejects data that was changed', async () => {
		const blob = await encryptSecrets(secrets, 'a long enough password', ITERATIONS);
		const tampered = { ...blob, data: blob.data.replace(/^./, (c) => (c === 'A' ? 'B' : 'A')) };
		await expect(decryptSecrets(tampered, 'a long enough password')).rejects.toBeInstanceOf(
			WrongPasswordError
		);
	});

	it.each([
		['not an object', null],
		['an unknown version', { v: 2 }],
		['an unknown derivation', { v: 1, kdf: { name: 'scrypt' } }],
		[
			'an absurd iteration count',
			{
				v: 1,
				kdf: { name: 'PBKDF2', hash: 'SHA-256', iterations: 1e12 },
				iv: '',
				salt: '',
				data: ''
			}
		],
		[
			'a missing field',
			{ v: 1, kdf: { name: 'PBKDF2', hash: 'SHA-256', iterations: 10 }, iv: '', salt: '' }
		]
	])('refuses a file that is %s', (_name, blob) => {
		expect(() => readBlob(blob)).toThrow(BlobFormatError);
	});
});
