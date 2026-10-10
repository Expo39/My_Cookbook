import type { RepoRef } from './github';

interface AdminConfig {
	admin?: { repo?: string; branch?: string };
}

const settings = (__SITE_CONFIG__ as AdminConfig).admin;

/** The repository the editor commits to; `cookbook.config.json` sets it. */
export const adminRepo: RepoRef = {
	repo: settings?.repo ?? 'Expo39/My_Cookbook',
	branch: settings?.branch ?? 'main'
};

/** `static` builds edit through GitHub; `api` and `server` builds use the self-hosted server. */
export const serverMode = (backend: string = __BACKEND__): boolean =>
	backend === 'api' || backend === 'server';
