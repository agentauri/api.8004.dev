/**
 * Types for Comprehensive Consistency Tests
 */

export interface Agent {
  id: string;
  chainId: number;
  tokenId: string;
  name: string;
  description?: string;
  image?: string;
  active?: boolean;
  hasMcp?: boolean;
  hasA2a?: boolean;
  x402Support?: boolean;
  searchScore?: number;
  matchReasons?: string[];
  oasf?: {
    skills?: Array<{ slug: string; confidence: number }>;
    domains?: Array<{ slug: string; confidence: number }>;
    confidence?: number;
  };
  reputationScore?: number;
  reputationCount?: number;
  operators?: string[];
  ens?: string;
  did?: string;
  supportedTrust?: string[];
}

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  code?: string;
  meta?: {
    total?: number;
    hasMore?: boolean;
    nextCursor?: string;
    query?: string;
    byChain?: Record<string, number>;
    searchMode?: 'vector' | 'fallback';
  };
}

export interface TestResult {
  name: string;
  passed: boolean;
  duration: number;
  error?: string;
  details?: {
    apiCount?: number;
    sdkCount?: number;
    searchCount?: number;
    differences?: string[];
  };
}

export interface ConsistencyTestConfig {
  name: string;
  description: string;
  apiParams: Record<string, unknown>;
  sdkParams?: Record<string, unknown>;
  searchParams?: Record<string, unknown>;
  expectedBehavior?: string;
  skipSdk?: boolean;
  skipSearch?: boolean;
}

// All supported filters
export const ALL_FILTERS = {
  // Chain filters
  chainIds: [11155111, 84532, 80002, 59141, 296, 998, 1351057110],

  // Boolean filters
  booleanFilters: ['active', 'mcp', 'a2a', 'x402', 'hasRegistrationFile'] as const,

  // OASF filters (actual skills/domains indexed in Qdrant)
  skills: [
    'natural_language_processing',
    'analytical_skills',
    'retrieval_augmented_generation',
    'tool_interaction',
    'agent_orchestration',
  ],
  domains: [
    'technology',
    'finance_business',
    'research_development',
    'education',
    'media_entertainment',
  ],

  // Sorting options
  sortFields: ['relevance', 'name', 'createdAt', 'reputation'] as const,
  sortOrders: ['asc', 'desc'] as const,

  // Pagination
  limits: [1, 5, 10, 20, 50, 100],

  // Filter modes
  filterModes: ['AND', 'OR'] as const,

  // Search modes
  searchModes: ['semantic', 'name', 'auto'] as const,

  // Reputation range (0-100)
  reputationRanges: [
    { minRep: 0, maxRep: 25 },
    { minRep: 25, maxRep: 50 },
    { minRep: 50, maxRep: 75 },
    { minRep: 75, maxRep: 100 },
  ],

  // Reachability filters
  reachabilityFilters: ['reachableA2a', 'reachableMcp'] as const,

  // Trust filters
  trustModels: ['x402', 'eas'],
};

// Common search queries for testing
export const SEARCH_QUERIES = [
  'AI',
  'crypto',
  'data',
  'assistant',
  'helper',
  'analysis',
  'blockchain',
  'defi',
  'nft',
];
