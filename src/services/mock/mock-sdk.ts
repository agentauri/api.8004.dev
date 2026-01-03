/**
 * Mock SDK service for E2E testing
 * @module services/mock/mock-sdk
 *
 * Provides a mock implementation of SDKService that uses fixture data
 * for deterministic E2E testing without external dependencies.
 */

import type {
  FallbackSearchParams,
  FallbackSearchResult,
  FallbackSearchResultItem,
  GetAgentsParams,
  GetAgentsResult,
  ReputationSearchParams,
  ReputationSearchResult,
  SDKService,
} from '@/services/sdk';
import type { AgentDetail, AgentSummary, ChainStats } from '@/types';
import {
  getMockAgentByChainAndToken,
  MOCK_AGENT_REPUTATION,
  MOCK_AGENTS_SUMMARY,
  MOCK_CHAIN_STATS,
  MOCK_CLASSIFICATIONS,
} from './fixtures';

/**
 * Calculate basic search score based on name/description match quality
 */
function calculateBasicScore(query: string, name: string, description: string): number {
  const queryLower = query.toLowerCase().trim();
  const nameLower = (name || '').toLowerCase();
  const descLower = (description || '').toLowerCase();

  if (!queryLower) return 0.5;
  if (nameLower === queryLower) return 1.0;
  if (nameLower.startsWith(queryLower)) return 0.9;
  if (nameLower.includes(queryLower)) return 0.8;
  if (descLower.startsWith(queryLower)) return 0.7;
  if (descLower.includes(queryLower)) return 0.6;

  const queryWords = queryLower.split(/\s+/).filter((w) => w.length > 0);
  const nameWords = nameLower.split(/\s+/).filter((w) => w.length > 0);
  const matchingNameWords = queryWords.filter((qw) =>
    nameWords.some((nw) => nw.includes(qw) || qw.includes(nw))
  );
  if (matchingNameWords.length > 0) {
    return 0.5 + 0.3 * (matchingNameWords.length / queryWords.length);
  }

  const descWords = descLower.split(/\s+/).filter((w) => w.length > 0);
  const matchingDescWords = queryWords.filter((qw) =>
    descWords.some((dw) => dw.includes(qw) || qw.includes(dw))
  );
  if (matchingDescWords.length > 0) {
    return 0.3 + 0.2 * (matchingDescWords.length / queryWords.length);
  }

  return 0.3;
}

/**
 * Generate match reasons based on query and agent data
 */
function generateMatchReasons(
  query: string,
  name: string,
  description: string,
  filters: { mcp?: boolean; a2a?: boolean; x402?: boolean }
): string[] {
  const reasons: string[] = [];
  const queryLower = query.toLowerCase().trim();
  const nameLower = (name || '').toLowerCase();
  const descLower = (description || '').toLowerCase();

  if (queryLower) {
    if (nameLower.includes(queryLower)) {
      reasons.push('name_match');
    }
    if (descLower.includes(queryLower)) {
      reasons.push('description_match');
    }
  }

  if (filters.mcp) reasons.push('has_mcp');
  if (filters.a2a) reasons.push('has_a2a');
  if (filters.x402) reasons.push('has_x402');

  return reasons.length > 0 ? reasons : ['filter_match'];
}

/**
 * Encode offset into a cursor string
 */
function encodeOffsetCursor(offset: number): string {
  return Buffer.from(JSON.stringify({ offset })).toString('base64url');
}

/**
 * Decode cursor to offset
 */
function decodeCursor(cursor: string): number {
  try {
    const decoded = JSON.parse(Buffer.from(cursor, 'base64url').toString());
    return typeof decoded.offset === 'number' ? decoded.offset : 0;
  } catch {
    return 0;
  }
}

/**
 * Filter agents based on params
 */
