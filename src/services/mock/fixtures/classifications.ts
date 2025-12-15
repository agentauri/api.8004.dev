/**
 * Mock OASF classification fixtures for E2E testing
 * @module services/mock/fixtures/classifications
 *
 * Provides deterministic OASF classifications for mock agents
 */

import type { DomainClassification, OASFClassification, SkillClassification } from '@/types';

/**
 * Create a skill classification with confidence
 */
function skill(slug: string, confidence: number): SkillClassification {
  return { slug, confidence };
}

/**
 * Create a domain classification with confidence
 */
function domain(slug: string, confidence: number): DomainClassification {
  return { slug, confidence };
}

/**
 * Create an OASF classification
 */
function classification(
  skills: SkillClassification[],
  domains: DomainClassification[],
  confidence = 0.85
): OASFClassification {
  return {
    skills,
    domains,
    confidence,
    classifiedAt: '2024-06-01T12:00:00.000Z',
    modelVersion: 'mock-1.0.0',
    source: 'llm-classification',
  };
}

/**
 * Mock OASF classifications by agent ID
 *
 * Skills used (matching OASF taxonomy):
 * - natural_language_processing
 * - code_generation
 * - data_analysis
 * - tool_interaction
 * - web_browsing
 * - conversation
 * - content_creation
 * - image_generation
 * - audio_processing
 * - blockchain_interaction
 *
 * Domains used (matching OASF taxonomy):
 * - technology
 * - finance
 * - healthcare
 * - education
 * - entertainment
 * - security
 * - marketing
 * - legal
 * - gaming
 * - art
 */
