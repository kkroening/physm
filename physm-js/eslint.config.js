import js from '@eslint/js';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';

export default [
  { ignores: ['dist/**', 'coverage/**'] },
  js.configs.recommended,
  {
    files: ['**/*.{js,jsx,mjs}'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: { ...globals.browser, ...globals.node },
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
      // Restoring lint after five unlinted years surfaces ~45 unused imports that
      // predate this config. They warn rather than block, so `lint` reports a true
      // state instead of failing on debt it did not create; the react-hooks rules
      // above — the ones worth having back — stay errors.
      'no-unused-vars': ['warn', { varsIgnorePattern: '^[A-Z_]' }],
      'no-empty': 'warn',
      // Fires on `if (first || true)` in the demo scene builder — a debug override
      // that makes its condition dead. Left as-is rather than guessed at.
      'no-constant-condition': 'warn',
    },
  },
  {
    files: ['**/*.test.{js,jsx}', 'src/setupTests.js', 'src/testutils.js'],
    languageOptions: { globals: { ...globals.vitest } },
  },
];