function filterAgents(agents: AgentSummary[], params: GetAgentsParams): AgentSummary[] {
  // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: Mock filter mirrors production filter logic
  return agents.filter((agent) => {
    // Filter by chainIds
    if (params.chainIds && params.chainIds.length > 0) {
      if (!params.chainIds.includes(agent.chainId)) return false;
    }

    // Filter by active (only active=true filters, active=false means no filter)
    if (params.active === true && !agent.active) return false;

    // Filter by hasMcp
    if (params.hasMcp !== undefined && agent.hasMcp !== params.hasMcp) return false;

    // Filter by hasA2a
    if (params.hasA2a !== undefined && agent.hasA2a !== params.hasA2a) return false;

    // Filter by hasX402
    if (params.hasX402 !== undefined && agent.x402Support !== params.hasX402) return false;

    return true;
  });
}

/**
 * Check if agent has OASF skill
 */
function agentHasSkill(agentId: string, skillSlugs: string[]): boolean {
  const classification = MOCK_CLASSIFICATIONS.get(agentId);
  if (!classification) return false;
  return skillSlugs.some((slug) =>
    classification.skills.some((s) => s.slug === slug || s.slug.startsWith(slug))
  );
}

/**
 * Check if agent has OASF domain
 */
function agentHasDomain(agentId: string, domainSlugs: string[]): boolean {
  const classification = MOCK_CLASSIFICATIONS.get(agentId);
  if (!classification) return false;
  return domainSlugs.some((slug) =>
    classification.domains.some((d) => d.slug === slug || d.slug.startsWith(slug))
  );
}

/**
 * Create mock SDK service
 */
