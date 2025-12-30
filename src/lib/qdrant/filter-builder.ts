/**
 * Qdrant filter builder
 * Translates API filter parameters to Qdrant filter format
 * @module lib/qdrant/filter-builder
 */

import type { AgentFilterParams, FieldCondition, QdrantFilter } from './types';

/**
 * Build a Qdrant filter from API filter parameters
 *
 * @param params - API filter parameters
 * @returns Qdrant filter object or undefined if no filters
 */
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
  if (params.minRep !== undefined || params.maxRep !== undefined) {
    const range: { gte?: number; lte?: number } = {};

    if (params.minRep !== undefined) {
      range.gte = params.minRep;
    }

    if (params.maxRep !== undefined) {
      range.lte = params.maxRep;
    }

    mustConditions.push({
      key: 'reputation',
      range,
    });
  }

  // --- New filters ---

  // Created after/before (datetime range)
  if (params.createdAfter || params.createdBefore) {
    const range: { gte?: string; lte?: string } = {};

    if (params.createdAfter) {
      range.gte = params.createdAfter;
    }

    if (params.createdBefore) {
      range.lte = params.createdBefore;
    }

    mustConditions.push({
      key: 'created_at',
      range,
    });
  }

  // Has image filter
  if (params.hasImage !== undefined) {
    if (params.hasImage) {
      // Must have a non-empty image
      mustNotConditions.push({
        key: 'image',
        match: { value: '' },
      });
    } else {
      // Must have empty image
      mustConditions.push({
        key: 'image',
        match: { value: '' },
      });
    }
  }

  // Has ENS filter
  if (params.hasENS !== undefined) {
    if (params.hasENS) {
      // Must have a non-empty ENS
      mustNotConditions.push({
        key: 'ens',
        match: { value: '' },
      });
    } else {
      // Must have empty ENS
      mustConditions.push({
        key: 'ens',
        match: { value: '' },
      });
    }
  }

  // Has DID filter
  if (params.hasDID !== undefined) {
    if (params.hasDID) {
      // Must have a non-empty DID
      mustNotConditions.push({
        key: 'did',
        match: { value: '' },
      });
    } else {
      // Must have empty DID
      mustConditions.push({
        key: 'did',
        match: { value: '' },
      });
    }
  }

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

  // Has prompts filter
  if (params.hasPrompts !== undefined) {
    if (params.hasPrompts) {
      mustConditions.push({
        key: 'mcp_prompts',
        values_count: { gte: 1 },
      });
    } else {
      mustConditions.push({
        key: 'mcp_prompts',
        values_count: { lte: 0 },
      });
    }
  }

  // Has resources filter
  if (params.hasResources !== undefined) {
    if (params.hasResources) {
      mustConditions.push({
        key: 'mcp_resources',
        values_count: { gte: 1 },
      });
    } else {
      mustConditions.push({
        key: 'mcp_resources',
        values_count: { lte: 0 },
      });
    }
  }

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
export function range(options: {
  lt?: number;
  lte?: number;
  gt?: number;
  gte?: number;
}): { lt?: number; lte?: number; gt?: number; gte?: number } {
  return options;
}

/**
 * Create a values_count condition for array length filtering
 */
export function valuesCount(options: {
  lt?: number;
  lte?: number;
  gt?: number;
  gte?: number;
}): { lt?: number; lte?: number; gt?: number; gte?: number } {
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
