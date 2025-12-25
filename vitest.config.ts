import path from 'node:path';
import { defineWorkersConfig } from '@cloudflare/vitest-pool-workers/config';

// On macOS, reduce parallelism to avoid ephemeral port exhaustion
// CI runs on Linux and doesn't have this issue
const isMacOS = process.platform === 'darwin';

export default defineWorkersConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      'agent0-sdk': path.resolve(__dirname, './test/mocks/agent0-sdk.ts'),
    },
  },
  test: {
    globals: true,
    include: ['test/**/*.test.ts'],
    setupFiles: ['./test/setup.ts'],
    // Reduce parallelism to avoid ephemeral port exhaustion on macOS
    fileParallelism: !isMacOS,
    poolOptions: {
      workers: {
        singleWorker: isMacOS,
        wrangler: {
          configPath: './wrangler.toml',
        },
        miniflare: {
          kvNamespaces: ['CACHE'],
          d1Databases: ['DB'],
          queueProducers: {
            CLASSIFICATION_QUEUE: {
              queueName: 'test-classification-queue',
            },
          },
        },
      },
    },
    coverage: {
      provider: 'istanbul',
      reporter: ['text', 'json', 'json-summary', 'html', 'lcov'],
      reportsDirectory: './coverage',
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.d.ts', 'src/types/**/*.ts', 'src/services/mock/**/*.ts'],
      thresholds: {
        // Note: 100% coverage is the goal, but some code paths are difficult
        // to test in Cloudflare Workers environment:
        // - Queue consumer (index.ts:68-150) - requires complex mocking
        // - Classifier integration - external API providers
        // - SDK error paths - would require failing RPC connections
        // - Search fallback paths - complex conditional logic
        // - Similar agents endpoint, health score, warnings - new features pending tests
        // - MCP OAuth validation paths - optional auth flow
        // - OAuth authorize/token routes - complex integration tests pending
        lines: 80,
        functions: 80,
        branches: 64,
        statements: 79,
      },
    },
  },
});
