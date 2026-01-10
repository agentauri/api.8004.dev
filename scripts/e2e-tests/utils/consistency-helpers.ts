/**
 * Consistency Test Helpers
 * Assertions for comparing data between SDK and API responses
 */

import { AssertionError } from '../test-runner';
import type { Agent, ApiResponse } from './api-client';

/**
 * SDK Agent type (from agent0-sdk)
 */
export interface SDKAgent {
  agentId: string;
  name: string;
  description?: string;
  image?: string;
  active: boolean;
  mcp: boolean;
  a2a: boolean;
  x402support: boolean;
  chainId?: number;
  tokenId?: string;
  operators?: string[];
  ens?: string;
  did?: string;
  walletAddress?: string;
}

/**
 * Tolerance for count comparisons (5% difference allowed)
 */
const COUNT_TOLERANCE = 0.05;

/**
 * Minimum overlap required for ID comparison (90%)
 */
const ID_OVERLAP_THRESHOLD = 0.9;

/**
 * Assert that two counts are approximately equal
 */
export function assertApproximateCount(
  actual: number,
  expected: number,
  tolerance: number = COUNT_TOLERANCE
): void {
  if (expected === 0 && actual === 0) return;

  const diff = Math.abs(actual - expected);
  const maxDiff = Math.max(expected, actual) * tolerance;

  if (diff > maxDiff && diff > 1) {
    throw new AssertionError(
      `Count mismatch: ${actual} vs ${expected} (diff: ${diff}, tolerance: ${maxDiff.toFixed(1)})`,
      String(expected),
      String(actual)
    );
  }
}

/**
 * Assert that two sets have sufficient overlap
 */
export function assertSetOverlap(
  set1: Set<string>,
  set2: Set<string>,
  minOverlap: number = ID_OVERLAP_THRESHOLD
): void {
  if (set1.size === 0 && set2.size === 0) return;

  const intersection = new Set([...set1].filter(x => set2.has(x)));
  const union = new Set([...set1, ...set2]);

  const overlapRatio = union.size > 0 ? intersection.size / union.size : 0;

  if (overlapRatio < minOverlap) {
    throw new AssertionError(
      `Set overlap too low: ${(overlapRatio * 100).toFixed(1)}% (min: ${(minOverlap * 100).toFixed(1)}%)`,
      `>= ${(minOverlap * 100).toFixed(1)}% overlap`,
      `${(overlapRatio * 100).toFixed(1)}% overlap`
    );
  }
}

/**
 * Assert field equality between API agent and SDK agent
 */
export function assertFieldsMatch(
  apiAgent: Agent,
  sdkAgent: SDKAgent,
  fields: Array<'name' | 'active' | 'hasMcp' | 'hasA2a' | 'x402Support'>
): void {
  const fieldMappings: Record<string, [keyof Agent, keyof SDKAgent]> = {
    name: ['name', 'name'],
    active: ['active', 'active'],
    hasMcp: ['hasMcp', 'mcp'],
    hasA2a: ['hasA2a', 'a2a'],
    x402Support: ['x402Support', 'x402support'],
  };

  for (const field of fields) {
    const [apiField, sdkField] = fieldMappings[field];
    const apiValue = apiAgent[apiField];
    const sdkValue = sdkAgent[sdkField];

    // Skip undefined values
    if (apiValue === undefined || sdkValue === undefined) continue;

    if (apiValue !== sdkValue) {
      throw new AssertionError(
        `Field mismatch for "${field}" on agent ${apiAgent.id}`,
        String(sdkValue),
        String(apiValue)
      );
    }
  }
}

/**
 * Assert data consistency between API and SDK results
 */
export function assertDataConsistency(
  apiAgents: Agent[],
  sdkAgents: SDKAgent[]
): void {
  // 1. Check count consistency (with tolerance)
  assertApproximateCount(apiAgents.length, sdkAgents.length);

  // 2. Check ID overlap
  const apiIds = new Set(apiAgents.map(a => a.id));
  const sdkIds = new Set(sdkAgents.map(a => a.agentId));
  assertSetOverlap(apiIds, sdkIds);

  // 3. Check field values for matching agents
  for (const apiAgent of apiAgents) {
    const sdkAgent = sdkAgents.find(s => s.agentId === apiAgent.id);
    if (sdkAgent) {
      assertFieldsMatch(apiAgent, sdkAgent, ['name', 'hasMcp', 'hasA2a']);
    }
  }
}

