/**
 * Mock fixtures exports for E2E testing
 * @module services/mock/fixtures
 *
 * Centralized export for all mock fixtures
 */

// Agent fixtures
export {
  MOCK_AGENTS_SUMMARY,
  MOCK_AGENTS_DETAIL,
  MOCK_AGENT_REPUTATION,
  getMockAgentSummary,
  getMockAgentDetail,
  getMockAgentByChainAndToken,
  getMockAgentCountByChain,
} from './agents';

// Classification fixtures
export {
  MOCK_CLASSIFICATIONS,
  MOCK_SKILL_SLUGS,
  MOCK_DOMAIN_SLUGS,
  getMockClassification,
  getAgentsBySkill,
  getAgentsByDomain,
} from './classifications';

// Chain stats fixtures
export {
  MOCK_CHAIN_STATS,
  getMockChainStats,
  getMockTotalAgentCount,
  getMockTotalActiveCount,
} from './chain-stats';
