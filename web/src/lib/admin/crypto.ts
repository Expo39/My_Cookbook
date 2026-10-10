import { fromBase64, toBase64 } from './encoding';

export interface Secrets {
	token: string;
	aiImportSecret?: string;
}

/** `web/static/admin.json`. It is public, so everything secret sits inside `data`. */
export interface AdminBlob {
	v: 1;
	kdf: { name: 'PBKDF2'; hash: 'SHA-256'; iterations: number };
	iv: string;
	salt: string;
	data: string;
}

export const ITERATIONS = 600_000;
export const MIN_PASSWORD = 12;

export class WrongPasswordError extends Error {
	constructor() {
		super("That password didn't work.");
	}
}

export class BlobFormatError extends Error {
	constructor(reason: string) {
		super(`The editing file is not readable: ${reason}.`);
	}
}

async function deriveKey(password: string, salt: Uint8Array<ArrayBuffer>, iterations: number) {
	const material = await crypto.subtle.importKey(
		'raw',
		new TextEncoder().encode(password),
		'PBKDF2',
		false,
		['deriveKey']
	);
	return crypto.subtle.deriveKey(
		{ name: 'PBKDF2', hash: 'SHA-256', salt, iterations },
		material,
		{ name: 'AES-GCM', length: 256 },
		false,
		['encrypt', 'decrypt']
	);
}

export async function encryptSecrets(
	secrets: Secrets,
	password: string,
	iterations = ITERATIONS
): Promise<AdminBlob> {
	const salt = crypto.getRandomValues(new Uint8Array(16));
	const iv = crypto.getRandomValues(new Uint8Array(12));
	const key = await deriveKey(password, salt, iterations);
	const data = await crypto.subtle.encrypt(
		{ name: 'AES-GCM', iv },
		key,
		new TextEncoder().encode(JSON.stringify(secrets))
	);
	return {
		v: 1,
		kdf: { name: 'PBKDF2', hash: 'SHA-256', iterations },
		iv: toBase64(iv),
		salt: toBase64(salt),
		data: toBase64(new Uint8Array(data))
	};
}

export function readBlob(blob: unknown): AdminBlob {
	const value = blob as Partial<AdminBlob> | null;
	if (!value || typeof value !== 'object') throw new BlobFormatError('it is not an object');
	if (value.v !== 1) throw new BlobFormatError(`version ${String(value.v)} is not supported`);
	const { kdf } = value;
	if (kdf?.name !== 'PBKDF2' || kdf.hash !== 'SHA-256') {
		throw new BlobFormatError('the key derivation is not supported');
	}
	if (!Number.isInteger(kdf.iterations) || kdf.iterations < 1 || kdf.iterations > 10_000_000) {
		throw new BlobFormatError('the iteration count is out of range');
	}
	for (const field of ['iv', 'salt', 'data'] as const) {
		if (typeof value[field] !== 'string') throw new BlobFormatError(`${field} is missing`);
	}
	return value as AdminBlob;
}

/** Throws `BlobFormatError` for a file this version cannot read and `WrongPasswordError` for a bad password. */
export async function decryptSecrets(blob: unknown, password: string): Promise<Secrets> {
	const parsed = readBlob(blob);
	let plain: ArrayBuffer;
	try {
		const key = await deriveKey(password, fromBase64(parsed.salt), parsed.kdf.iterations);
		plain = await crypto.subtle.decrypt(
			{ name: 'AES-GCM', iv: fromBase64(parsed.iv) },
			key,
			fromBase64(parsed.data)
		);
	} catch {
		throw new WrongPasswordError();
	}
	const secrets: unknown = JSON.parse(new TextDecoder().decode(plain));
	if (!secrets || typeof (secrets as Secrets).token !== 'string') {
		throw new BlobFormatError('the token is missing');
	}
	return secrets as Secrets;
}
