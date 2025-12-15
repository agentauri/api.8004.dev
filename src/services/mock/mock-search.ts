/**
 * Mock search service for E2E testing
 * @module services/mock/mock-search
 *
 * Provides a mock implementation of SearchService that uses fixture data
 * for deterministic E2E testing without external dependencies.
 */

import type { SearchParams, SearchService } from '@/services/search';
import type { SearchResultItem, SearchServiceResult } from '@/types';
import { MOCK_AGENTS_SUMMARY, MOCK_CLASSIFICATIONS } from './fixtures';

/**
 * Calculate semantic-like score based on text similarity
 * Uses a combination of exact match, substring match, and word overlap
 */
function calculateSemanticScore(query: string, name: string, description: string): number {
  const queryLower = query.toLowerCase().trim();
  const nameLower = (name || '').toLowerCase();
  const descLower = (description || '').toLowerCase();

  if (!queryLower) return 0.5;

  // Exact name match = 1.0
  if (nameLower === queryLower) return 1.0;

  // Name starts with query = 0.95
  if (nameLower.startsWith(queryLower)) return 0.95;

  // Name contains query = 0.85
  if (nameLower.includes(queryLower)) return 0.85;

  // Description starts with query = 0.75
  if (descLower.startsWith(queryLower)) return 0.75;

  // Description contains query = 0.65
  if (descLower.includes(queryLower)) return 0.65;

  // Word overlap scoring
  const queryWords = queryLower.split(/\s+/).filter((w) => w.length > 1);
  const nameWords = nameLower.split(/\s+/).filter((w) => w.length > 1);
  const descWords = descLower.split(/\s+/).filter((w) => w.length > 1);

  // Count word matches in name
  const nameMatches = queryWords.filter((qw) =>
    nameWords.some((nw) => nw.includes(qw) || qw.includes(nw))
  ).length;

  if (nameMatches > 0) {
    return 0.5 + 0.3 * (nameMatches / queryWords.length);
  }

  // Count word matches in description
  const descMatches = queryWords.filter((qw) =>
    descWords.some((dw) => dw.includes(qw) || qw.includes(dw))
  ).length;

  if (descMatches > 0) {
    return 0.3 + 0.2 * (descMatches / queryWords.length);
  }

  // No match at all - return below minScore threshold
  return 0.1;
}

/**
 * Generate match reasons based on how the query matched
 */
function generateMatchReasons(
  query: string,
  name: string,
  description: string,
  agent: { hasMcp?: boolean; hasA2a?: boolean; x402Support?: boolean }
): string[] {
  const reasons: string[] = [];
  const queryLower = query.toLowerCase().trim();

  if (queryLower) {
    if ((name || '').toLowerCase().includes(queryLower)) {
      reasons.push('name_match');
    }
    if ((description || '').toLowerCase().includes(queryLower)) {
      reasons.push('description_match');
    }
  }

  if (agent.hasMcp) reasons.push('has_mcp');
  if (agent.hasA2a) reasons.push('has_a2a');
  if (agent.x402Support) reasons.push('has_x402');

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
 * Create mock search service
 */
export function createMockSearchService(): SearchService {
  return {
    async search(params: SearchParams): Promise<SearchServiceResult> {
      const { query, limit = 20, minScore = 0.3, cursor, offset, filters } = params;

      // Determine starting offset
      let startOffset = 0;
      if (offset !== undefined && offset > 0) {
        startOffset = offset;
      } else if (cursor) {
        startOffset = decodeCursor(cursor);
      }

      // Start with all agents
      let filtered = [...MOCK_AGENTS_SUMMARY];

      // Apply filters
      if (filters) {
        // Chain filter
        if (filters.chainIds && filters.chainIds.length > 0) {
          const chainIds = filters.chainIds;
          filtered = filtered.filter((a) => chainIds.includes(a.chainId));
        }

        // Active filter (only active=true filters, active=false means no filter)
        if (filters.active === true) {
          filtered = filtered.filter((a) => a.active);
        }

        // Skills filter
        if (filters.skills && filters.skills.length > 0) {
          const skills = filters.skills;
          filtered = filtered.filter((a) => agentHasSkill(a.id, skills));
        }

        // Domains filter
        if (filters.domains && filters.domains.length > 0) {
          const domains = filters.domains;
          filtered = filtered.filter((a) => agentHasDomain(a.id, domains));
        }

        // Boolean filters (MCP, A2A, x402)
        const booleanFilters: Array<'mcp' | 'a2a' | 'x402'> = [];
        if (filters.mcp) booleanFilters.push('mcp');
        if (filters.a2a) booleanFilters.push('a2a');
        if (filters.x402) booleanFilters.push('x402');

        if (booleanFilters.length > 0) {
          if (filters.filterMode === 'OR') {
            // OR mode: agent matches if ANY boolean filter matches
            filtered = filtered.filter(
              (a) =>
                (filters.mcp && a.hasMcp) ||
                (filters.a2a && a.hasA2a) ||
                (filters.x402 && a.x402Support)
            );
          } else {
            // AND mode: agent must match ALL specified boolean filters
            if (filters.mcp !== undefined) {
              filtered = filtered.filter((a) => a.hasMcp === filters.mcp);
            }
            if (filters.a2a !== undefined) {
              filtered = filtered.filter((a) => a.hasA2a === filters.a2a);
            }
            if (filters.x402 !== undefined) {
              filtered = filtered.filter((a) => a.x402Support === filters.x402);
            }
          }
        }
      }

      // Calculate scores
      const scored = filtered.map((agent) => ({
        agent,
        score: calculateSemanticScore(query, agent.name, agent.description),
      }));

      // Filter by minScore
      const aboveThreshold = scored.filter((s) => s.score >= minScore);

      // Sort by score descending
      aboveThreshold.sort((a, b) => b.score - a.score);

      // Create result items
      const results: SearchResultItem[] = aboveThreshold.map(({ agent, score }) => ({
        agentId: agent.id,
        chainId: agent.chainId,
        name: agent.name,
        description: agent.description,
        score,
        metadata: {
          tokenId: agent.tokenId,
          hasMcp: agent.hasMcp,
          hasA2a: agent.hasA2a,
          x402Support: agent.x402Support,
          active: agent.active,
        },
        matchReasons: generateMatchReasons(query, agent.name, agent.description, agent),
      }));

      // Calculate byChain breakdown
      const byChain: Record<number, number> = {};
      for (const item of results) {
        byChain[item.chainId] = (byChain[item.chainId] || 0) + 1;
      }

      // Apply pagination
      const paginatedResults = results.slice(startOffset, startOffset + limit);
      const hasMore = startOffset + limit < results.length;
      const nextCursor = hasMore ? encodeOffsetCursor(startOffset + limit) : undefined;

      return {
        results: paginatedResults,
        total: results.length,
        hasMore,
        nextCursor,
        byChain,
      };
    },

    async healthCheck(): Promise<boolean> {
      // Mock always returns healthy
      return true;
    },
  };
}
