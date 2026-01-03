/**
 * Shared filter utilities for agent search
 * @module lib/utils/filters
 */

import type { AgentSummary } from '@/types';
import type { SearchRequestBody } from './validation';

/**
 * Check if agent matches basic AND filters (active, chainIds)
 */
export function matchesBasicFilters(
  agent: AgentSummary,
  filters: SearchRequestBody['filters']
): boolean {
  if (!filters) return true;

  if (filters.active !== undefined && agent.active !== filters.active) {
    return false;
  }

  if (filters.chainIds?.length && !filters.chainIds.includes(agent.chainId)) {
    return false;
  }

  return true;
}

/**
 * Check if agent matches OASF filters (skills, domains)
 */
export function matchesOASFFilters(
  agent: AgentSummary,
  filters: SearchRequestBody['filters']
): boolean {
  if (!filters) return true;

  if (filters.skills?.length) {
    const agentSkillSlugs = agent.oasf?.skills?.map((s) => s.slug) ?? [];
    const hasMatchingSkill = filters.skills.some((reqSkill) => agentSkillSlugs.includes(reqSkill));
    if (!hasMatchingSkill) return false;
  }

  if (filters.domains?.length) {
    const agentDomainSlugs = agent.oasf?.domains?.map((d) => d.slug) ?? [];
    const hasMatchingDomain = filters.domains.some((reqDomain) =>
      agentDomainSlugs.includes(reqDomain)
    );
    if (!hasMatchingDomain) return false;
  }

  return true;
}

/**
 * Check if agent matches boolean filters (mcp, a2a, x402)
 */
export function matchesBooleanFilters(
  agent: AgentSummary,
  filters: SearchRequestBody['filters']
): boolean {
  if (!filters) return true;

  const { mcp, a2a, x402, filterMode } = filters;
  const isOrMode = filterMode === 'OR';

  const booleanFilters: boolean[] = [];
  if (mcp !== undefined) booleanFilters.push((agent.hasMcp ?? false) === mcp);
  if (a2a !== undefined) booleanFilters.push((agent.hasA2a ?? false) === a2a);
  if (x402 !== undefined) booleanFilters.push((agent.x402Support ?? false) === x402);

  if (booleanFilters.length === 0) return true;

  return isOrMode ? booleanFilters.some((b) => b) : booleanFilters.every((b) => b);
}

/**
 * Apply all filters to agents list
 */
export function applyFilters(
  agents: AgentSummary[],
  filters: SearchRequestBody['filters']
): AgentSummary[] {
  if (!filters) return agents;

  return agents.filter(
    (agent) =>
      matchesBasicFilters(agent, filters) &&
      matchesOASFFilters(agent, filters) &&
      matchesBooleanFilters(agent, filters)
  );
}
