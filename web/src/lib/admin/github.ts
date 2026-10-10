import { toBase64 } from './encoding';

export interface RepoRef {
	/** `owner/name`. */
	repo: string;
	branch: string;
}

/** A file to write, or `null` content to delete it. */
export interface FileChange {
	path: string;
	content: string | Uint8Array | null;
}

export class GitHubError extends Error {
	constructor(
		message: string,
		readonly status: number
	) {
		super(message);
	}
}

export interface WorkflowRun {
	id: number;
	name: string;
	status: string;
	conclusion: string | null;
	html_url: string;
}

const API = 'https://api.github.com';
const MAX_ATTEMPTS = 4;

export class GitHubClient {
	constructor(
		private readonly token: string,
		private readonly fetcher: typeof fetch = (...args) => fetch(...args)
	) {}

	async request<T>(method: string, path: string, body?: unknown): Promise<T> {
		let response: Response;
		try {
			response = await this.fetcher(`${API}${path}`, {
				method,
				headers: {
					Accept: 'application/vnd.github+json',
					Authorization: `Bearer ${this.token}`,
					'X-GitHub-Api-Version': '2022-11-28',
					...(body === undefined ? {} : { 'Content-Type': 'application/json' })
				},
				body: body === undefined ? undefined : JSON.stringify(body)
			});
		} catch {
			throw new GitHubError('GitHub could not be reached. Check the connection and try again.', 0);
		}
		if (!response.ok) {
			const detail = await response
				.json()
				.then((json: { message?: string }) => json.message)
				.catch(() => undefined);
			throw new GitHubError(explain(response.status, detail), response.status);
		}
		return response.status === 204 ? (undefined as T) : ((await response.json()) as T);
	}

	/** Resolves when the token can push to the repository. */
	async verifyPush({ repo }: RepoRef): Promise<void> {
		const info = await this.request<{ permissions?: { push?: boolean } }>('GET', `/repos/${repo}`);
		if (!info.permissions?.push) {
			throw new GitHubError(
				'That token can read the repository but not write to it. Give it Contents: read and write.',
				403
			);
		}
	}

	/** Commits every change at once and returns the commit's sha. */
	async commit(ref: RepoRef, changes: FileChange[], message: string): Promise<string> {
		const { repo, branch } = ref;
		const blobs = await Promise.all(
			changes.map(async (change) => {
				if (change.content === null) return { path: change.path, sha: null };
				const { sha } = await this.request<{ sha: string }>('POST', `/repos/${repo}/git/blobs`, {
					content: typeof change.content === 'string' ? change.content : toBase64(change.content),
					encoding: typeof change.content === 'string' ? 'utf-8' : 'base64'
				});
				return { path: change.path, sha };
			})
		);

		for (let attempt = 1; ; attempt++) {
			const head = await this.request<{ object: { sha: string } }>(
				'GET',
				`/repos/${repo}/git/ref/heads/${branch}`
			);
			const parent = await this.request<{ tree: { sha: string } }>(
				'GET',
				`/repos/${repo}/git/commits/${head.object.sha}`
			);
			const tree = await this.request<{ sha: string }>('POST', `/repos/${repo}/git/trees`, {
				base_tree: parent.tree.sha,
				tree: blobs.map(({ path, sha }) => ({ path, mode: '100644', type: 'blob', sha }))
			});
			const commit = await this.request<{ sha: string }>('POST', `/repos/${repo}/git/commits`, {
				message,
				tree: tree.sha,
				parents: [head.object.sha]
			});
			try {
				await this.request('PATCH', `/repos/${repo}/git/refs/heads/${branch}`, {
					sha: commit.sha,
					force: false
				});
				return commit.sha;
			} catch (error) {
				const moved = error instanceof GitHubError && error.status === 422;
				if (!moved || attempt >= MAX_ATTEMPTS) throw error;
			}
		}
	}

	async runs({ repo }: RepoRef, sha: string): Promise<WorkflowRun[]> {
		const found = await this.request<{ workflow_runs: WorkflowRun[] }>(
			'GET',
			`/repos/${repo}/actions/runs?head_sha=${sha}`
		);
		return found.workflow_runs;
	}
}

function explain(status: number, detail?: string): string {
	if (status === 401)
		return 'GitHub did not accept the token. It may have expired or been revoked.';
	if (status === 403) return `GitHub refused the request${detail ? `: ${detail}` : ''}.`;
	if (status === 404) {
		return 'GitHub could not find the repository. Check the token covers this repository.';
	}
	return `GitHub returned an error (${status})${detail ? `: ${detail}` : ''}.`;
}

export type BuildState =
	{ state: 'building' } | { state: 'live' } | { state: 'failed'; url: string };

/** Reads the CI and Deploy runs for a commit: the site is live once Deploy has succeeded. */
export function buildState(runs: WorkflowRun[]): BuildState {
	const failed = runs.find(
		(run) =>
			run.status === 'completed' &&
			!['success', 'skipped', 'neutral'].includes(run.conclusion ?? '')
	);
	if (failed) return { state: 'failed', url: failed.html_url };
	const deploy = runs.find((run) => run.name === 'Deploy');
	return deploy?.status === 'completed' ? { state: 'live' } : { state: 'building' };
}
