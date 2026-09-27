/**
 * Strict domain types for Forq's core loop. This directory is checked with
 * `tsc --noEmit -p tsconfig.strict.json` in CI: plan → shop → cook → learn.
 * New strictly-typed modules live here and are re-exported to plain JS via
 * JSDoc `import()` types, so the overwhelmingly-JS codebase gains real
 * checking without a mass rewrite. Keep this directory dependency-free:
 * types and pure helpers only, never React or server imports.
 */
export {};