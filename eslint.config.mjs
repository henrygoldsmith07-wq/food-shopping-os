import { FlatCompat } from '@eslint/eslintrc';

const compat = new FlatCompat({ baseDirectory: import.meta.dirname });

export default [
  {
    ignores: ['.next/**', 'node_modules/**', 'playwright-report/**', 'test-results/**', 'coverage/**'],
  },
  ...compat.extends('next/core-web-vitals'),
  {
    rules: {
      // The codebase is plain JSX with deliberate inline-style theming.
      'react/no-unescaped-entities': 'off',
    },
  },
];
