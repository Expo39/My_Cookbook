import { base } from '$app/paths';
import { serverLogin, serverLogout, serverSession } from '$lib/data/api-writer';
import { adminRepo, serverMode } from './config';
import {
	decryptSecrets,
	encryptSecrets,
	MIN_PASSWORD,
	WrongPasswordError,
	type AdminBlob,
	type Secrets
} from './crypto';
import { GitHubClient } from './github';

const TOKEN_KEY = 'sapori:admin-token';
const SECRET_KEY = 'sapori:admin-import-secret';
export const BLOB_PATH = 'web/static/admin.json';

export class NotSetUpError extends Error {
	constructor() {
		super('Editing has not been set up on this site yet.');
	}
}

function stored(key: string): string | null {
	try {
		return sessionStorage.getItem(key);
	} catch {
		return null;
	}
}

function store(key: string, value: string | null | undefined): void {
	try {
		if (value) sessionStorage.setItem(key, value);
		else sessionStorage.removeItem(key);
	} catch {
		/* the unlock then lasts until the page is reloaded */
	}
}

/**
 * Whether editing is unlocked in this tab. The GitHub token and the import secret live in memory and
 * in `sessionStorage` (this tab only), never in `localStorage`.
 */
class AdminSession {
	unlocked = $state(false);
	token = $state<string | null>(null);
	aiImportSecret = $state<string | null>(null);
	/** Whether `admin.json` exists on the deployed site; `null` until it has been looked for. */
	configured = $state<boolean | null>(null);

	readonly server = serverMode();

	async restore(): Promise<void> {
		if (this.unlocked) return;
		if (this.server) {
			this.unlocked = await serverSession();
			this.configured = true;
			return;
		}
		const token = stored(TOKEN_KEY);
		if (token) {
			this.token = token;
			this.aiImportSecret = stored(SECRET_KEY);
			this.unlocked = true;
		}
	}

	async fetchBlob(): Promise<AdminBlob | null> {
		const response = await fetch(`${base}/admin.json`, { cache: 'no-store' }).catch(() => null);
		if (!response?.ok) return null;
		return (await response.json().catch(() => null)) as AdminBlob | null;
	}

	async checkConfigured(): Promise<void> {
		if (this.server) {
			this.configured = true;
			return;
		}
		this.configured = (await this.fetchBlob()) !== null;
	}

	/** Throws `WrongPasswordError` for a bad password. */
	async unlock(password: string): Promise<void> {
		if (this.server) {
			if (!(await serverLogin(password))) {
				throw new WrongPasswordError();
			}
			this.unlocked = true;
			return;
		}
		const blob = await this.fetchBlob();
		if (!blob) throw new NotSetUpError();
		this.#open(await decryptSecrets(blob, password));
	}

	#open(secrets: Secrets): void {
		this.token = secrets.token;
		this.aiImportSecret = secrets.aiImportSecret ?? null;
		this.unlocked = true;
		store(TOKEN_KEY, secrets.token);
		store(SECRET_KEY, secrets.aiImportSecret);
	}

	lock(): void {
		if (this.server) void serverLogout();
		this.token = null;
		this.aiImportSecret = null;
		this.unlocked = false;
		store(TOKEN_KEY, null);
		store(SECRET_KEY, null);
	}

	/** Checks the token against the repository, encrypts it and commits `admin.json` with it. */
	async setUp(input: { token: string; password: string; aiImportSecret?: string }): Promise<void> {
		const token = input.token.trim();
		const secrets: Secrets = {
			token,
			...(input.aiImportSecret?.trim() ? { aiImportSecret: input.aiImportSecret.trim() } : {})
		};
		await this.#publish(secrets, input.password, 'set up editing');
		this.#open(secrets);
		this.configured = true;
	}

	async changePassword(current: string, next: string): Promise<void> {
		const blob = await this.fetchBlob();
		if (!blob) throw new NotSetUpError();
		const secrets = await decryptSecrets(blob, current);
		await this.#publish(secrets, next, 'change the editing password');
	}

	/** A blank token or secret keeps the one already stored. */
	async replaceSecrets(
		password: string,
		input: { token?: string; aiImportSecret?: string }
	): Promise<void> {
		const blob = await this.fetchBlob();
		const previous = blob ? await decryptSecrets(blob, password) : undefined;
		const token = input.token?.trim() || previous?.token;
		if (!token) throw new Error('Paste the GitHub token.');
		const secrets: Secrets = {
			...previous,
			token,
			...(input.aiImportSecret?.trim() ? { aiImportSecret: input.aiImportSecret.trim() } : {})
		};
		await this.#publish(secrets, password, 'replace the editing secrets');
		this.#open(secrets);
	}

	async #publish(secrets: Secrets, password: string, what: string): Promise<void> {
		if (password.length < MIN_PASSWORD) {
			throw new Error(`The password needs at least ${MIN_PASSWORD} characters.`);
		}
		const client = new GitHubClient(secrets.token);
		await client.verifyPush(adminRepo);
		const blob = await encryptSecrets(secrets, password);
		await client.commit(
			adminRepo,
			[{ path: BLOB_PATH, content: `${JSON.stringify(blob, null, 2)}\n` }],
			`chore(admin): ${what}`
		);
	}
}

export const admin = new AdminSession();
