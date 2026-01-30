/**
 * Qdrant filter builder
 * Translates API filter parameters to Qdrant filter format
 * @module lib/qdrant/filter-builder
 */

import type { AgentFilterParams, FieldCondition, QdrantFilter } from './types';

// ============================================================================
// Helper functions for building filter conditions
// ============================================================================

/**
 * Add a numeric range filter (min/max pattern)
 */
function addRangeFilter(
  conditions: FieldCondition[],
  key: string,
  min?: number,
  max?: number
): void {
  if (min === undefined && max === undefined) return;

  const range: { gte?: number; lte?: number } = {};
  if (min !== undefined) range.gte = min;
  if (max !== undefined) range.lte = max;

  conditions.push({ key, range });
}

/**
 * Add a datetime range filter
 */
function addDatetimeRangeFilter(
  conditions: FieldCondition[],
  key: string,
  after?: string,
  before?: string
): void {
  if (!after && !before) return;

  const range: { gte?: string; lte?: string } = {};
  if (after) range.gte = after;
  if (before) range.lte = before;

  conditions.push({ key, range });
}

/**
 * Add a "has field" filter (non-empty string check)
 * When hasField=true: adds must_not condition for empty string
 * When hasField=false: adds must condition for empty string
 */
function addHasFieldFilter(
  mustConditions: FieldCondition[],
  mustNotConditions: FieldCondition[],
  key: string,
  hasField?: boolean
): void {
  if (hasField === undefined) return;

  if (hasField) {
    mustNotConditions.push({ key, match: { value: '' } });
  } else {
    mustConditions.push({ key, match: { value: '' } });
  }
}

/**
 * Add a "has count" filter using values_count (for arrays)
 * When hasItems=true: requires at least 1 item
 * When hasItems=false: requires 0 items
 */
function addHasValuesCountFilter(
  conditions: FieldCondition[],
  key: string,
  hasItems?: boolean
): void {
  if (hasItems === undefined) return;

  conditions.push({
    key,
    values_count: hasItems ? { gte: 1 } : { lte: 0 },
  });
}

/**
 * Add a "has count" filter using range (for numeric fields like total_validations)
 * When hasItems=true: requires at least 1
 * When hasItems=false: requires 0
 */
function addHasRangeCountFilter(
  conditions: FieldCondition[],
  key: string,
  hasItems?: boolean
): void {
  if (hasItems === undefined) return;

  conditions.push({
    key,
    range: hasItems ? { gte: 1 } : { lte: 0 },
  });
}

// ============================================================================
// Main filter builder
// ============================================================================

/**
 * Build a Qdrant filter from API filter parameters
 *
 * @param params - API filter parameters
 * @returns Qdrant filter object or undefined if no filters
 */
// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: Filter builder handles 20+ filter types requiring extensive branching
export function buildFilter(params: AgentFilterParams): QdrantFilter | undefined {
  const mustConditions: FieldCondition[] = [];
  const shouldConditions: FieldCondition[] = [];
  const mustNotConditions: FieldCondition[] = [];

  // Determine if we're in OR mode for boolean filters
  const isOrMode = params.filterMode === 'OR';

  // Chain IDs filter
  if (params.chainIds && params.chainIds.length > 0) {
    mustConditions.push({
      key: 'chain_id',
      match: { any: params.chainIds },
    });
  }

  // Active filter
  if (params.active !== undefined) {
    mustConditions.push({
      key: 'active',
      match: { value: params.active },
    });
  }

  // Boolean filters (mcp, a2a, x402) - support OR mode
  const booleanFilters: FieldCondition[] = [];

  if (params.mcp !== undefined) {
    booleanFilters.push({
      key: 'has_mcp',
      match: { value: params.mcp },
    });
  }

  if (params.a2a !== undefined) {
    booleanFilters.push({
      key: 'has_a2a',
      match: { value: params.a2a },
    });
  }

  if (params.x402 !== undefined) {
    booleanFilters.push({
      key: 'x402_support',
      match: { value: params.x402 },
    });
  }

  // Add boolean filters based on mode
  if (booleanFilters.length > 0) {
    if (isOrMode && booleanFilters.length > 1) {
      // OR mode: any boolean filter can match
      shouldConditions.push(...booleanFilters);
    } else {
      // AND mode: all boolean filters must match
      mustConditions.push(...booleanFilters);
    }
  }

  // Has registration file filter
  if (params.hasRegistrationFile !== undefined) {
    mustConditions.push({
      key: 'has_registration_file',
      match: { value: params.hasRegistrationFile },
    });
  }

  // Skills filter (array containment)
  if (params.skills && params.skills.length > 0) {
    // Use 'any' to match agents with ANY of the specified skills
    mustConditions.push({
      key: 'skills',
      match: { any: params.skills },
    });
  }

  // Domains filter (array containment)
  if (params.domains && params.domains.length > 0) {
    // Use 'any' to match agents with ANY of the specified domains
    mustConditions.push({
      key: 'domains',
      match: { any: params.domains },
    });
  }

  // MCP tools filter
  if (params.mcpTools && params.mcpTools.length > 0) {
    mustConditions.push({
      key: 'mcp_tools',
      match: { any: params.mcpTools },
    });
  }

  // A2A skills filter
  if (params.a2aSkills && params.a2aSkills.length > 0) {
    mustConditions.push({
      key: 'a2a_skills',
      match: { any: params.a2aSkills },
    });
  }

  // Reputation range filters
  addRangeFilter(mustConditions, 'reputation', params.minRep, params.maxRep);

  // --- New filters ---

  // Created after/before (datetime range)
  addDatetimeRangeFilter(mustConditions, 'created_at', params.createdAfter, params.createdBefore);

  // Updated after/before (datetime range)
  addDatetimeRangeFilter(mustConditions, 'updated_at', params.updatedAfter, params.updatedBefore);

  // Has field filters (non-empty string checks)
  addHasFieldFilter(mustConditions, mustNotConditions, 'image', params.hasImage);
  addHasFieldFilter(mustConditions, mustNotConditions, 'ens', params.hasENS);
  addHasFieldFilter(mustConditions, mustNotConditions, 'did', params.hasDID);

  // Operator filter
  if (params.operator) {
    mustConditions.push({
      key: 'operators',
      match: { any: [params.operator.toLowerCase()] },
    });
  }

  // Min skills count filter
  if (params.minSkillsCount !== undefined && params.minSkillsCount > 0) {
    mustConditions.push({
      key: 'skills',
      values_count: { gte: params.minSkillsCount },
    });
  }

  // Min domains count filter
  if (params.minDomainsCount !== undefined && params.minDomainsCount > 0) {
    mustConditions.push({
      key: 'domains',
      values_count: { gte: params.minDomainsCount },
    });
  }

  // Has prompts/resources filters (array count checks)
  addHasValuesCountFilter(mustConditions, 'mcp_prompts', params.hasPrompts);
  addHasValuesCountFilter(mustConditions, 'mcp_resources', params.hasResources);

  // Input mode filter
  if (params.inputMode) {
    mustConditions.push({
      key: 'input_modes',
      match: { any: [params.inputMode] },
    });
  }

  // Output mode filter
  if (params.outputMode) {
    mustConditions.push({
      key: 'output_modes',
      match: { any: [params.outputMode] },
    });
  }

  // --- Reachability filters ---

  // A2A reachability filter
  if (params.reachableA2a !== undefined) {
    mustConditions.push({
      key: 'is_reachable_a2a',
      match: { value: params.reachableA2a },
    });
  }

  // MCP reachability filter
  if (params.reachableMcp !== undefined) {
    mustConditions.push({
      key: 'is_reachable_mcp',
      match: { value: params.reachableMcp },
    });
  }

  // Web reachability filter
  if (params.reachableWeb !== undefined) {
    mustConditions.push({
      key: 'is_reachable_web',
      match: { value: params.reachableWeb },
    });
  }

  // --- Owner & Wallet filters ---

  // Owner filter (exact match on owner address)
  if (params.owner) {
    mustConditions.push({
      key: 'owner',
      match: { value: params.owner.toLowerCase() },
    });
  }

  // Wallet address filter (agent's own wallet address)
  if (params.walletAddress) {
    mustConditions.push({
      key: 'wallet_address',
      match: { value: params.walletAddress.toLowerCase() },
    });
  }

  // Trust models filter (array containment)
  if (params.trustModels && params.trustModels.length > 0) {
    mustConditions.push({
      key: 'supported_trusts',
      match: { any: params.trustModels },
    });
  }

  // Has trusts filter (has at least one trust model)
  addHasValuesCountFilter(mustConditions, 'supported_trusts', params.hasTrusts);

  // --- Exact match filters ---

  // ENS exact match filter
  if (params.ens) {
    mustConditions.push({
      key: 'ens',
      match: { value: params.ens.toLowerCase() },
    });
  }

  // DID exact match filter
  if (params.did) {
    mustConditions.push({
      key: 'did',
      match: { value: params.did },
    });
  }

  // --- Trust score filters (Gap 1) ---

  // Trust score range filter
  addRangeFilter(mustConditions, 'trust_score', params.trustScoreMin, params.trustScoreMax);

  // --- Curation filters (Gap 3) ---

  // Curated by filter (check if curator is in curated_by array)
  if (params.curatedBy) {
    mustConditions.push({
      key: 'curated_by',
      match: { any: [params.curatedBy.toLowerCase()] },
    });
  }

  // Is curated filter
  if (params.isCurated !== undefined) {
    mustConditions.push({
      key: 'is_curated',
      match: { value: params.isCurated },
    });
  }

  // --- Gap 4: Declared OASF filters ---

  // Declared skill filter
  if (params.declaredSkill) {
    mustConditions.push({
      key: 'declared_oasf_skills',
      match: { any: [params.declaredSkill] },
    });
  }

  // Declared domain filter
  if (params.declaredDomain) {
    mustConditions.push({
      key: 'declared_oasf_domains',
      match: { any: [params.declaredDomain] },
    });
  }

  // Declared skills array filter (match any)
  if (params.declaredSkills && params.declaredSkills.length > 0) {
    mustConditions.push({
      key: 'declared_oasf_skills',
      match: { any: params.declaredSkills },
    });
  }

  // Declared domains array filter (match any)
  if (params.declaredDomains && params.declaredDomains.length > 0) {
    mustConditions.push({
      key: 'declared_oasf_domains',
      match: { any: params.declaredDomains },
    });
  }

  // --- Gap 5: New endpoint filters ---
  addHasFieldFilter(mustConditions, mustNotConditions, 'email_endpoint', params.hasEmail);
  addHasFieldFilter(mustConditions, mustNotConditions, 'oasf_endpoint', params.hasOasfEndpoint);

  // --- Gap 6: Reachability attestation filters ---

  // Has recent reachability check (within 14 days)
  if (params.hasRecentReachability !== undefined) {
    if (params.hasRecentReachability) {
      // Calculate 14 days ago
      const fourteenDaysAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString();
      // At least one of MCP or A2A reachability must be recent
      shouldConditions.push({
        key: 'last_reachability_check_mcp',
        range: { gte: fourteenDaysAgo },
      });
      shouldConditions.push({
        key: 'last_reachability_check_a2a',
        range: { gte: fourteenDaysAgo },
      });
    }
  }

  // --- Validation score filters ---

  // Validation score range filter
  addRangeFilter(mustConditions, 'validation_score', params.minValidationScore, params.maxValidationScore);

  // Validation status filters (using range for numeric fields)
  addHasRangeCountFilter(mustConditions, 'total_validations', params.hasValidations);
  addHasRangeCountFilter(mustConditions, 'pending_validations', params.hasPendingValidations);
  addHasRangeCountFilter(mustConditions, 'expired_validations', params.hasExpiredValidations);

  // --- Wallet verification filter ---

  // Wallet verified filter (ERC-8004 v1.0)
  if (params.walletVerified !== undefined) {
    mustConditions.push({
      key: 'wallet_verified',
      match: { value: params.walletVerified },
    });
  }

  // --- Tags filter ---

  // Has tags filter (filter by agents with specific feedback tags)
  if (params.hasTags && params.hasTags.length > 0) {
    mustConditions.push({
      key: 'all_tags',
      match: { any: params.hasTags },
    });
  }

  // --- Exclusion filters (notIn / except) ---

  // Exclude chain IDs
  if (params.excludeChainIds && params.excludeChainIds.length > 0) {
    mustNotConditions.push({
      key: 'chain_id',
      match: { any: params.excludeChainIds },
    });
  }

  // Exclude skills
  if (params.excludeSkills && params.excludeSkills.length > 0) {
    mustNotConditions.push({
      key: 'skills',
      match: { any: params.excludeSkills },
    });
  }

  // Exclude domains
  if (params.excludeDomains && params.excludeDomains.length > 0) {
    mustNotConditions.push({
      key: 'domains',
      match: { any: params.excludeDomains },
    });
  }

  // Build final filter
  const filter: QdrantFilter = {};

  if (mustConditions.length > 0) {
    filter.must = mustConditions;
  }

  if (shouldConditions.length > 0) {
    filter.should = shouldConditions;

    // When using should, we need min_should or a must condition
    // to ensure at least one should matches
    if (mustConditions.length === 0) {
      // Wrap in a structure that requires at least one should to match
      return {
        must: [
          {
            ...filter,
            min_should: {
              conditions: shouldConditions,
              min_count: 1,
            },
          } as unknown as FieldCondition,
        ],
      };
    }
  }

  if (mustNotConditions.length > 0) {
    filter.must_not = mustNotConditions;
  }

  // Return undefined if no filters
  if (!filter.must?.length && !filter.should?.length && !filter.must_not?.length) {
    return undefined;
  }

  return filter;
}

