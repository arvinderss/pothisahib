// @ts-check
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import globals from 'globals';

/**
 * Project-wide rule: Unicode normalisation is FORBIDDEN outside the single
 * sanctioned module packages/gurmukhi/src/normalize.ts.  See docs/PROJECT_PRINCIPLES.md
 * (rules 2 and 3) and docs/RISK_REGISTER.md.  scripts/check-no-normalize.mjs enforces
 * the same rule outside the linter so it cannot be silenced with a disable comment.
 */
const NO_NORMALIZE = {
  selector: "CallExpression[callee.property.name='normalize']",
  message:
    'Unicode normalisation is forbidden outside packages/gurmukhi/src/normalize.ts. ' +
    'Source and accepted Gurbani must be stored and compared byte-exactly.',
};

export default tseslint.config(
  { ignores: ['**/node_modules/**', '**/dist/**', '**/coverage/**'] },
  js.configs.recommended,
  ...tseslint.configs.strict,
  {
    files: ['**/*.ts', '**/*.tsx', '**/*.mts', '**/*.js', '**/*.mjs'],
    languageOptions: { globals: { ...globals.node } },
    rules: {
      'no-restricted-syntax': ['error', NO_NORMALIZE],
      '@typescript-eslint/explicit-module-boundary-types': 'error',
      '@typescript-eslint/no-non-null-assertion': 'error',
    },
  },
  {
    files: ['packages/gurmukhi/src/normalize.ts'],
    rules: { 'no-restricted-syntax': 'off' },
  },
);
