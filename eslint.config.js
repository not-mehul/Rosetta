import js from '@eslint/js';
import svelte from 'eslint-plugin-svelte';
import globals from 'globals';
import tseslint from 'typescript-eslint';
import svelteConfig from './svelte.config.js';

export default tseslint.config(
  { ignores: ['public/pdfjs/', 'dist/', 'android/', 'ios/', 'node_modules/', 'test-results/', 'playwright-report/', 'design/'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  ...svelte.configs.recommended,
  {
    languageOptions: {
      globals: { ...globals.browser, __APP_VERSION__: 'readonly' },
    },
  },
  {
    files: ['**/*.svelte', '**/*.svelte.ts'],
    languageOptions: {
      parserOptions: {
        parser: tseslint.parser,
        extraFileExtensions: ['.svelte'],
        svelteConfig,
      },
    },
  },
  {
    files: ['scripts/**', '*.config.{js,ts}', 'tests/e2e/**', 'tests/fixtures/**'],
    languageOptions: {
      globals: { ...globals.node },
    },
  },
);
