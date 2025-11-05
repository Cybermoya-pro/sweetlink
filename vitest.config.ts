import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const rootDirectory = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  test: {
    include: ['tests/**/*.{test,spec}.{ts,tsx,js}'],
    environment: 'node',
    root: rootDirectory,
    globals: true,
    deps: {
      inline: [/^@sweetlink\/shared/],
    },
  },
  resolve: {
    alias: {
      '@sweetlink/shared': path.resolve(rootDirectory, 'shared/src/index.ts'),
      '@sweetlink/shared/node': path.resolve(rootDirectory, 'shared/src/node.ts'),
      '@sweetlink/shared/env': path.resolve(rootDirectory, 'shared/src/env.ts'),
    },
  },
});
