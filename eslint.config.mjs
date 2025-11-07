import eslint from '@eslint/js';
import { globalIgnores } from 'eslint/config';
import jsdoc from 'eslint-plugin-jsdoc';
import nodePlugin from 'eslint-plugin-n';
import eslintPluginPrettierRecommended from 'eslint-plugin-prettier/recommended';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
	globalIgnores(['**/coverage/']),
	eslint.configs.recommended,
	nodePlugin.configs['flat/recommended-script'],
	eslintPluginPrettierRecommended,
	jsdoc.configs['flat/contents-typescript-error'],
	jsdoc.configs['flat/logical-typescript-error'],
	{
		languageOptions: {
			globals: {
				...globals.node,
			},
		},

		rules: {
			'no-underscore-dangle': 'off',
			'no-mixed-requires': 'off',
			'new-cap': 'off',
			'no-path-concat': 'off',
			'no-shadow': 'warn',
			'no-array-constructor': 'error',
			'no-caller': 'error',
			'no-eval': 'error',
			'no-extend-native': 'error',
			'no-extra-bind': 'error',
			'no-with': 'error',
			'no-loop-func': 'error',
			'no-multi-str': 'error',
			'no-new-func': 'error',
			'no-new-object': 'error',
			'no-return-assign': 'error',
			'no-sequences': 'error',
			'no-shadow-restricted-names': 'error',
			'no-unused-expressions': 'error',
			'no-use-before-define': 'off',
			'no-new': 'off',

			'dot-notation': [
				'error',
				{
					allowKeywords: true,
				},
			],

			eqeqeq: 'error',
			'new-parens': 'error',
			strict: ['error', 'global'],
			yoda: 'error',
			'object-shorthand': 'error',
			'no-var': 'error',
			'prefer-const': 'error',
			'prefer-arrow-callback': 'error',

			'arrow-body-style': [
				'error',
				'as-needed',
				{
					requireReturnForObjectLiteral: true,
				},
			],

			'jsdoc/informative-docs': 'off',
		},
	},
	{
		files: ['**/*.js'],

		rules: {
			'jsdoc/no-types': 'off',
		},
	},
	{
		files: ['test/**/*.js'],

		languageOptions: {
			globals: {
				...globals.jest,
			},
		},

		rules: {
			'no-console': 'off',
			'no-unused-vars': 'off',
			'no-shadow': 'off',
			'no-unused-expressions': 'off',
			'n/no-unsupported-features/node-builtins': 'off',
		},
	},
	{
		files: ['example/**/*.js', 'benchmarks/**/*.js'],

		rules: {
			'no-console': 'off',
		},
	},
	{
		files: ['**/*.ts'],

		extends: [tseslint.configs.recommended],

		rules: {
			'no-shadow': 'off',
			'@typescript-eslint/no-shadow': 'warn',
			'n/no-unsupported-features/es-syntax': 'off',
		},
	},
	{
		files: ['**/*.d.ts'],

		rules: {
			'@typescript-eslint/no-explicit-any': 'off',
			'@typescript-eslint/no-unused-vars': 'off',
		},
	},
	{
		files: ['**/*.mjs'],

		languageOptions: {
			sourceType: 'module',
		},
	},
);
