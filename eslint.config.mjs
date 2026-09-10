import next from 'eslint-config-next/core-web-vitals';

export default [
  {
    ignores: ['.next/**', 'node_modules/**', 'playwright-report/**', 'test-results/**', 'coverage/**'],
  },
  ...next,
  {
    rules: {
      // The codebase is plain JSX with deliberate inline-style theming.
      'react/no-unescaped-entities': 'off',
      // eslint-config-next 16 ships eslint-plugin-react-hooks v7, whose new
      // rules encode the React Compiler's constraints (immutability, ref
      // writes, setState-in-effect, memo preservation, simple dep arrays).
      // This is a deliberate plain-React 18 codebase: effects sync state
      // after reads, callbacks mutate refs, memo arrays are broad on
      // purpose. The compiler migration is real work — until it happens
      // these stay off so the signal that matters isn't buried in noise.
      // rules-of-hooks and exhaustive-deps remain: those catch actual bugs.
      'react-hooks/set-state-in-effect': 'off',
      'react-hooks/set-state-in-render': 'off',
      'react-hooks/purity': 'off',
      'react-hooks/immutability': 'off',
      'react-hooks/refs': 'off',
      'react-hooks/static-components': 'off',
      'react-hooks/globals': 'off',
      'react-hooks/gating': 'off',
      'react-hooks/use-memo': 'off',
      'react-hooks/void-use-memo': 'off',
      'react-hooks/preserve-manual-memoization': 'off',
      'react-hooks/incompatible-library': 'off',
      'react-hooks/error-boundaries': 'off',
      'react-hooks/unsupported-syntax': 'off',
      'react-hooks/config': 'off',
      'react-hooks/exhaustive-deps': 'warn',
    },
  },
];
