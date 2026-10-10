import js from '@eslint/js';
import prettier from 'eslint-config-prettier';
import svelte from 'eslint-plugin-svelte';
import globals from 'globals';
import ts from 'typescript-eslint';

export default ts.config(
	{
		ignores: [
			'build/',
			'.svelte-kit/',
			'src/lib/wasm/',
			'src/lib/types/recipe.ts',
			'static/data/',
			'playwright-report/',
			'test-results/'
		]
	},
	js.configs.recommended,
	...ts.configs.recommended,
	...svelte.configs['flat/recommended'],
	prettier,
	...svelte.configs['flat/prettier'],
	{
		languageOptions: { globals: { ...globals.browser, ...globals.node } }
	},
	{
		files: ['**/*.svelte'],
		languageOptions: { parserOptions: { parser: ts.parser } }
	},
	{
		files: ['**/*.svelte.ts'],
		languageOptions: { parser: ts.parser }
	},
	{
		// Every internal link is built by $lib/links, which calls resolve().
		files: ['**/*.svelte'],
		rules: {
			'svelte/no-navigation-without-resolve': [
				'error',
				{ ignoreLinks: true, ignoreReplaceState: true }
			]
		}
	}
);
