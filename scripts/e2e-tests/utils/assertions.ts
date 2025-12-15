/**
 * Custom assertions for E2E tests
 * Domain-specific validation helpers
 */

import { AssertionError } from '../test-runner';
import type { Agent, ApiResponse } from './api-client';

/**
 * Assert that an API response is successful
 */
export function assertSuccess<T>(
  json: ApiResponse<T>
): asserts json is ApiResponse<T> & { success: true; data: T } {
  if (!json.success) {
    throw new AssertionError(
      `Expected successful response but got error: ${json.error}`,
      'success: true',
      `success: false, error: ${json.error}`
    );
  }
  if (json.data === undefined) {
    throw new AssertionError('Expected data field in response', 'data: [...]', 'data: undefined');
  }
}

/**
 * Assert that all items in array match a predicate
 */
export function assertAllMatch<T>(
  items: T[],
  predicate: (item: T) => boolean,
  description: string
): void {
  const failingItems = items.filter((item) => !predicate(item));

  if (failingItems.length > 0) {
    throw new AssertionError(
      `${failingItems.length}/${items.length} items failed: ${description}`,
      `all items match: ${description}`,
      `${failingItems.length} items failed`
    );
  }
}

/**
 * Assert that at least one item matches a predicate
 */
export function assertSomeMatch<T>(
  items: T[],
  predicate: (item: T) => boolean,
  description: string
): void {
  const matchingItems = items.filter(predicate);

  if (matchingItems.length === 0) {
    throw new AssertionError(
      `No items matched: ${description}`,
      `at least one item matches: ${description}`,
      '0 items matched'
    );
  }
}

/**
 * Assert that items are sorted correctly
 */
export function assertSorted<T>(
  items: T[],
  key: keyof T | ((item: T) => number | string),
  order: 'asc' | 'desc'
): void {
  if (items.length < 2) return;

  const getValue = typeof key === 'function' ? key : (item: T) => item[key];

  for (let i = 1; i < items.length; i++) {
    const prev = getValue(items[i - 1]);
    const curr = getValue(items[i]);

    if (prev === undefined || prev === null || curr === undefined || curr === null) {
      continue; // Skip undefined/null values
    }

    const isValid = order === 'asc' ? prev <= curr : prev >= curr;

    if (!isValid) {
      throw new AssertionError(
        `Items not sorted correctly at index ${i}`,
        `${order === 'asc' ? 'ascending' : 'descending'} order`,
        `${JSON.stringify(prev)} ${order === 'asc' ? '>' : '<'} ${JSON.stringify(curr)}`
      );
    }
  }
}

/**
 * Assert no duplicate values for a key
 */
export function assertNoDuplicates<T>(items: T[], key: keyof T | ((item: T) => unknown)): void {
  const getValue = typeof key === 'function' ? key : (item: T) => item[key];
  const seen = new Set<unknown>();
  const duplicates: unknown[] = [];

  for (const item of items) {
    const value = getValue(item);
    if (seen.has(value)) {
      duplicates.push(value);
    }
    seen.add(value);
  }

  if (duplicates.length > 0) {
    throw new AssertionError(
      `Found ${duplicates.length} duplicate(s)`,
      'no duplicates',
      `duplicates: ${JSON.stringify(duplicates)}`
    );
  }
}

/**
 * Assert that agents have the expected chain ID
 */
export function assertChainId(agents: Agent[], expectedChainId: number): void {
  assertAllMatch(agents, (a) => a.chainId === expectedChainId, `chainId === ${expectedChainId}`);
}

/**
 * Assert that agents have the expected boolean flag
 */
export function assertBooleanFlag(
  agents: Agent[],
  flag: 'hasMcp' | 'hasA2a' | 'x402Support' | 'active',
  expected: boolean
): void {
  assertAllMatch(agents, (a) => a[flag] === expected, `${flag} === ${expected}`);
}

/**
 * Assert that agents have a specific skill (exact match - OASF uses flat structure)
 */
export function assertHasSkill(agents: Agent[], skillSlug: string): void {
  assertAllMatch(
    agents,
    (agent) => {
      if (!agent.oasf?.skills) return false;
      return agent.oasf.skills.some((s) => s.slug === skillSlug);
    },
    `has skill "${skillSlug}"`
  );
}

/**
 * Assert that agents have a specific domain (exact match - OASF uses flat structure)
 */
export function assertHasDomain(agents: Agent[], domainSlug: string): void {
  assertAllMatch(
    agents,
    (agent) => {
      if (!agent.oasf?.domains) return false;
      return agent.oasf.domains.some((d) => d.slug === domainSlug);
    },
    `has domain "${domainSlug}"`
  );
}

/**
 * Assert that all agents have searchScore
 */
export function assertHasSearchScore(agents: Agent[]): void {
  assertAllMatch(
    agents,
    (a) => typeof a.searchScore === 'number' && a.searchScore >= 0,
    'has valid searchScore'
  );
}

/**
 * Assert that all search scores are above minimum
 */
export function assertMinSearchScore(agents: Agent[], minScore: number): void {
  assertAllMatch(
    agents,
    (a) => typeof a.searchScore === 'number' && a.searchScore >= minScore,
    `searchScore >= ${minScore}`
  );
}

