import path from 'node:path';
import { defineWorkersConfig } from '@cloudflare/vitest-pool-workers/config';

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
    poolOptions: {
      workers: {
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
        lines: 85,
        functions: 85,
        branches: 70,
        statements: 85,
      },
    },
  },
});