export const MOCK_CLASSIFICATIONS: Map<string, OASFClassification> = new Map([
  // ========== SEPOLIA AGENTS ==========
  [
    '11155111:1', // Alpha AI Assistant
    classification(
      [
        skill('natural_language_processing', 0.95),
        skill('tool_interaction', 0.88),
        skill('conversation', 0.92),
      ],
      [domain('technology', 0.9), domain('general', 0.85)],
      0.9
    ),
  ],
  [
    '11155111:2', // Beta Code Generator
    classification(
      [skill('code_generation', 0.95), skill('tool_interaction', 0.85)],
      [domain('technology', 0.95), domain('software_development', 0.9)],
      0.92
    ),
  ],
  [
    '11155111:3', // Gamma Data Analyst
    classification(
      [skill('data_analysis', 0.92), skill('natural_language_processing', 0.78)],
      [domain('technology', 0.88), domain('business', 0.75)],
      0.85
    ),
  ],
  [
    '11155111:4', // Delta Trading Bot
    classification(
      [
        skill('blockchain_interaction', 0.9),
        skill('data_analysis', 0.85),
        skill('tool_interaction', 0.88),
      ],
      [domain('finance', 0.95), domain('trading', 0.92)],
      0.9
    ),
  ],
  [
    '11155111:5', // Epsilon Research Agent
    classification(
      [
        skill('web_browsing', 0.9),
        skill('natural_language_processing', 0.88),
        skill('content_creation', 0.75),
      ],
      [domain('education', 0.85), domain('research', 0.9)],
      0.86
    ),
  ],
  [
    '11155111:6', // Zeta Customer Support
    classification(
      [skill('conversation', 0.95), skill('natural_language_processing', 0.9)],
      [domain('customer_service', 0.92), domain('business', 0.8)],
      0.91
    ),
  ],
  [
    '11155111:7', // Eta Content Creator
    classification(
      [skill('content_creation', 0.95), skill('natural_language_processing', 0.88)],
      [domain('marketing', 0.85), domain('media', 0.82)],
      0.88
    ),
  ],
  [
    '11155111:8', // Theta Security Scanner
    classification(
      [
        skill('code_generation', 0.75),
        skill('tool_interaction', 0.92),
        skill('data_analysis', 0.85),
      ],
      [domain('security', 0.95), domain('technology', 0.88)],
      0.9
    ),
  ],
  [
    '11155111:9', // Iota Translation Service
    classification(
      [skill('natural_language_processing', 0.98), skill('conversation', 0.85)],
      [domain('language', 0.95), domain('general', 0.8)],
      0.92
    ),
  ],
  [
    '11155111:10', // Kappa Health Advisor
    classification(
      [
        skill('natural_language_processing', 0.85),
        skill('conversation', 0.88),
        skill('data_analysis', 0.72),
      ],
      [domain('healthcare', 0.92), domain('wellness', 0.85)],
      0.84
    ),
  ],
  [
    '11155111:11', // Lambda Legal Assistant
    classification(
      [
        skill('natural_language_processing', 0.9),
        skill('tool_interaction', 0.82),
        skill('data_analysis', 0.78),
      ],
      [domain('legal', 0.95), domain('business', 0.75)],
      0.87
    ),
  ],
  [
    '11155111:12', // Mu Financial Advisor
    classification(
      [skill('data_analysis', 0.88), skill('conversation', 0.85)],
      [domain('finance', 0.95), domain('personal_finance', 0.9)],
      0.89
    ),
  ],
  [
    '11155111:13', // Nu Education Tutor
    classification(
      [
        skill('natural_language_processing', 0.92),
        skill('conversation', 0.95),
        skill('content_creation', 0.8),
      ],
      [domain('education', 0.98), domain('tutoring', 0.95)],
      0.94
    ),
  ],
  [
    '11155111:14', // Xi DevOps Agent
    classification(
      [skill('tool_interaction', 0.95), skill('code_generation', 0.88)],
      [domain('technology', 0.95), domain('devops', 0.98)],
      0.93
    ),
  ],
  [
    '11155111:15', // Omicron Marketing Agent
    classification(
      [skill('content_creation', 0.85), skill('data_analysis', 0.82)],
      [domain('marketing', 0.95), domain('business', 0.85)],
      0.86
    ),
  ],
  [
    '11155111:16', // Pi Project Manager
    classification(
      [skill('tool_interaction', 0.9), skill('conversation', 0.88), skill('data_analysis', 0.78)],
      [domain('business', 0.9), domain('project_management', 0.95)],
      0.88
    ),
  ],
  [
    '11155111:17', // Rho Quality Assurance
    classification(
      [skill('tool_interaction', 0.92), skill('code_generation', 0.8)],
      [domain('technology', 0.88), domain('quality_assurance', 0.95)],
      0.89
    ),
  ],
  [
    '11155111:18', // Sigma Database Admin
    classification(
      [skill('tool_interaction', 0.85), skill('data_analysis', 0.9)],
      [domain('technology', 0.92), domain('database', 0.95)],
      0.9
    ),
  ],
  [
    '11155111:19', // Tau Social Media Manager
    classification(
      [skill('content_creation', 0.9), skill('tool_interaction', 0.85)],
      [domain('marketing', 0.92), domain('social_media', 0.95)],
      0.89
    ),
  ],
  [
    '11155111:20', // Upsilon Weather Agent
    classification(
      [skill('data_analysis', 0.88), skill('natural_language_processing', 0.75)],
      [domain('weather', 0.95), domain('general', 0.7)],
      0.82
    ),
  ],

  // ========== BASE SEPOLIA AGENTS ==========
  [
    '84532:1', // Base Alpha NFT Minter
    classification(
      [skill('blockchain_interaction', 0.95), skill('tool_interaction', 0.9)],
      [domain('art', 0.85), domain('nft', 0.95)],
      0.91
    ),
  ],
  [
    '84532:2', // Base Beta DeFi Optimizer
    classification(
      [
        skill('blockchain_interaction', 0.95),
        skill('data_analysis', 0.9),
        skill('tool_interaction', 0.92),
      ],
      [domain('finance', 0.95), domain('defi', 0.98)],
      0.94
    ),
  ],
  [
    '84532:3', // Base Gamma Bridge Agent
    classification(
      [skill('blockchain_interaction', 0.98)],
      [domain('finance', 0.85), domain('blockchain', 0.95)],
      0.9
    ),
  ],
  [
    '84532:4', // Base Delta Governance
    classification(
      [skill('blockchain_interaction', 0.92), skill('conversation', 0.78)],
      [domain('governance', 0.95), domain('blockchain', 0.88)],
      0.88
    ),
  ],
  [
    '84532:5', // Base Epsilon Analytics
    classification(
      [skill('data_analysis', 0.95), skill('natural_language_processing', 0.78)],
      [domain('technology', 0.88), domain('analytics', 0.95)],
      0.9
    ),
  ],
  [
    '84532:6', // Base Zeta Staking Manager
    classification(
      [skill('blockchain_interaction', 0.95), skill('tool_interaction', 0.88)],
      [domain('finance', 0.9), domain('staking', 0.95)],
      0.91
    ),
  ],
  [
    '84532:7', // Base Eta Token Launcher
    classification(
      [skill('blockchain_interaction', 0.95), skill('tool_interaction', 0.9)],
      [domain('finance', 0.85), domain('token', 0.95)],
      0.89
    ),
  ],
  [
    '84532:8', // Base Theta Arbitrage Bot
    classification(
      [
        skill('blockchain_interaction', 0.95),
        skill('data_analysis', 0.92),
        skill('tool_interaction', 0.95),
      ],
      [domain('finance', 0.98), domain('trading', 0.98)],
      0.96
    ),
  ],
  [
    '84532:9', // Base Iota Airdrop Hunter
    classification(
      [skill('blockchain_interaction', 0.85), skill('web_browsing', 0.8)],
      [domain('finance', 0.78), domain('blockchain', 0.85)],
      0.8
    ),
  ],
  [
    '84532:10', // Base Kappa Gas Optimizer
    classification(
      [skill('blockchain_interaction', 0.92), skill('data_analysis', 0.88)],
      [domain('technology', 0.9), domain('blockchain', 0.95)],
      0.9
    ),
  ],
  [
    '84532:11', // Base Lambda Lending Agent
    classification(
      [skill('blockchain_interaction', 0.95), skill('tool_interaction', 0.9)],
      [domain('finance', 0.95), domain('lending', 0.98)],
      0.93
    ),
  ],
  [
    '84532:12', // Base Mu Portfolio Tracker
    classification(
      [skill('data_analysis', 0.92), skill('blockchain_interaction', 0.85)],
      [domain('finance', 0.95), domain('portfolio', 0.92)],
      0.9
    ),
  ],
  [
    '84532:13', // Base Nu Smart Contract Auditor
    classification(
      [
        skill('code_generation', 0.88),
        skill('tool_interaction', 0.92),
        skill('data_analysis', 0.85),
      ],
      [domain('security', 0.98), domain('blockchain', 0.95)],
      0.93
    ),
  ],
  [
    '84532:14', // Base Xi Perpetuals Trader
    classification(
      [
        skill('blockchain_interaction', 0.95),
        skill('data_analysis', 0.9),
        skill('tool_interaction', 0.92),
      ],
      [domain('finance', 0.98), domain('trading', 0.95)],
      0.94
    ),
  ],
  [
    '84532:15', // Base Omicron Options Writer
    classification(
      [skill('blockchain_interaction', 0.88), skill('data_analysis', 0.85)],
      [domain('finance', 0.95), domain('trading', 0.9)],
      0.87
    ),
  ],

  // ========== POLYGON AMOY AGENTS ==========
  [
    '80002:1', // Poly Alpha Gaming Agent
    classification(
      [skill('blockchain_interaction', 0.9), skill('tool_interaction', 0.92)],
      [domain('gaming', 0.98), domain('entertainment', 0.9)],
      0.92
    ),
  ],
  [
    '80002:2', // Poly Beta Metaverse Builder
    classification(
      [skill('tool_interaction', 0.9), skill('content_creation', 0.85)],
      [domain('gaming', 0.88), domain('metaverse', 0.95)],
      0.88
    ),
  ],
  [
    '80002:3', // Poly Gamma Music NFT Agent
    classification(
      [skill('blockchain_interaction', 0.88), skill('audio_processing', 0.85)],
      [domain('art', 0.9), domain('music', 0.95)],
      0.88
    ),
  ],
  [
    '80002:4', // Poly Delta Art Generator
    classification(
      [
        skill('image_generation', 0.95),
        skill('blockchain_interaction', 0.85),
        skill('content_creation', 0.9),
      ],
      [domain('art', 0.98), domain('nft', 0.9)],
      0.93
    ),
  ],
  [
    '80002:5', // Poly Epsilon Ticketing Agent
    classification(
      [skill('blockchain_interaction', 0.88), skill('tool_interaction', 0.85)],
      [domain('entertainment', 0.9), domain('events', 0.95)],
      0.87
    ),
  ],
  [
    '80002:6', // Poly Zeta Identity Manager
    classification(
      [skill('blockchain_interaction', 0.92), skill('data_analysis', 0.78)],
      [domain('security', 0.9), domain('identity', 0.95)],
      0.88
    ),
  ],
  [
    '80002:7', // Poly Eta Supply Chain
    classification(
      [
        skill('blockchain_interaction', 0.9),
        skill('data_analysis', 0.85),
        skill('tool_interaction', 0.88),
      ],
      [domain('logistics', 0.95), domain('supply_chain', 0.98)],
      0.91
    ),
  ],
  [
    '80002:8', // Poly Theta Voting System
    classification(
      [skill('blockchain_interaction', 0.95), skill('tool_interaction', 0.9)],
      [domain('governance', 0.98), domain('voting', 0.98)],
      0.95
    ),
  ],
  [
    '80002:9', // Poly Iota Charity Tracker
    classification(
      [skill('blockchain_interaction', 0.85), skill('data_analysis', 0.82)],
      [domain('nonprofit', 0.95), domain('charity', 0.95)],
      0.87
    ),
  ],
  [
    '80002:10', // Poly Kappa Real Estate
    classification(
      [skill('blockchain_interaction', 0.88), skill('data_analysis', 0.85)],
      [domain('real_estate', 0.95), domain('finance', 0.85)],
      0.87
    ),
  ],
  [
    '80002:11', // Poly Lambda Carbon Credits
    classification(
      [skill('blockchain_interaction', 0.9), skill('data_analysis', 0.82)],
      [domain('environment', 0.95), domain('sustainability', 0.92)],
      0.88
    ),
  ],
  [
    '80002:12', // Poly Mu Loyalty Program
    classification(
      [skill('blockchain_interaction', 0.85), skill('tool_interaction', 0.82)],
      [domain('marketing', 0.88), domain('retail', 0.85)],
      0.84
    ),
  ],
  [
    '80002:13', // Poly Nu Insurance Agent
    classification(
      [
        skill('blockchain_interaction', 0.9),
        skill('data_analysis', 0.85),
        skill('conversation', 0.8),
      ],
      [domain('insurance', 0.95), domain('finance', 0.88)],
      0.88
    ),
  ],
  [
    '80002:14', // Poly Xi Escrow Service
    classification(
      [skill('blockchain_interaction', 0.95), skill('tool_interaction', 0.92)],
      [domain('finance', 0.9), domain('legal', 0.85)],
      0.9
    ),
  ],
  [
    '80002:15', // Poly Omicron IP Registry
    classification(
      [skill('blockchain_interaction', 0.85), skill('data_analysis', 0.78)],
      [domain('legal', 0.92), domain('intellectual_property', 0.95)],
      0.86
    ),
  ],
]);

