const hex = (bytes: ArrayBuffer): string =>
	[...new Uint8Array(bytes)].map((byte) => byte.toString(16).padStart(2, '0')).join('');

/**
 * The `X-Admin-Proof` header for the Worker's `/import`: `<unix milliseconds>.<hex>`, where the hex is the
 * HMAC-SHA256 of the timestamp text keyed with the admin secret. A proof is good for five minutes.
 */
export async function adminProof(secret: string, now = Date.now()): Promise<string> {
	const stamp = String(now);
	const key = await crypto.subtle.importKey(
		'raw',
		new TextEncoder().encode(secret),
		{ name: 'HMAC', hash: 'SHA-256' },
		false,
		['sign']
	);
	const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(stamp));
	return `${stamp}.${hex(signature)}`;
}
