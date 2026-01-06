/**
 * Result Comparator for Consistency Tests
 * Compares agents from different sources and identifies differences
 */

import type { Agent } from './types';

export interface ComparisonResult {
  identical: boolean;
  differences: string[];
  matchedCount: number;
  unmatchedInA: string[];
  unmatchedInB: string[];
  fieldDifferences: Map<string, number>;
}

/**
 * Fields that should be identical across sources
 */
export const CORE_FIELDS: (keyof Agent)[] = [
  'id',
  'chainId',
  'tokenId',
  'name',
  'active',
  'hasMcp',
  'hasA2a',
  'x402Support',
];

/**
 * Fields that may differ but should exist
 */
export const OPTIONAL_FIELDS: (keyof Agent)[] = [
  'description',
  'image',
  'oasf',
  'reputationScore',
  'reputationCount',
  'operators',
  'ens',
  'did',
];

/**
 * Compare two agent arrays for consistency
 */
export function compareAgentLists(
  listA: Agent[],
  listB: Agent[],
  sourceNameA: string = 'Source A',
  sourceNameB: string = 'Source B',
  strictOrder: boolean = false
): ComparisonResult {
  const differences: string[] = [];
  const fieldDifferences = new Map<string, number>();
  const matchedCount = { value: 0 };

  // Create maps by ID
  const mapA = new Map(listA.map((a) => [a.id, a]));
  const mapB = new Map(listB.map((a) => [a.id, a]));

  // Find unmatched items
  const unmatchedInA = [...mapA.keys()].filter((id) => !mapB.has(id));
  const unmatchedInB = [...mapB.keys()].filter((id) => !mapA.has(id));

  if (unmatchedInA.length > 0) {
    differences.push(`${unmatchedInA.length} agents in ${sourceNameA} not found in ${sourceNameB}: ${unmatchedInA.slice(0, 5).join(', ')}${unmatchedInA.length > 5 ? '...' : ''}`);
  }

  if (unmatchedInB.length > 0) {
    differences.push(`${unmatchedInB.length} agents in ${sourceNameB} not found in ${sourceNameA}: ${unmatchedInB.slice(0, 5).join(', ')}${unmatchedInB.length > 5 ? '...' : ''}`);
  }

  // Compare matched agents
  for (const [id, agentA] of mapA) {
    const agentB = mapB.get(id);
    if (!agentB) continue;

    matchedCount.value++;

    // Compare core fields
    for (const field of CORE_FIELDS) {
      const valueA = agentA[field];
      const valueB = agentB[field];
      if (valueA !== valueB) {
        const count = fieldDifferences.get(field) || 0;
        fieldDifferences.set(field, count + 1);
        if (differences.length < 20) {
          differences.push(`Agent ${id}: ${field} differs - ${sourceNameA}: ${JSON.stringify(valueA)}, ${sourceNameB}: ${JSON.stringify(valueB)}`);
        }
      }
    }
  }

  // Check order if strict mode
  if (strictOrder && listA.length === listB.length && unmatchedInA.length === 0) {
    for (let i = 0; i < listA.length; i++) {
      if (listA[i].id !== listB[i].id) {
        differences.push(`Order differs at position ${i}: ${sourceNameA} has ${listA[i].id}, ${sourceNameB} has ${listB[i].id}`);
        break;
      }
    }
  }

  return {
    identical: differences.length === 0,
    differences,
    matchedCount: matchedCount.value,
    unmatchedInA,
    unmatchedInB,
    fieldDifferences,
  };
}

/**
 * Compare single agent fields
 */
export function compareAgents(
  agentA: Agent,
  agentB: Agent,
  fields: (keyof Agent)[] = CORE_FIELDS
): string[] {
  const differences: string[] = [];

  for (const field of fields) {
    const valueA = agentA[field];
    const valueB = agentB[field];

    if (field === 'oasf') {
      // Deep compare OASF
      const oasfDiff = compareOasf(agentA.oasf, agentB.oasf);
      if (oasfDiff.length > 0) {
        differences.push(...oasfDiff.map((d) => `oasf: ${d}`));
      }
    } else if (Array.isArray(valueA) && Array.isArray(valueB)) {
      // Compare arrays
      if (!arraysEqual(valueA, valueB)) {
        differences.push(`${field}: arrays differ`);
      }
    } else if (valueA !== valueB) {
      differences.push(`${field}: ${JSON.stringify(valueA)} !== ${JSON.stringify(valueB)}`);
    }
  }

  return differences;
}

/**
 * Compare OASF classification objects
 */
export function compareOasf(
  oasfA?: Agent['oasf'],
  oasfB?: Agent['oasf']
): string[] {
  const differences: string[] = [];

  if (!oasfA && !oasfB) return differences;
  if (!oasfA && oasfB) {
    differences.push('A has no oasf, B has oasf');
    return differences;
  }
  if (oasfA && !oasfB) {
    differences.push('A has oasf, B has no oasf');
    return differences;
  }

  // Compare skills
  const skillsA = new Set((oasfA?.skills || []).map((s) => s.slug));
  const skillsB = new Set((oasfB?.skills || []).map((s) => s.slug));
  const missingInB = [...skillsA].filter((s) => !skillsB.has(s));
  const extraInB = [...skillsB].filter((s) => !skillsA.has(s));

  if (missingInB.length > 0) {
    differences.push(`skills missing in B: ${missingInB.join(', ')}`);
  }
  if (extraInB.length > 0) {
    differences.push(`extra skills in B: ${extraInB.join(', ')}`);
  }

  // Compare domains
  const domainsA = new Set((oasfA?.domains || []).map((d) => d.slug));
  const domainsB = new Set((oasfB?.domains || []).map((d) => d.slug));
  const domainsMissingInB = [...domainsA].filter((d) => !domainsB.has(d));
  const domainsExtraInB = [...domainsB].filter((d) => !domainsA.has(d));

  if (domainsMissingInB.length > 0) {
    differences.push(`domains missing in B: ${domainsMissingInB.join(', ')}`);
  }
  if (domainsExtraInB.length > 0) {
    differences.push(`extra domains in B: ${domainsExtraInB.join(', ')}`);
  }

  return differences;
}

