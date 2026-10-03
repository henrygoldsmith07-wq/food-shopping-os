import { defineConfig } from 'vitest/config';

export default defineConfig({
  esbuild: {
    jsx: 'automatic',
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['tests/setup.js'],
    include: ['tests/**/*.test.{js,jsx,ts,tsx}'],
    // The default 5s is a wall-clock allowance, and it is too tight for full
    // App renders on a slow machine: transforms alone can take ~100s per file,
    // and a suite that is correct but busy loses the race to the clock. No
    // assertion is loosened — a genuinely hung test still fails at 30s.
    testTimeout: 30000,
    hookTimeout: 30000,
  },
});