/**
 * Assert that pagination returns no duplicates across pages
 */
export function assertPaginationNoDuplicates(pages: Agent[][]): void {
  const allIds = new Set<string>();
  const duplicates: string[] = [];

  for (const page of pages) {
    for (const agent of page) {
      if (allIds.has(agent.id)) {
        duplicates.push(agent.id);
      }
      allIds.add(agent.id);
    }
  }

  if (duplicates.length > 0) {
    throw new AssertionError(
      `Found ${duplicates.length} duplicate(s) across pages`,
      'no duplicates',
      `duplicates: [${duplicates.slice(0, 5).join(', ')}${duplicates.length > 5 ? '...' : ''}]`
    );
  }
}

/**
 * Assert that total count is consistent across paginated requests
 */
export function assertTotalConsistent(
  responses: Array<{ meta?: { total?: number } }>
): void {
  const totals = responses
    .map(r => r.meta?.total)
    .filter((t): t is number => t !== undefined);

  if (totals.length < 2) return;

  const first = totals[0];
  for (let i = 1; i < totals.length; i++) {
    if (totals[i] !== first) {
      throw new AssertionError(
        `Total count inconsistent across requests`,
        String(first),
        String(totals[i])
      );
    }
  }
}

/**
 * Assert that filter is correctly applied
 */
export function assertFilterApplied<T>(
  items: T[],
  filterFn: (item: T) => boolean,
  filterDescription: string
): void {
  const failing = items.filter(item => !filterFn(item));

  if (failing.length > 0) {
    throw new AssertionError(
      `Filter not applied correctly: ${filterDescription}`,
      `all items match filter`,
      `${failing.length}/${items.length} items don't match`
    );
  }
}

/**
 * Assert that sort order is maintained
 */
export function assertSortOrder<T>(
  items: T[],
  getValue: (item: T) => number | string | undefined,
  order: 'asc' | 'desc'
): void {
  if (items.length < 2) return;

  for (let i = 1; i < items.length; i++) {
    const prev = getValue(items[i - 1]);
    const curr = getValue(items[i]);

    if (prev === undefined || curr === undefined) continue;

    const comparison = typeof prev === 'string' && typeof curr === 'string'
      ? prev.localeCompare(curr, undefined, { sensitivity: 'base' })
      : (prev as number) - (curr as number);

    const isValid = order === 'asc' ? comparison <= 0 : comparison >= 0;

    if (!isValid) {
      throw new AssertionError(
        `Sort order violated at index ${i}`,
        `${order === 'asc' ? 'ascending' : 'descending'} order`,
        `${JSON.stringify(prev)} vs ${JSON.stringify(curr)}`
      );
    }
  }
}

/**
 * Assert that search mode is as expected
 */
export function assertExpectedSearchMode<T>(
  response: ApiResponse<T>,
  expectedMode: 'vector' | 'fallback'
): void {
  const actualMode = response.meta?.searchMode;

  if (actualMode !== expectedMode) {
    throw new AssertionError(
      `Unexpected search mode`,
      expectedMode,
      actualMode || 'undefined'
    );
  }
}

/**
 * Compare two agent lists and return differences
 */
export function compareAgentLists(
  list1: Agent[],
  list2: Agent[],
  label1: string,
  label2: string
): { onlyIn1: string[]; onlyIn2: string[]; common: string[] } {
  const ids1 = new Set(list1.map(a => a.id));
  const ids2 = new Set(list2.map(a => a.id));

  const onlyIn1 = [...ids1].filter(id => !ids2.has(id));
  const onlyIn2 = [...ids2].filter(id => !ids1.has(id));
  const common = [...ids1].filter(id => ids2.has(id));

  return { onlyIn1, onlyIn2, common };
}

/**
 * Configuration for test chains and filters
 */
export const TEST_CONFIG = {
  SUPPORTED_CHAINS: [11155111, 84532, 80002, 59141, 296, 998, 1351057110],
  KNOWN_SKILLS: ['natural_language_processing', 'data_analysis', 'code_generation'],
  KNOWN_DOMAINS: ['technology', 'finance', 'healthcare'],
  BOOLEAN_FILTERS: ['mcp', 'a2a', 'x402', 'active', 'hasRegistrationFile'] as const,
  SORT_FIELDS: ['name', 'createdAt', 'reputation', 'relevance'] as const,
  SORT_ORDERS: ['asc', 'desc'] as const,
};