/**
 * Create a match condition for a single value
 */
export function matchValue(value: string | number | boolean): { value: string | number | boolean } {
  return { value };
}

/**
 * Create a match condition for any of the values
 */
export function matchAny(values: (string | number)[]): { any: (string | number)[] } {
  return { any: values };
}

/**
 * Create a match condition excluding values
 */
export function matchExcept(values: (string | number)[]): { except: (string | number)[] } {
  return { except: values };
}

/**
 * Create a range condition
 */
export function range(options: { lt?: number; lte?: number; gt?: number; gte?: number }): {
  lt?: number;
  lte?: number;
  gt?: number;
  gte?: number;
} {
  return options;
}

/**
 * Create a values_count condition for array length filtering
 */
export function valuesCount(options: { lt?: number; lte?: number; gt?: number; gte?: number }): {
  lt?: number;
  lte?: number;
  gt?: number;
  gte?: number;
} {
  return options;
}

/**
 * Combine multiple filters with AND logic
 */
export function and(...conditions: (FieldCondition | QdrantFilter)[]): QdrantFilter {
  return { must: conditions };
}

/**
 * Combine multiple filters with OR logic
 */
export function or(...conditions: (FieldCondition | QdrantFilter)[]): QdrantFilter {
  return { should: conditions };
}

/**
 * Negate a filter condition
 */
export function not(...conditions: (FieldCondition | QdrantFilter)[]): QdrantFilter {
  return { must_not: conditions };
}

/**
 * Create a field condition
 */
export function field(
  key: string,
  condition: {
    match?:
      | { value: string | number | boolean }
      | { any: (string | number)[] }
      | { except: (string | number)[] };
    range?: { lt?: number; lte?: number; gt?: number; gte?: number };
    values_count?: { lt?: number; lte?: number; gt?: number; gte?: number };
  }
): FieldCondition {
  return { key, ...condition };
}