/**
 * Compare arrays (order-independent)
 */
function arraysEqual(a: unknown[], b: unknown[]): boolean {
  if (a.length !== b.length) return false;
  const sortedA = [...a].sort();
  const sortedB = [...b].sort();
  return sortedA.every((val, idx) => JSON.stringify(val) === JSON.stringify(sortedB[idx]));
}

/**
 * Check if agents satisfy a filter condition
 */
export function verifyFilter(
  agents: Agent[],
  filter: {
    field: keyof Agent;
    value: unknown;
    operator?: 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte' | 'contains' | 'in';
  }
): { passed: boolean; failedAgents: string[] } {
  const failedAgents: string[] = [];
  const { field, value, operator = 'eq' } = filter;

  for (const agent of agents) {
    const agentValue = agent[field];
    let passes = false;

    switch (operator) {
      case 'eq':
        passes = agentValue === value;
        break;
      case 'neq':
        passes = agentValue !== value;
        break;
      case 'gt':
        passes = typeof agentValue === 'number' && agentValue > (value as number);
        break;
      case 'gte':
        passes = typeof agentValue === 'number' && agentValue >= (value as number);
        break;
      case 'lt':
        passes = typeof agentValue === 'number' && agentValue < (value as number);
        break;
      case 'lte':
        passes = typeof agentValue === 'number' && agentValue <= (value as number);
        break;
      case 'contains':
        passes = Array.isArray(agentValue) && agentValue.includes(value);
        break;
      case 'in':
        passes = Array.isArray(value) && value.includes(agentValue);
        break;
    }

    if (!passes) {
      failedAgents.push(agent.id);
    }
  }

  return {
    passed: failedAgents.length === 0,
    failedAgents,
  };
}

/**
 * Verify sorting order
 */
export function verifySorting(
  agents: Agent[],
  field: keyof Agent | ((a: Agent) => number | string | undefined),
  order: 'asc' | 'desc'
): { passed: boolean; firstViolation?: { index: number; prev: unknown; curr: unknown } } {
  if (agents.length < 2) return { passed: true };

  const getValue = typeof field === 'function' ? field : (a: Agent) => a[field];

  for (let i = 1; i < agents.length; i++) {
    const prev = getValue(agents[i - 1]);
    const curr = getValue(agents[i]);

    // Skip undefined values
    if (prev === undefined || curr === undefined) continue;

    let valid: boolean;
    if (typeof prev === 'string' && typeof curr === 'string') {
      const cmp = prev.localeCompare(curr, undefined, { sensitivity: 'base' });
      valid = order === 'asc' ? cmp <= 0 : cmp >= 0;
    } else {
      valid = order === 'asc' ? prev <= curr : prev >= curr;
    }

    if (!valid) {
      return {
        passed: false,
        firstViolation: { index: i, prev, curr },
      };
    }
  }

  return { passed: true };
}

/**
 * Verify pagination consistency (no duplicates, correct total)
 */
export function verifyPagination(
  allAgents: Agent[],
  expectedTotal?: number
): { passed: boolean; errors: string[] } {
  const errors: string[] = [];

  // Check for duplicates
  const ids = allAgents.map((a) => a.id);
  const uniqueIds = new Set(ids);
  if (ids.length !== uniqueIds.size) {
    const duplicates = ids.filter((id, idx) => ids.indexOf(id) !== idx);
    errors.push(`Found ${duplicates.length} duplicate agents: ${[...new Set(duplicates)].slice(0, 5).join(', ')}`);
  }

  // Check total if provided
  if (expectedTotal !== undefined && allAgents.length !== expectedTotal) {
    errors.push(`Expected ${expectedTotal} total agents, got ${allAgents.length}`);
  }

  return {
    passed: errors.length === 0,
    errors,
  };
}

/**
 * Check if skill filter is satisfied
 */
export function verifySkillFilter(agents: Agent[], skill: string): { passed: boolean; failedCount: number } {
  let failedCount = 0;
  for (const agent of agents) {
    const hasSkill = agent.oasf?.skills?.some((s) => s.slug === skill);
    if (!hasSkill) failedCount++;
  }
  return { passed: failedCount === 0, failedCount };
}

/**
 * Check if domain filter is satisfied
 */
export function verifyDomainFilter(agents: Agent[], domain: string): { passed: boolean; failedCount: number } {
  let failedCount = 0;
  for (const agent of agents) {
    const hasDomain = agent.oasf?.domains?.some((d) => d.slug === domain);
    if (!hasDomain) failedCount++;
  }
  return { passed: failedCount === 0, failedCount };
}
