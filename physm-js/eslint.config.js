import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';

export default [
  { ignores: ['dist/**', 'coverage/**'] },
  js.configs.recommended,

  {
    files: ['**/*.{js,jsx,mjs,ts,tsx}'],
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
      'react-refresh/only-export-components': [
        'warn',
        { allowConstantExport: true },
      ],
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
  // Scoped to TypeScript, so the recommended TS rules do not promote the
  // pre-existing `.js` warnings above into errors -- `tseslint`'s rules carry no
  // `files` of their own, so without the wrapper its `no-unused-vars` would
  // apply to `.js` at `error` severity.
  ...tseslint.config({
    files: ['**/*.ts', '**/*.tsx'],
    extends: [...tseslint.configs.recommended],
    rules: {
      // The base rule cannot see type-only usage; the TypeScript-aware one can.
      'no-unused-vars': 'off',
      // No `varsIgnorePattern` here, unlike the base rule above. That pattern
      // exempts every capitalised binding -- which is every type, class and
      // component in the codebase -- so under it an unused import of one is
      // invisible, and `noUnusedLocals` is off too. It earns its keep only for
      // the base rule, which cannot see a binding used in JSX; this one can.
      '@typescript-eslint/no-unused-vars': [
        'warn',
        { argsIgnorePattern: '^_' },
      ],
    },
  }),

  {
    files: [
      '**/*.test.{js,jsx,ts,tsx}',
      'src/setupTests.js',
      'src/testutils.js',
    ],
    languageOptions: { globals: { ...globals.vitest } },
  },
];
