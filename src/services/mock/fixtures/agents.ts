/**
 * Mock agent fixtures for E2E testing
 * @module services/mock/fixtures/agents
 *
 * Provides 50+ deterministic mock agents across 3 chains with diverse properties
 * to ensure comprehensive test coverage.
 */

import type { AgentDetail, AgentSummary } from '@/types';
import { deriveSupportedTrust } from '@/lib/utils/agent-transform';

/**
 * Generate a deterministic agent ID
 */
function agentId(chainId: number, tokenId: number): string {
  return `${chainId}:${tokenId}`;
}

/**
 * Mock agent configuration for generating fixtures
 */
interface MockAgentConfig {
  chainId: number;
  tokenId: number;
  name: string;
  description: string;
  active: boolean;
  hasMcp: boolean;
  hasA2a: boolean;
  x402Support: boolean;
  /** MCP tool names */
  mcpTools?: string[];
  /** A2A skill names */
  a2aSkills?: string[];
  /** Average reputation score (1-5 scale) */
  reputationScore?: number;
  /** Registration timestamp */
  registeredAt?: string;
}

/**
 * Create AgentSummary from config
 */
function createAgentSummary(config: MockAgentConfig): AgentSummary {
  const id = agentId(config.chainId, config.tokenId);
  return {
    id,
    chainId: config.chainId,
    tokenId: config.tokenId.toString(),
    name: config.name,
    description: config.description,
    image: `https://example.com/agents/${id.replace(':', '-')}.png`,
    active: config.active,
    hasMcp: config.hasMcp,
    hasA2a: config.hasA2a,
    x402Support: config.x402Support,
    supportedTrust: deriveSupportedTrust(config.x402Support),
    operators: [`0x${config.tokenId.toString().padStart(40, '0')}`],
  };
}

/**
 * Create AgentDetail from config (includes additional fields)
 */
function createAgentDetail(config: MockAgentConfig): AgentDetail {
  const summary = createAgentSummary(config);
  const id = agentId(config.chainId, config.tokenId);
  return {
    ...summary,
    endpoints: {
      mcp: config.hasMcp ? { url: `https://mcp.example.com/${id}`, version: '1.0.0' } : undefined,
      a2a: config.hasA2a ? { url: `https://a2a.example.com/${id}`, version: '1.0.0' } : undefined,
    },
    registration: {
      chainId: config.chainId,
      tokenId: config.tokenId.toString(),
      contractAddress: `0xContract${config.chainId}`,
      metadataUri: `ipfs://Qm${config.chainId}${config.tokenId}`,
      owner: `0x${config.tokenId.toString().padStart(40, '0')}`,
      registeredAt: config.registeredAt || '2024-01-01T00:00:00.000Z',
    },
    mcpTools: config.mcpTools || [],
    a2aSkills: config.a2aSkills || [],
    mcpPrompts: [],
    mcpResources: [],
  };
}

/**
 * Agent configurations - 50+ agents across 3 chains
 *
 * Distribution:
 * - Sepolia (11155111): 20 agents
 * - Base Sepolia (84532): 15 agents
 * - Polygon Amoy (80002): 15 agents
 *
 * Coverage:
 * - hasMcp: true/false (at least 10 each)
 * - hasA2a: true/false (at least 10 each)
 * - x402Support: true/false (at least 5 each)
 * - active: true/false mix
 * - Various skills and domains
 * - Reputation scores 0-5
 */