/**
 * Assert response time is within limit
 */
export function assertResponseTime(duration: number, maxMs: number): void {
  if (duration > maxMs) {
    throw new AssertionError(
      `Response took ${duration}ms, exceeds ${maxMs}ms limit`,
      `<= ${maxMs}ms`,
      `${duration}ms`
    );
  }
}

/**
 * Assert HTTP status code
 */
export function assertStatus(response: Response, expected: number): void {
  if (response.status !== expected) {
    throw new AssertionError(
      `Expected status ${expected} but got ${response.status}`,
      String(expected),
      String(response.status)
    );
  }
}

/**
 * Assert response has meta with expected fields
 */
export function assertHasMeta<T>(json: ApiResponse<T>): void {
  if (!json.meta) {
    throw new AssertionError('Expected meta field in response', 'meta: {...}', 'meta: undefined');
  }
}

/**
 * Assert pagination works correctly
 */
export function assertPagination<T>(json: ApiResponse<T>): void {
  assertHasMeta(json);
  if (json.meta?.hasMore && !json.meta?.nextCursor) {
    throw new AssertionError(
      'hasMore is true but nextCursor is missing',
      'nextCursor when hasMore=true',
      'nextCursor: undefined'
    );
  }
}

/**
 * Assert that all agents have reputation within range
 */
export function assertReputationInRange(agents: Agent[], minRep?: number, maxRep?: number): void {
  // Filter only agents that have reputation data
  const withReputation = agents.filter(
    (a) => a.reputationScore !== undefined && a.reputationScore !== null
  );

  if (withReputation.length === 0 && agents.length > 0) {
    // No agents have reputation - this is OK for some queries
    return;
  }

  for (const agent of withReputation) {
    const score = agent.reputationScore!;
    if (minRep !== undefined && score < minRep) {
      throw new AssertionError(
        `Agent ${agent.id} has reputation ${score}, below minimum ${minRep}`,
        `reputationScore >= ${minRep}`,
        `reputationScore: ${score}`
      );
    }
    if (maxRep !== undefined && score > maxRep) {
      throw new AssertionError(
        `Agent ${agent.id} has reputation ${score}, above maximum ${maxRep}`,
        `reputationScore <= ${maxRep}`,
        `reputationScore: ${score}`
      );
    }
  }
}

/**
 * Assert that response is an error with optional code check
 */
export function assertErrorResponse<T>(json: ApiResponse<T>, expectedCode?: string): void {
  if (json.success) {
    throw new AssertionError(
      'Expected error response but got success',
      'success: false',
      'success: true'
    );
  }
  if (expectedCode && json.code !== expectedCode) {
    throw new AssertionError(
      `Expected error code "${expectedCode}" but got "${json.code}"`,
      expectedCode,
      json.code || 'undefined'
    );
  }
}

/**
 * Assert that agents are from specific chains
 */
export function assertChainIds(agents: Agent[], chainIds: number[]): void {
  assertAllMatch(
    agents,
    (a) => chainIds.includes(a.chainId),
    `chainId in [${chainIds.join(', ')}]`
  );
}

/**
 * Assert that search response has a specific searchMode
 */
export function assertSearchMode<T>(json: ApiResponse<T>, expected: 'vector' | 'fallback'): void {
  assertHasMeta(json);
  if (json.meta?.searchMode !== expected) {
    throw new AssertionError(
      `Expected searchMode "${expected}" but got "${json.meta?.searchMode}"`,
      expected,
      json.meta?.searchMode || 'undefined'
    );
  }
}

/**
 * Assert that search response has a valid searchMode (either vector or fallback)
 */
export function assertHasSearchMode<T>(json: ApiResponse<T>): void {
  assertHasMeta(json);
  const mode = json.meta?.searchMode;
  if (mode !== 'vector' && mode !== 'fallback') {
    throw new AssertionError(
      `Expected searchMode to be "vector" or "fallback" but got "${mode}"`,
      '"vector" | "fallback"',
      mode || 'undefined'
    );
  }
}

/**
 * Assert that all agents have matchReasons array
 */
export function assertHasMatchReasons(agents: Agent[]): void {
  assertAllMatch(
    agents,
    (a) => Array.isArray(a.matchReasons) && a.matchReasons.length > 0,
    'has matchReasons array'
  );
}

/**
 * Assert that search scores are within valid range (0-1)
 */
export function assertSearchScoreInRange(agents: Agent[]): void {
  assertAllMatch(
    agents,
    (a) => typeof a.searchScore === 'number' && a.searchScore >= 0 && a.searchScore <= 1,
    'searchScore in range [0, 1]'
  );
}

/**
 * Assert that response has byChain breakdown
 */
export function assertHasByChain<T>(json: ApiResponse<T>): void {
  assertHasMeta(json);
  if (!json.meta?.byChain || typeof json.meta.byChain !== 'object') {
    throw new AssertionError(
      'Expected byChain breakdown in meta',
      'byChain: {...}',
      'byChain: ' + JSON.stringify(json.meta?.byChain)
    );
  }
}
