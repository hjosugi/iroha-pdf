import { fileURLToPath } from 'node:url';

import { defineConfig } from 'vitest/config';

/**
 * Two test environments, because there are two kinds of thing to check here and
 * they want different setups.
 *
 * `src/**\/*.test.ts` is logic — the database against a real SQLite engine, the
 * annotation geometry, the flatten policy. It runs in Node with no DOM, which is
 * what `test-setup.ts` explains.
 *
 * `src/**\/*.test.tsx` renders a screen. `react-native` is aliased to
 * `react-native-web`, which this app already ships as a dependency for its web
 * build, so a `View` becomes a `div` and `@testing-library/react` can query it.
 * That is not React Native, and it is not a substitute for #60 — it exercises the
 * component's own decisions (which branch renders, what a failure does to the
 * screen, what a control is labelled), not the platform underneath them.
 */
export default defineConfig({
  resolve: {
    alias: [
      { find: /^react-native$/, replacement: 'react-native-web' },
      {
        find: /^@\/(.*)$/,
        replacement: `${fileURLToPath(new URL('./src/', import.meta.url))}$1`,
      },
    ],
  },
  test: {
    projects: [
      {
        extends: true,
        test: {
          name: 'logic',
          include: ['src/**/*.test.ts'],
          setupFiles: ['./test-setup.ts'],
        },
      },
      {
        extends: true,
        test: {
          name: 'screens',
          include: ['src/**/*.test.tsx'],
          environment: 'happy-dom',
          setupFiles: ['./test-setup.screens.ts'],
        },
      },
    ],
  },
});
