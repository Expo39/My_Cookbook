import { createSource } from '$lib/data';

export const prerender = true;

export const load = async ({ fetch }) => ({ index: await createSource(fetch).getIndex() });