const AGENT_CONFIGS: MockAgentConfig[] = [
  // ========== SEPOLIA (11155111) - 20 agents ==========
  {
    chainId: 11155111,
    tokenId: 1,
    name: 'Alpha AI Assistant',
    description: 'A powerful AI assistant with natural language processing capabilities',
    active: true,
    hasMcp: true,
    hasA2a: true,
    x402Support: true,
    mcpTools: ['search', 'calculate', 'translate'],
    a2aSkills: ['conversation', 'analysis'],
    reputationScore: 4.5,
    registeredAt: '2024-01-15T10:00:00.000Z',
  },
  {
    chainId: 11155111,
    tokenId: 2,
    name: 'Beta Code Generator',
    description: 'Advanced code generation agent for multiple programming languages',
    active: true,
    hasMcp: true,
    hasA2a: false,
    x402Support: false,
    mcpTools: ['code_generate', 'code_review', 'refactor'],
    reputationScore: 4.2,
    registeredAt: '2024-01-20T14:30:00.000Z',
  },
  {
    chainId: 11155111,
    tokenId: 3,
    name: 'Gamma Data Analyst',
    description: 'Specialized in data analysis and visualization tasks',
    active: true,
    hasMcp: false,
    hasA2a: true,
    x402Support: true,
    a2aSkills: ['data_analysis', 'visualization'],
    reputationScore: 3.8,
    registeredAt: '2024-02-01T09:00:00.000Z',
  },
  {
    chainId: 11155111,
    tokenId: 4,
    name: 'Delta Trading Bot',
    description: 'Automated trading agent for cryptocurrency markets',
    active: true,
    hasMcp: true,
    hasA2a: true,
    x402Support: true,
    mcpTools: ['trade_execute', 'market_analysis'],
    a2aSkills: ['trading', 'risk_assessment'],
    reputationScore: 4.0,
    registeredAt: '2024-02-10T16:45:00.000Z',
  },
  {
    chainId: 11155111,
    tokenId: 5,
    name: 'Epsilon Research Agent',
    description: 'Academic research assistant with web search capabilities',
    active: false,
    hasMcp: true,
    hasA2a: false,
    x402Support: false,
    mcpTools: ['web_search', 'summarize', 'cite'],
    reputationScore: 3.5,
    registeredAt: '2024-02-15T11:20:00.000Z',
  },
  {
    chainId: 11155111,
    tokenId: 6,
    name: 'Zeta Customer Support',
    description: 'Customer service agent with multi-language support',
    active: true,
    hasMcp: false,
    hasA2a: true,
    x402Support: false,
    a2aSkills: ['customer_support', 'ticket_management'],
    reputationScore: 4.3,
    registeredAt: '2024-02-20T08:00:00.000Z',
  },
  {
    chainId: 11155111,
    tokenId: 7,
    name: 'Eta Content Creator',
    description: 'Creative writing and content generation agent',
    active: true,
    hasMcp: true,
    hasA2a: false,
    x402Support: true,
    mcpTools: ['write_article', 'generate_image_prompt'],
    reputationScore: 3.9,
    registeredAt: '2024-03-01T13:00:00.000Z',
  },
  {
    chainId: 11155111,
    tokenId: 8,
    name: 'Theta Security Scanner',
    description: 'Security vulnerability detection and analysis agent',
    active: true,
    hasMcp: true,
    hasA2a: true,
    x402Support: false,
    mcpTools: ['scan_vulnerabilities', 'analyze_code'],
    a2aSkills: ['security_audit'],
    reputationScore: 4.7,
    registeredAt: '2024-03-05T15:30:00.000Z',
  },
  {
    chainId: 11155111,
    tokenId: 9,
    name: 'Iota Translation Service',
    description: 'Real-time translation agent supporting 50+ languages',
    active: true,
    hasMcp: false,
    hasA2a: false,
    x402Support: false,
    reputationScore: 4.1,
    registeredAt: '2024-03-10T10:15:00.000Z',
  },
  {
    chainId: 11155111,
    tokenId: 10,
    name: 'Kappa Health Advisor',
    description: 'Healthcare information and wellness recommendations agent',
    active: false,
    hasMcp: true,
    hasA2a: true,
    x402Support: true,
    mcpTools: ['symptom_check', 'medication_info'],
    a2aSkills: ['health_consultation'],
    reputationScore: 3.2,
    registeredAt: '2024-03-15T12:00:00.000Z',
  },
  {
    chainId: 11155111,
    tokenId: 11,
    name: 'Lambda Legal Assistant',
    description: 'Legal document analysis and contract review agent',
    active: true,
    hasMcp: true,
    hasA2a: false,
    x402Support: false,
    mcpTools: ['contract_review', 'legal_search'],
    reputationScore: 4.4,
    registeredAt: '2024-03-20T09:30:00.000Z',
  },
  {
    chainId: 11155111,
    tokenId: 12,
    name: 'Mu Financial Advisor',
    description: 'Personal finance and investment advice agent',
    active: true,
    hasMcp: false,
    hasA2a: true,
    x402Support: true,
    a2aSkills: ['financial_planning', 'investment_analysis'],
    reputationScore: 3.6,
    registeredAt: '2024-03-25T14:00:00.000Z',
  },
  {
    chainId: 11155111,
    tokenId: 13,
    name: 'Nu Education Tutor',
    description: 'Educational tutoring agent for K-12 and college subjects',
    active: true,
    hasMcp: true,
    hasA2a: true,
    x402Support: false,
    mcpTools: ['quiz_generate', 'explain_concept'],
    a2aSkills: ['tutoring', 'assessment'],
    reputationScore: 4.6,
    registeredAt: '2024-04-01T08:45:00.000Z',
  },
  {
    chainId: 11155111,
    tokenId: 14,
    name: 'Xi DevOps Agent',
    description: 'CI/CD pipeline management and infrastructure automation',
    active: true,
    hasMcp: true,
    hasA2a: false,
    x402Support: false,
    mcpTools: ['deploy', 'monitor', 'scale'],
    reputationScore: 4.8,
    registeredAt: '2024-04-05T16:00:00.000Z',
  },
  {
    chainId: 11155111,
    tokenId: 15,
    name: 'Omicron Marketing Agent',
    description: 'Digital marketing campaign management and analytics',
    active: false,
    hasMcp: false,
    hasA2a: true,
    x402Support: false,
    a2aSkills: ['campaign_management', 'analytics'],
    reputationScore: 3.3,
    registeredAt: '2024-04-10T11:00:00.000Z',
  },
  {
    chainId: 11155111,
    tokenId: 16,
    name: 'Pi Project Manager',
    description: 'Project planning and team coordination agent',
    active: true,
    hasMcp: true,
    hasA2a: true,
    x402Support: true,
    mcpTools: ['schedule', 'assign_tasks', 'track_progress'],
    a2aSkills: ['project_management'],
    reputationScore: 4.0,
    registeredAt: '2024-04-15T13:30:00.000Z',
  },
  {
    chainId: 11155111,
    tokenId: 17,
    name: 'Rho Quality Assurance',
    description: 'Software testing and quality assurance automation agent',
    active: true,
    hasMcp: true,
    hasA2a: false,
    x402Support: false,
    mcpTools: ['run_tests', 'generate_report'],
    reputationScore: 4.2,
    registeredAt: '2024-04-20T10:00:00.000Z',
  },
  {
    chainId: 11155111,
    tokenId: 18,
    name: 'Sigma Database Admin',
    description: 'Database optimization and management agent',
    active: true,
    hasMcp: false,
    hasA2a: false,
    x402Support: true,
    reputationScore: 3.7,
    registeredAt: '2024-04-25T15:15:00.000Z',
  },
  {
    chainId: 11155111,
    tokenId: 19,
    name: 'Tau Social Media Manager',
    description: 'Social media content scheduling and engagement agent',
    active: true,
    hasMcp: true,
    hasA2a: true,
    x402Support: false,
    mcpTools: ['post_content', 'analyze_engagement'],
    a2aSkills: ['social_media'],
    reputationScore: 3.4,
    registeredAt: '2024-05-01T09:00:00.000Z',
  },
  {
    chainId: 11155111,
    tokenId: 20,
    name: 'Upsilon Weather Agent',
    description: 'Weather forecasting and climate data analysis',
    active: false,
    hasMcp: false,
    hasA2a: true,
    x402Support: false,
    a2aSkills: ['weather_prediction'],
    reputationScore: 2.9,
    registeredAt: '2024-05-05T12:30:00.000Z',
  },

  // ========== BASE SEPOLIA (84532) - 15 agents ==========
  {
    chainId: 84532,
    tokenId: 1,
    name: 'Base Alpha NFT Minter',
    description: 'Automated NFT minting and collection management on Base',
    active: true,
    hasMcp: true,
    hasA2a: true,
    x402Support: true,
    mcpTools: ['mint_nft', 'list_nft'],
    a2aSkills: ['nft_management'],
    reputationScore: 4.3,
    registeredAt: '2024-01-25T10:00:00.000Z',
  },
  {
    chainId: 84532,
    tokenId: 2,
    name: 'Base Beta DeFi Optimizer',
    description: 'DeFi yield optimization and liquidity management',
    active: true,
    hasMcp: true,
    hasA2a: false,
    x402Support: true,
    mcpTools: ['optimize_yield', 'manage_liquidity'],
    reputationScore: 4.5,
    registeredAt: '2024-02-05T14:00:00.000Z',
  },
  {
    chainId: 84532,
    tokenId: 3,
    name: 'Base Gamma Bridge Agent',
    description: 'Cross-chain bridge operations and token transfers',
    active: true,
    hasMcp: false,
    hasA2a: true,
    x402Support: false,
    a2aSkills: ['bridge_tokens', 'cross_chain'],
    reputationScore: 3.9,
    registeredAt: '2024-02-15T09:30:00.000Z',
  },
  {
    chainId: 84532,
    tokenId: 4,
    name: 'Base Delta Governance',
    description: 'DAO governance participation and proposal management',
    active: true,
    hasMcp: true,
    hasA2a: true,
    x402Support: false,
    mcpTools: ['vote', 'create_proposal'],
    a2aSkills: ['governance'],
    reputationScore: 4.1,
    registeredAt: '2024-02-25T16:00:00.000Z',
  },
  {
    chainId: 84532,
    tokenId: 5,
    name: 'Base Epsilon Analytics',
    description: 'On-chain analytics and blockchain data visualization',
    active: false,
    hasMcp: true,
    hasA2a: false,
    x402Support: false,
    mcpTools: ['analyze_chain', 'generate_report'],
    reputationScore: 3.5,
    registeredAt: '2024-03-05T11:00:00.000Z',
  },
  {
    chainId: 84532,
    tokenId: 6,
    name: 'Base Zeta Staking Manager',
    description: 'Staking optimization and rewards management',
    active: true,
    hasMcp: false,
    hasA2a: true,
    x402Support: true,
    a2aSkills: ['staking', 'rewards'],
    reputationScore: 4.0,
    registeredAt: '2024-03-15T13:45:00.000Z',
  },
  {
    chainId: 84532,
    tokenId: 7,
    name: 'Base Eta Token Launcher',
    description: 'Token creation and launch management agent',
    active: true,
    hasMcp: true,
    hasA2a: false,
    x402Support: false,
    mcpTools: ['deploy_token', 'configure_tokenomics'],
    reputationScore: 3.7,
    registeredAt: '2024-03-25T10:30:00.000Z',
  },
  {
    chainId: 84532,
    tokenId: 8,
    name: 'Base Theta Arbitrage Bot',
    description: 'DEX arbitrage detection and execution agent',
    active: true,
    hasMcp: true,
    hasA2a: true,
    x402Support: true,
    mcpTools: ['find_arbitrage', 'execute_trade'],
    a2aSkills: ['arbitrage'],
    reputationScore: 4.6,
    registeredAt: '2024-04-02T15:00:00.000Z',
  },
  {
    chainId: 84532,
    tokenId: 9,
    name: 'Base Iota Airdrop Hunter',
    description: 'Airdrop tracking and participation automation',
    active: true,
    hasMcp: false,
    hasA2a: false,
    x402Support: false,
    reputationScore: 3.2,
    registeredAt: '2024-04-12T08:00:00.000Z',
  },
  {
    chainId: 84532,
    tokenId: 10,
    name: 'Base Kappa Gas Optimizer',
    description: 'Gas fee optimization and transaction timing agent',
    active: false,
    hasMcp: true,
    hasA2a: true,
    x402Support: false,
    mcpTools: ['estimate_gas', 'optimize_timing'],
    a2aSkills: ['gas_optimization'],
    reputationScore: 4.4,
    registeredAt: '2024-04-22T12:15:00.000Z',
  },
  {
    chainId: 84532,
    tokenId: 11,
    name: 'Base Lambda Lending Agent',
    description: 'DeFi lending and borrowing optimization',
    active: true,
    hasMcp: true,
    hasA2a: false,
    x402Support: true,
    mcpTools: ['lend', 'borrow', 'repay'],
    reputationScore: 4.2,
    registeredAt: '2024-05-01T14:30:00.000Z',
  },
  {
    chainId: 84532,
    tokenId: 12,
    name: 'Base Mu Portfolio Tracker',
    description: 'Multi-chain portfolio tracking and alerts',
    active: true,
    hasMcp: false,
    hasA2a: true,
    x402Support: false,
    a2aSkills: ['portfolio_tracking', 'alerts'],
    reputationScore: 3.8,
    registeredAt: '2024-05-10T09:45:00.000Z',
  },
  {
    chainId: 84532,
    tokenId: 13,
    name: 'Base Nu Smart Contract Auditor',
    description: 'Automated smart contract security analysis',
    active: true,
    hasMcp: true,
    hasA2a: true,
    x402Support: false,
    mcpTools: ['audit_contract', 'generate_report'],
    a2aSkills: ['security_audit'],
    reputationScore: 4.8,
    registeredAt: '2024-05-15T16:00:00.000Z',
  },
  {
    chainId: 84532,
    tokenId: 14,
    name: 'Base Xi Perpetuals Trader',
    description: 'Perpetual futures trading and risk management',
    active: true,
    hasMcp: true,
    hasA2a: false,
    x402Support: true,
    mcpTools: ['open_position', 'close_position', 'set_stop_loss'],
    reputationScore: 4.0,
    registeredAt: '2024-05-20T11:00:00.000Z',
  },
  {
    chainId: 84532,
    tokenId: 15,
    name: 'Base Omicron Options Writer',
    description: 'Options strategy execution and management',
    active: false,
    hasMcp: false,
    hasA2a: true,
    x402Support: false,
    a2aSkills: ['options_trading'],
    reputationScore: 3.4,
    registeredAt: '2024-05-25T13:30:00.000Z',
  },

  // ========== POLYGON AMOY (80002) - 15 agents ==========
  {
    chainId: 80002,
    tokenId: 1,
    name: 'Poly Alpha Gaming Agent',
    description: 'Play-to-earn gaming automation and optimization',
    active: true,
    hasMcp: true,
    hasA2a: true,
    x402Support: true,
    mcpTools: ['play_game', 'claim_rewards'],
    a2aSkills: ['gaming'],
    reputationScore: 4.2,
    registeredAt: '2024-02-01T10:00:00.000Z',
  },
  {
    chainId: 80002,
    tokenId: 2,
    name: 'Poly Beta Metaverse Builder',
    description: 'Virtual world creation and land management',
    active: true,
    hasMcp: true,
    hasA2a: false,
    x402Support: false,
    mcpTools: ['build_structure', 'manage_land'],
    reputationScore: 3.9,
    registeredAt: '2024-02-10T14:30:00.000Z',
  },
  {
    chainId: 80002,
    tokenId: 3,
    name: 'Poly Gamma Music NFT Agent',
    description: 'Music NFT creation and royalty management',
    active: true,
    hasMcp: false,
    hasA2a: true,
    x402Support: true,
    a2aSkills: ['music_nft', 'royalty_distribution'],
    reputationScore: 4.0,
    registeredAt: '2024-02-20T09:00:00.000Z',
  },
  {
    chainId: 80002,
    tokenId: 4,
    name: 'Poly Delta Art Generator',
    description: 'AI-powered art generation and NFT minting',
    active: true,
    hasMcp: true,
    hasA2a: true,
    x402Support: false,
    mcpTools: ['generate_art', 'mint_art_nft'],
    a2aSkills: ['art_generation'],
    reputationScore: 4.5,
    registeredAt: '2024-03-01T15:00:00.000Z',
  },
  {
    chainId: 80002,
    tokenId: 5,
    name: 'Poly Epsilon Ticketing Agent',
    description: 'Event ticketing and verification on blockchain',
    active: false,
    hasMcp: true,
    hasA2a: false,
    x402Support: false,
    mcpTools: ['create_ticket', 'verify_ticket'],
    reputationScore: 3.6,
    registeredAt: '2024-03-10T11:30:00.000Z',
  },
  {
    chainId: 80002,
    tokenId: 6,
    name: 'Poly Zeta Identity Manager',
    description: 'Decentralized identity and credential management',
    active: true,
    hasMcp: false,
    hasA2a: true,
    x402Support: true,
    a2aSkills: ['identity_verification', 'credential_issuance'],
    reputationScore: 4.3,
    registeredAt: '2024-03-20T13:00:00.000Z',
  },
  {
    chainId: 80002,
    tokenId: 7,
    name: 'Poly Eta Supply Chain',
    description: 'Supply chain tracking and verification agent',
    active: true,
    hasMcp: true,
    hasA2a: false,
    x402Support: false,
    mcpTools: ['track_shipment', 'verify_origin'],
    reputationScore: 4.1,
    registeredAt: '2024-03-30T10:00:00.000Z',
  },
  {
    chainId: 80002,
    tokenId: 8,
    name: 'Poly Theta Voting System',
    description: 'Secure blockchain-based voting and polling',
    active: true,
    hasMcp: true,
    hasA2a: true,
    x402Support: false,
    mcpTools: ['create_poll', 'cast_vote', 'tally_results'],
    a2aSkills: ['voting'],
    reputationScore: 4.7,
    registeredAt: '2024-04-05T16:45:00.000Z',
  },
  {
    chainId: 80002,
    tokenId: 9,
    name: 'Poly Iota Charity Tracker',
    description: 'Charitable donation tracking and transparency',
    active: true,
    hasMcp: false,
    hasA2a: false,
    x402Support: false,
    reputationScore: 4.4,
    registeredAt: '2024-04-15T09:15:00.000Z',
  },
  {
    chainId: 80002,
    tokenId: 10,
    name: 'Poly Kappa Real Estate',
    description: 'Tokenized real estate investment and management',
    active: false,
    hasMcp: true,
    hasA2a: true,
    x402Support: true,
    mcpTools: ['invest', 'manage_property'],
    a2aSkills: ['real_estate'],
    reputationScore: 3.3,
    registeredAt: '2024-04-25T14:00:00.000Z',
  },
  {
    chainId: 80002,
    tokenId: 11,
    name: 'Poly Lambda Carbon Credits',
    description: 'Carbon credit trading and offset verification',
    active: true,
    hasMcp: true,
    hasA2a: false,
    x402Support: false,
    mcpTools: ['buy_credits', 'verify_offset'],
    reputationScore: 4.0,
    registeredAt: '2024-05-05T11:30:00.000Z',
  },
  {
    chainId: 80002,
    tokenId: 12,
    name: 'Poly Mu Loyalty Program',
    description: 'Blockchain loyalty points and rewards management',
    active: true,
    hasMcp: false,
    hasA2a: true,
    x402Support: true,
    a2aSkills: ['loyalty_rewards'],
    reputationScore: 3.8,
    registeredAt: '2024-05-15T13:00:00.000Z',
  },
  {
    chainId: 80002,
    tokenId: 13,
    name: 'Poly Nu Insurance Agent',
    description: 'Decentralized insurance and claims processing',
    active: true,
    hasMcp: true,
    hasA2a: true,
    x402Support: false,
    mcpTools: ['create_policy', 'process_claim'],
    a2aSkills: ['insurance'],
    reputationScore: 4.2,
    registeredAt: '2024-05-20T10:00:00.000Z',
  },
  {
    chainId: 80002,
    tokenId: 14,
    name: 'Poly Xi Escrow Service',
    description: 'Smart contract escrow for secure transactions',
    active: true,
    hasMcp: true,
    hasA2a: false,
    x402Support: true,
    mcpTools: ['create_escrow', 'release_funds'],
    reputationScore: 4.6,
    registeredAt: '2024-05-25T15:30:00.000Z',
  },
  {
    chainId: 80002,
    tokenId: 15,
    name: 'Poly Omicron IP Registry',
    description: 'Intellectual property registration and licensing',
    active: false,
    hasMcp: false,
    hasA2a: true,
    x402Support: false,
    a2aSkills: ['ip_management', 'licensing'],
    reputationScore: 3.1,
    registeredAt: '2024-06-01T12:00:00.000Z',
  },
];