export function createMockSDKService(): SDKService {
  return {
    async getAgents(params: GetAgentsParams): Promise<GetAgentsResult> {
      const { limit = 20, cursor } = params;

      // Filter agents
      const filtered = filterAgents([...MOCK_AGENTS_SUMMARY], params);

      // Sort by chainId:tokenId (deterministic ordering)
      filtered.sort((a, b) => {
        if (a.chainId !== b.chainId) return a.chainId - b.chainId;
        return Number(a.tokenId) - Number(b.tokenId);
      });

      // Apply pagination
      const offset = cursor ? decodeCursor(cursor) : 0;
      const items = filtered.slice(offset, offset + limit);
      const hasMore = offset + limit < filtered.length;
      const nextCursor = hasMore ? encodeOffsetCursor(offset + limit) : undefined;

      return {
        items,
        nextCursor,
        total: filtered.length,
      };
    },

    async getAgent(chainId: number, tokenId: string): Promise<AgentDetail | null> {
      const agent = getMockAgentByChainAndToken(chainId, tokenId);
      if (!agent) return null;

      // Attach OASF classification if available
      const classification = MOCK_CLASSIFICATIONS.get(agent.id);
      if (classification) {
        return { ...agent, oasf: classification };
      }

      return agent;
    },

    async getChainStats(): Promise<ChainStats[]> {
      return [...MOCK_CHAIN_STATS];
    },

    // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: Mock search mirrors production search logic
    async search(params: FallbackSearchParams): Promise<FallbackSearchResult> {
      const {
        query,
        chainIds,
        active,
        mcp,
        a2a,
        x402,
        filterMode = 'AND',
        limit = 20,
        cursor,
      } = params;

      const offset = cursor ? decodeCursor(cursor) : 0;

      // Start with all agents
      let filtered = [...MOCK_AGENTS_SUMMARY];

      // Filter by chainIds
      if (chainIds && chainIds.length > 0) {
        filtered = filtered.filter((a) => chainIds.includes(a.chainId));
      }

      // Filter by active (only active=true filters)
      if (active === true) {
        filtered = filtered.filter((a) => a.active);
      }

      // Boolean filters (MCP, A2A, x402)
      const booleanFilters: Array<'mcp' | 'a2a' | 'x402'> = [];
      if (mcp) booleanFilters.push('mcp');
      if (a2a) booleanFilters.push('a2a');
      if (x402) booleanFilters.push('x402');

      if (booleanFilters.length > 0) {
        if (filterMode === 'OR') {
          // OR mode: agent matches if ANY boolean filter matches
          filtered = filtered.filter(
            (a) => (mcp && a.hasMcp) || (a2a && a.hasA2a) || (x402 && a.x402Support)
          );
        } else {
          // AND mode: agent must match ALL specified boolean filters
          if (mcp !== undefined) filtered = filtered.filter((a) => a.hasMcp === mcp);
          if (a2a !== undefined) filtered = filtered.filter((a) => a.hasA2a === a2a);
          if (x402 !== undefined) filtered = filtered.filter((a) => a.x402Support === x402);
        }
      }

      // Filter by query text (name/description match)
      const queryLower = query.toLowerCase().trim();
      if (queryLower) {
        filtered = filtered.filter((a) => {
          const nameLower = (a.name || '').toLowerCase();
          const descLower = (a.description || '').toLowerCase();
          return nameLower.includes(queryLower) || descLower.includes(queryLower);
        });
      }

      // Calculate scores and create result items
      const scoredItems: FallbackSearchResultItem[] = filtered.map((agent) => ({
        agent,
        score: calculateBasicScore(query, agent.name, agent.description),
        matchReasons: generateMatchReasons(query, agent.name, agent.description, {
          mcp: agent.hasMcp,
          a2a: agent.hasA2a,
          x402: agent.x402Support,
        }),
      }));

      // Sort by score descending
      scoredItems.sort((a, b) => b.score - a.score);

      // Calculate byChain breakdown
      const byChain: Record<number, number> = {};
      for (const item of scoredItems) {
        byChain[item.agent.chainId] = (byChain[item.agent.chainId] || 0) + 1;
      }

      // Apply pagination
      const items = scoredItems.slice(offset, offset + limit);
      const hasMore = offset + limit < scoredItems.length;
      const nextCursor = hasMore ? encodeOffsetCursor(offset + limit) : undefined;

      return {
        items,
        total: scoredItems.length,
        hasMore,
        nextCursor,
        byChain,
      };
    },

    async searchByReputation(params: ReputationSearchParams): Promise<ReputationSearchResult> {
      const { chainIds, minRep, maxRep, limit = 20, cursor } = params;

      const offset = cursor ? decodeCursor(cursor) : 0;

      // Start with all agents that have reputation scores
      let filtered = MOCK_AGENTS_SUMMARY.filter((a) => MOCK_AGENT_REPUTATION.has(a.id));

      // Filter by chainIds
      if (chainIds && chainIds.length > 0) {
        filtered = filtered.filter((a) => chainIds.includes(a.chainId));
      }

      // Filter by reputation range
      if (minRep !== undefined) {
        filtered = filtered.filter((a) => {
          const rep = MOCK_AGENT_REPUTATION.get(a.id);
          return rep !== undefined && rep >= minRep;
        });
      }

      if (maxRep !== undefined) {
        filtered = filtered.filter((a) => {
          const rep = MOCK_AGENT_REPUTATION.get(a.id);
          return rep !== undefined && rep <= maxRep;
        });
      }

      // Sort by reputation descending
      filtered.sort((a, b) => {
        const repA = MOCK_AGENT_REPUTATION.get(a.id) || 0;
        const repB = MOCK_AGENT_REPUTATION.get(b.id) || 0;
        return repB - repA;
      });

      // Apply pagination
      const items = filtered.slice(offset, offset + limit);
      const hasMore = offset + limit < filtered.length;
      const nextCursor = hasMore ? encodeOffsetCursor(offset + limit) : undefined;

      return {
        items,
        total: filtered.length,
        hasMore,
        nextCursor,
      };
    },
  };
}

/**
 * Filter agents by OASF skills (for SDK path with skills filter)
 */
export function filterBySkills(agents: AgentSummary[], skills: string[]): AgentSummary[] {
  return agents.filter((a) => agentHasSkill(a.id, skills));
}

/**
 * Filter agents by OASF domains (for SDK path with domains filter)
 */
export function filterByDomains(agents: AgentSummary[], domains: string[]): AgentSummary[] {
  return agents.filter((a) => agentHasDomain(a.id, domains));
}
