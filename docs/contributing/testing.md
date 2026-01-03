# Testing Guide

Comprehensive guide to testing the 8004 API.

## Overview

The project uses:
- **Vitest** for unit and integration tests
- **Custom test runner** for E2E tests
- **70% branch coverage minimum** (CI enforced)

## Running Tests

### Unit Tests

```bash
# Run all tests
pnpm run test

# Watch mode
pnpm run test:watch

# With coverage
pnpm run test:coverage
```

### E2E Tests

```bash
# Run against production
API_KEY="your-api-key" pnpm run test:e2e

# Run specific suite
API_KEY="..." pnpm run test:e2e -- --filter=search

# Verbose output
API_KEY="..." pnpm run test:e2e -- --verbose

# JSON output (for CI)
API_KEY="..." pnpm run test:e2e -- --json
```

## Test Structure

```
test/
├── unit/
│   ├── services/
│   │   ├── cache.test.ts
│   │   ├── classifier.test.ts
│   │   └── search.test.ts
│   └── routes/
│       ├── agents.test.ts
│       └── search.test.ts
├── integration/
│   └── api.test.ts
└── e2e/
    └── (see scripts/e2e-tests/)

scripts/e2e-tests/
├── run-tests.ts         # Entry point
├── test-runner.ts       # Custom framework
├── utils/
│   ├── api-client.ts    # HTTP client
│   └── assertions.ts    # Domain assertions
└── tests/
    ├── health.ts
    ├── agents-basic.ts
    ├── agents-boolean.ts
    ├── search.ts
    └── ...
```

## Writing Unit Tests

### Basic Test

```typescript
import { describe, it, expect } from 'vitest';
import { parseAgentId } from '@/lib/utils/validation';

describe('parseAgentId', () => {
  it('should parse valid agent ID', () => {
    const result = parseAgentId('11155111:1234');
    expect(result).toEqual({
      chainId: 11155111,
      tokenId: '1234'
    });
  });

  it('should throw on invalid format', () => {
    expect(() => parseAgentId('invalid')).toThrow();
  });
});
```

### Testing Services

```typescript
import { describe, it, expect, vi } from 'vitest';
import { createCacheService } from '@/services/cache';

describe('CacheService', () => {
  it('should cache and retrieve values', async () => {
    const mockKV = {
      get: vi.fn().mockResolvedValue(null),
      put: vi.fn().mockResolvedValue(undefined),
    };

    const cache = createCacheService(mockKV, 300);
    await cache.set('key', { data: 'test' });

    expect(mockKV.put).toHaveBeenCalledWith(
      'key',
      JSON.stringify({ data: 'test' }),
      { expirationTtl: 300 }
    );
  });
});
```

### Testing Routes

```typescript
import { describe, it, expect } from 'vitest';
import { testClient } from 'hono/testing';
import { app } from '@/index';

describe('GET /api/v1/health', () => {
  it('should return healthy status', async () => {
    const client = testClient(app);
    const res = await client['/api/v1/health'].$get();

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe('ok');
  });
});
```

## Writing E2E Tests

### Test Structure

```typescript
// scripts/e2e-tests/tests/my-test.ts
import { TestSuite, TestCase } from '../test-runner';
import { ApiClient } from '../utils/api-client';

export const myTests: TestSuite = {
  name: 'my-tests',
  tests: [
    {
      name: 'should do something',
      fn: async (client: ApiClient) => {
        const response = await client.get('/api/v1/agents?limit=5');

        if (!response.success) {
          throw new Error(`Failed: ${response.error}`);
        }

        if (response.data.length === 0) {
          throw new Error('Expected agents');
        }
      }
    }
  ]
};
```

### Using Assertions

```typescript
import { assertSuccess, assertHasData, assertPagination } from '../utils/assertions';

{
  name: 'should paginate correctly',
  fn: async (client) => {
    const response = await client.get('/api/v1/agents?limit=10&page=1');

    assertSuccess(response);
    assertHasData(response, 10);
    assertPagination(response, { hasMore: true });
  }
}
```

## E2E Test Suites

| Suite | Description | Tests |
|-------|-------------|-------|
| health | Health check | ~2 |
| basic | Basic agent filters | ~11 |
| boolean | AND/OR filter modes | ~8 |
| oasf | Skills/domains filtering | ~6 |
| sorting | Sort and order | ~8 |
| search | Semantic search | ~25 |
| fallback | Vector → SDK fallback | ~27 |
| pagination | Cursor/offset pagination | ~12 |
| reputation | Reputation filters | ~5 |
| advanced | Complex combinations | ~5 |
| edge | Edge cases | ~12 |
| error | Error handling | ~6 |
| detail | Agent detail | ~9 |
| taxonomy | OASF taxonomy | ~5 |
| security | SQL injection, XSS | ~7 |
| consistency | SDK vs Search | ~4 |

## Mocking

### Mock Services

```typescript
// src/services/mock/mock-sdk.ts
export const createMockSDK = () => ({
  getAgents: vi.fn().mockResolvedValue({
    items: [mockAgent],
    nextCursor: null
  }),
  getAgent: vi.fn().mockResolvedValue(mockAgent),
});
```

### Mock Environment

```typescript
const mockEnv = {
  DB: createMockD1(),
  CACHE: createMockKV(),
  CLASSIFICATION_QUEUE: createMockQueue(),
  GOOGLE_AI_API_KEY: 'mock-key',
};
```

## Coverage Requirements

**Minimum 70% branch coverage is required.**

```bash
# Check coverage
pnpm run test:coverage

# View HTML report
open coverage/index.html
```

Coverage is enforced in CI - PRs will fail below threshold.

## CI Integration

Tests run automatically on:
- Push to `main`
- Pull requests

```yaml
# .github/workflows/ci.yml
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v2
      - run: pnpm install
      - run: pnpm run test:coverage
```

## Debugging Tests

### Vitest UI

```bash
pnpm run test:ui
```

### Debug Output

```typescript
it('should debug', async () => {
  const result = await service.getData();
  console.log('Result:', JSON.stringify(result, null, 2));
  expect(result).toBeDefined();
});
```

### E2E Verbose Mode

```bash
API_KEY="..." pnpm run test:e2e -- --verbose
```

## Best Practices

### Test Isolation

Each test should:
- Set up its own state
- Clean up after itself
- Not depend on other tests

### Descriptive Names

```typescript
// Good
it('should return 404 when agent does not exist', ...);

// Bad
it('should work', ...);
```

### Test Edge Cases

- Empty inputs
- Invalid formats
- Rate limits
- Network errors
- Cache misses

### Use Fixtures

```typescript
// test/fixtures/agents.ts
export const mockAgent = {
  id: '11155111:1234',
  name: 'Test Agent',
  // ...
};
```

## Related

- [Contributing Guide](/contributing/)
- [Architecture](/contributing/architecture)
- [Deployment](/contributing/deployment)