/**
 * Get OASF classification for an agent
 */
export function getMockClassification(agentId: string): OASFClassification | undefined {
  return MOCK_CLASSIFICATIONS.get(agentId);
}

/**
 * Get all agents with a specific skill
 */
export function getAgentsBySkill(skillSlug: string): string[] {
  const results: string[] = [];
  for (const [agentId, classification] of MOCK_CLASSIFICATIONS) {
    if (classification.skills.some((s) => s.slug === skillSlug || s.slug.startsWith(skillSlug))) {
      results.push(agentId);
    }
  }
  return results;
}

/**
 * Get all agents with a specific domain
 */
export function getAgentsByDomain(domainSlug: string): string[] {
  const results: string[] = [];
  for (const [agentId, classification] of MOCK_CLASSIFICATIONS) {
    if (
      classification.domains.some((d) => d.slug === domainSlug || d.slug.startsWith(domainSlug))
    ) {
      results.push(agentId);
    }
  }
  return results;
}

/**
 * List of unique skills across all classifications
 */
export const MOCK_SKILL_SLUGS: string[] = [
  'natural_language_processing',
  'code_generation',
  'data_analysis',
  'tool_interaction',
  'web_browsing',
  'conversation',
  'content_creation',
  'image_generation',
  'audio_processing',
  'blockchain_interaction',
];

/**
 * List of unique domains across all classifications
 */
export const MOCK_DOMAIN_SLUGS: string[] = [
  'technology',
  'finance',
  'healthcare',
  'education',
  'entertainment',
  'security',
  'marketing',
  'legal',
  'gaming',
  'art',
  'defi',
  'nft',
  'blockchain',
  'governance',
  'trading',
];
