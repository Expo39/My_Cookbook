import { readFile } from 'node:fs/promises';
import type { EntryGenerator } from './$types';

/** Every section folder and recipe id in the built index is a page to prerender. */
export const entries: EntryGenerator = async () => {
	const index: { sections: Node[] } = JSON.parse(await readFile('static/data/index.json', 'utf8'));
	const paths: string[] = [];
	const walk = (nodes: Node[]) => {
		for (const node of nodes) {
			paths.push(node.path, ...node.recipes.map((recipe) => recipe.id));
			walk(node.sections);
		}
	};
	walk(index.sections);
	return paths.map((path) => ({ path }));
};

interface Node {
	path: string;
	recipes: { id: string }[];
	sections: Node[];
}