/**
 * All mock agents as AgentSummary (for list endpoints)
 */
export const MOCK_AGENTS_SUMMARY: AgentSummary[] = AGENT_CONFIGS.map(createAgentSummary);

/**
 * All mock agents as AgentDetail (for detail endpoints)
 */
export const MOCK_AGENTS_DETAIL: AgentDetail[] = AGENT_CONFIGS.map(createAgentDetail);

/**
 * Agent configs with reputation scores (for reputation-based queries)
 */
export const MOCK_AGENT_REPUTATION: Map<string, number> = new Map(
  AGENT_CONFIGS.filter(
    (c): c is MockAgentConfig & { reputationScore: number } => c.reputationScore !== undefined
  ).map((c) => [agentId(c.chainId, c.tokenId), c.reputationScore])
);

/**
 * Get mock agent summary by ID
 */
export function getMockAgentSummary(id: string): AgentSummary | undefined {
  return MOCK_AGENTS_SUMMARY.find((a) => a.id === id);
}

/**
 * Get mock agent detail by ID
 */
export function getMockAgentDetail(id: string): AgentDetail | undefined {
  return MOCK_AGENTS_DETAIL.find((a) => a.id === id);
}

/**
 * Get mock agent detail by chainId and tokenId
 */
export function getMockAgentByChainAndToken(
  chainId: number,
  tokenId: string
): AgentDetail | undefined {
  const id = `${chainId}:${tokenId}`;
  return getMockAgentDetail(id);
}

/**
 * Get agents count by chain
 */
export function getMockAgentCountByChain(): Map<number, number> {
  const counts = new Map<number, number>();
  for (const agent of MOCK_AGENTS_SUMMARY) {
    counts.set(agent.chainId, (counts.get(agent.chainId) || 0) + 1);
  }
  return counts;
}
