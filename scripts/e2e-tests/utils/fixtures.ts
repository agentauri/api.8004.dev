/**
 * Test Fixtures for E2E Tests
 *
 * Provides shared test data that is fetched once and cached for all tests.
 * This reduces redundant API calls and speeds up test execution.
 *
 * Usage:
 *   import { fixtures } from '../utils/fixtures';
 *
 *   // In your test
 *   const agents = await fixtures.getAgents();
 *   const mcpAgents = await fixtures.getMcpAgents();
 */

import { get, post, type Agent, type ApiResponse } from './api-client';

// ============================================================================
// Cached Test Data
// ============================================================================

let cachedAgents: Agent[] | null = null;
let cachedMcpAgents: Agent[] | null = null;
let cachedA2aAgents: Agent[] | null = null;
let cachedX402Agents: Agent[] | null = null;
let cachedSearchResults: Agent[] | null = null;
let cachedTaxonomy: { skills: string[]; domains: string[] } | null = null;
let cachedChains: Array<{ chainId: number; name: string }> | null = null;

// ============================================================================
// Fixture Functions
// ============================================================================

/**
 * Get a list of agents (cached after first call)
 */
export async function getAgents(limit = 20): Promise<Agent[]> {
  if (!cachedAgents) {
    const { json } = await get<Agent[]>('/agents', { limit });
    cachedAgents = (json.data as Agent[]) || [];
  }
  return cachedAgents;
}

/**
 * Get a single agent for testing
 */
export async function getOneAgent(): Promise<Agent | null> {
  const agents = await getAgents(1);
  return agents[0] || null;
}

/**
 * Get agents with MCP support (cached after first call)
 */
export async function getMcpAgents(limit = 10): Promise<Agent[]> {
  if (!cachedMcpAgents) {
    const { json } = await get<Agent[]>('/agents', { mcp: true, limit });
    cachedMcpAgents = (json.data as Agent[]) || [];
  }
  return cachedMcpAgents;
}

/**
 * Get agents with A2A support (cached after first call)
 */
export async function getA2aAgents(limit = 10): Promise<Agent[]> {
  if (!cachedA2aAgents) {
    const { json } = await get<Agent[]>('/agents', { a2a: true, limit });
    cachedA2aAgents = (json.data as Agent[]) || [];
  }
  return cachedA2aAgents;
}

/**
 * Get agents with x402 support (cached after first call)
 */
export async function getX402Agents(limit = 10): Promise<Agent[]> {
  if (!cachedX402Agents) {
    const { json } = await get<Agent[]>('/agents', { x402: true, limit });
    cachedX402Agents = (json.data as Agent[]) || [];
  }
  return cachedX402Agents;
}

/**
 * Get search results for a common query (cached after first call)
 */
export async function getSearchResults(query = 'AI assistant', limit = 10): Promise<Agent[]> {
  if (!cachedSearchResults) {
    const { json } = await post<Agent[]>('/search', { query, limit });
    cachedSearchResults = (json.data as Agent[]) || [];
  }
  return cachedSearchResults;
}

/**
 * Get taxonomy data (cached after first call)
 */
export async function getTaxonomy(): Promise<{ skills: string[]; domains: string[] }> {
  if (!cachedTaxonomy) {
    const { json } = await get<{ skills: Array<{ slug: string }>; domains: Array<{ slug: string }> }>(
      '/taxonomy'
    );
    const data = json.data as { skills: Array<{ slug: string }>; domains: Array<{ slug: string }> };
    cachedTaxonomy = {
      skills: data?.skills?.map((s) => s.slug) || [],
      domains: data?.domains?.map((d) => d.slug) || [],
    };
  }
  return cachedTaxonomy;
}

/**
 * Get chain data (cached after first call)
 */
export async function getChains(): Promise<Array<{ chainId: number; name: string }>> {
  if (!cachedChains) {
    const { json } = await get<Array<{ chainId: number; name: string }>>('/chains');
    cachedChains = (json.data as Array<{ chainId: number; name: string }>) || [];
  }
  return cachedChains;
}

/**
 * Get a random skill from taxonomy
 */
export async function getRandomSkill(): Promise<string | null> {
  const { skills } = await getTaxonomy();
  if (skills.length === 0) return null;
  return skills[Math.floor(Math.random() * skills.length)] || null;
}

/**
 * Get a random domain from taxonomy
 */
export async function getRandomDomain(): Promise<string | null> {
  const { domains } = await getTaxonomy();
  if (domains.length === 0) return null;
  return domains[Math.floor(Math.random() * domains.length)] || null;
}

/**
 * Get a known skill that has agents
 */
export async function getKnownSkill(): Promise<string> {
  // Common skills that are likely to have agents
  return 'natural_language_processing';
}

/**
 * Get a known domain that has agents
 */
export async function getKnownDomain(): Promise<string> {
  // Common domains that are likely to have agents
  return 'technology';
}

/**
 * Clear all cached fixtures
 * Call this between test suites if you need fresh data
 */
export function clearFixtures(): void {
  cachedAgents = null;
  cachedMcpAgents = null;
  cachedA2aAgents = null;
  cachedX402Agents = null;
  cachedSearchResults = null;
  cachedTaxonomy = null;
  cachedChains = null;
}

/**
 * Preload all common fixtures in parallel
 * Call this at the start of test run for optimal performance
 */
export async function preloadFixtures(): Promise<void> {
  await Promise.all([
    getAgents(),
    getMcpAgents(),
    getA2aAgents(),
    getTaxonomy(),
    getChains(),
  ]);
}

// ============================================================================
// Fixture Object (alternative API)
// ============================================================================

export const fixtures = {
  getAgents,
  getOneAgent,
  getMcpAgents,
  getA2aAgents,
  getX402Agents,
  getSearchResults,
  getTaxonomy,
  getChains,
  getRandomSkill,
  getRandomDomain,
  getKnownSkill,
  getKnownDomain,
  clearFixtures,
  preloadFixtures,
};

export default fixtures;
