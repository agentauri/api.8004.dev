/**
 * Request validation schemas using Zod
 * @module lib/utils/validation
 */

import { z } from 'zod';

/**
 * Maximum string lengths for validation
 * SECURITY: Prevents DoS attacks via extremely long strings
 */
const MAX_LENGTHS = {
  QUERY: 500, // Search query
  SKILL: 100, // Individual skill/domain name
  ADDRESS: 42, // Ethereum address (0x + 40 hex chars)
  ENS: 100, // ENS domain name
  DID: 200, // DID identifier
  CURSOR: 500, // Pagination cursor
  VERSION: 50, // Version string (e.g., "2024-11-05")
  TRUST_MODEL: 50, // Trust model name
  ARRAY_ITEMS: 50, // Max items in filter arrays
} as const;

/**
 * Factory for creating array filter schemas (CSV and bracket notation)
 * Reduces repetition for skills, domains, mcpTools, a2aSkills, etc.
 * @param maxItemLength - Maximum length of each item in the array
 */
function createArrayFilterSchemas(maxItemLength: number) {
  return {
    /** CSV format: "item1,item2,item3" */
    csv: z
      .string()
      .max(maxItemLength * MAX_LENGTHS.ARRAY_ITEMS)
      .transform((val) =>
        val
          .split(',')
          .map((s) => s.trim().slice(0, maxItemLength))
          .filter((s) => s.length > 0)
          .slice(0, MAX_LENGTHS.ARRAY_ITEMS)
      )
      .optional(),
    /** Bracket notation: param[]=item1&param[]=item2 */
    bracket: z
      .union([
        z.string().max(maxItemLength),
        z.array(z.string().max(maxItemLength)).max(MAX_LENGTHS.ARRAY_ITEMS),
      ])
      .transform((val) => (Array.isArray(val) ? val : [val]).slice(0, MAX_LENGTHS.ARRAY_ITEMS))
      .optional(),
  };
}

// Pre-built array filter schemas for common field types
const skillArrayFilters = createArrayFilterSchemas(MAX_LENGTHS.SKILL);
const addressArrayFilters = createArrayFilterSchemas(MAX_LENGTHS.ADDRESS);
const trustModelArrayFilters = createArrayFilterSchemas(MAX_LENGTHS.TRUST_MODEL);

/**
 * Supported chain IDs - chains with active subgraph deployments
 * Mainnets: Ethereum (1), Polygon (137), Base (8453), BSC (56), Monad (143)
 * Testnets: Ethereum Sepolia (11155111), Base Sepolia (84532), BSC Testnet (97), Monad Testnet (10143)
 */
export const SUPPORTED_CHAIN_IDS = [
  // Mainnets
  1, 137, 8453, 56, 143,
  // Testnets
  11155111, 84532, 97, 10143,
] as const;

/**
 * Chain ID validation schema
 */
export const chainIdSchema = z.coerce
  .number()
  .refine((val) => SUPPORTED_CHAIN_IDS.includes(val as (typeof SUPPORTED_CHAIN_IDS)[number]), {
    message: `Chain ID must be one of: ${SUPPORTED_CHAIN_IDS.join(', ')}`,
  });

/**
 * Maximum safe integer for tokenId validation
 * SECURITY: Prevents BigInt overflow attacks
 */
const MAX_SAFE_TOKEN_ID = BigInt(Number.MAX_SAFE_INTEGER);

/**
 * Agent ID validation (format: chainId:tokenId)
 * SECURITY: Validates both parts are within safe numeric ranges
 */
export const agentIdSchema = z
  .string()
  .regex(/^\d+:\d+$/, {
    message: 'Agent ID must be in format chainId:tokenId (e.g., "11155111:123")',
  })
  .refine(
    (val) => {
      const [chainIdStr, tokenIdStr] = val.split(':');
      if (!chainIdStr || !tokenIdStr) return false;
      try {
        // Validate chainId is within safe integer range
        const chainId = Number.parseInt(chainIdStr, 10);
        if (!Number.isSafeInteger(chainId) || chainId < 0) return false;
        // Validate tokenId is within safe range (BigInt comparison)
        const tokenId = BigInt(tokenIdStr);
        if (tokenId < 0n || tokenId > MAX_SAFE_TOKEN_ID) return false;
        return true;
      } catch {
        return false;
      }
    },
    { message: 'Agent ID contains invalid or out-of-range values' }
  );

/**
 * Parse agent ID into components
 * Returns default values (chainId: 0, tokenId: '0') if format is invalid
 */
export function parseAgentId(agentId: string): { chainId: number; tokenId: string } {
  const [chainIdStr = '0', tokenId = '0'] = agentId.split(':');
  return {
    chainId: Number.parseInt(chainIdStr, 10),
    tokenId,
  };
}

/**
 * Validate and parse agent ID into components
 * Returns null if format is invalid (not chainId:tokenId)
 * Use this when you need to validate user input
 */
export function validateAndParseAgentId(
  agentId: string
): { chainId: number; tokenId: string } | null {
  const parts = agentId.split(':');
  if (parts.length !== 2) return null;
  const chainId = Number.parseInt(parts[0] || '', 10);
  const tokenId = parts[1] || '';
  if (Number.isNaN(chainId) || !tokenId) return null;
  return { chainId, tokenId };
}

/**
 * Boolean from string (handles 'true'/'false' strings correctly)
 */
const stringBooleanSchema = z
  .string()
  .transform((val) => val.toLowerCase() === 'true')
  .pipe(z.boolean());

/**
 * Chain IDs schema - supports multiple formats:
 * - CSV string: "11155111,84532"
 * - Single string: "11155111"
 * - Array of strings: ["11155111", "84532"] (from chainIds[]=X&chainIds[]=Y)
 */
const chainsSchema = z
  .union([
    // Array format (from URL like chainIds[]=X&chainIds[]=Y)
    z.array(z.coerce.number()),
    // CSV string format (from URL like chains=X,Y)
    z
      .string()
      .transform((val) =>
        val
          .split(',')
          .map((s) => s.trim())
          .filter((s) => s.length > 0)
          .map((s) => Number.parseInt(s, 10))
      ),
  ])
  .refine(
    (arr) =>
      arr.every((id) => SUPPORTED_CHAIN_IDS.includes(id as (typeof SUPPORTED_CHAIN_IDS)[number])),
    { message: `All chain IDs must be one of: ${SUPPORTED_CHAIN_IDS.join(', ')}` }
  );

/**
 * Valid sort fields for agent listing
 * Default is createdAt (newest first) for consistent ordering
 */
export const sortFieldSchema = z
  .enum(['relevance', 'name', 'createdAt', 'reputation'])
  .default('createdAt');

/**
 * Sort order schema
 */
export const sortOrderSchema = z.enum(['asc', 'desc']).default('desc');

/**
 * Search mode input schema
 * - 'semantic': Use semantic/vector search (default)
 * - 'name': Use SDK name substring search
 * - 'auto': Try semantic first, fall back to name if no results
 */
export const searchModeInputSchema = z.enum(['semantic', 'name', 'auto']).default('auto');

/**
 * Limit schema with clamping behavior
 * - Minimum: 1 (still errors if < 1)
 * - Maximum: 100 (clamps to 100 instead of erroring)
 * - Default: 20
 */
const limitSchema = z.coerce
  .number()
  .int()
  .min(1)
  .transform((val) => Math.min(val, 100))
  .default(20);

/**
 * Limit schema for JSON body (no coercion needed)
 */
const limitBodySchema = z
  .number()
  .int()
  .min(1)
  .transform((val) => Math.min(val, 100))
  .default(20);

/**
 * List agents query parameters schema
 */
export const listAgentsQuerySchema = z.object({
  q: z.string().min(1).max(MAX_LENGTHS.QUERY).optional(),
  chainId: chainIdSchema.optional(),
  chains: chainsSchema.optional(),
  // Alias for chains - supports chainIds=X,Y format
  chainIds: chainsSchema.optional(),
  // Alias with brackets - supports chainIds[]=X&chainIds[]=Y format (URL standard array notation)
  'chainIds[]': chainsSchema.optional(),
  active: stringBooleanSchema.optional(),
  mcp: stringBooleanSchema.optional(),
  a2a: stringBooleanSchema.optional(),
  x402: stringBooleanSchema.optional(),
  hasRegistrationFile: stringBooleanSchema.optional(),
  // Array filters - support both CSV (param=a,b) and bracket notation (param[]=a&param[]=b)
  skills: skillArrayFilters.csv,
  'skills[]': skillArrayFilters.bracket,
  domains: skillArrayFilters.csv,
  'domains[]': skillArrayFilters.bracket,
  mcpTools: skillArrayFilters.csv,
  'mcpTools[]': skillArrayFilters.bracket,
  a2aSkills: skillArrayFilters.csv,
  'a2aSkills[]': skillArrayFilters.bracket,
  filterMode: z.enum(['AND', 'OR']).optional(),
  minScore: z.coerce.number().min(0).max(1).optional(),
  minRep: z.coerce.number().min(0).max(100).optional(),
  maxRep: z.coerce.number().min(0).max(100).optional(),
  // Wallet filters
  owner: z.string().max(MAX_LENGTHS.ADDRESS).optional(),
  walletAddress: z.string().max(MAX_LENGTHS.ADDRESS).optional(),
  /** Filter by wallet verified status (ERC-8004 v1.0) */
  walletVerified: stringBooleanSchema.optional(),
  // Trust model filters
  trustModels: trustModelArrayFilters.csv,
  hasTrusts: stringBooleanSchema.optional(),
  // Exact match filters (new)
  ens: z.string().max(MAX_LENGTHS.ENS).optional(),
  did: z.string().max(MAX_LENGTHS.DID).optional(),
  // Exclusion filters (notIn)
  excludeChainIds: z
    .string()
    .transform((val) =>
      val
        .split(',')
        .map((s) => Number.parseInt(s.trim(), 10))
        .filter((n) => !Number.isNaN(n))
    )
    .optional(),
  excludeSkills: z
    .string()
    .transform((val) => val.split(',').map((s) => s.trim()))
    .optional(),
  excludeDomains: z
    .string()
    .transform((val) => val.split(',').map((s) => s.trim()))
    .optional(),
  // Reachability filters
  reachableA2a: stringBooleanSchema.optional(),
  reachableMcp: stringBooleanSchema.optional(),
  /** Filter by Web reachability */
  reachableWeb: stringBooleanSchema.optional(),
  // Trust score filters (Gap 1)
  trustScoreMin: z.coerce.number().min(0).max(100).optional(),
  trustScoreMax: z.coerce.number().min(0).max(100).optional(),
  // Curation filters (Gap 3)
  curatedBy: z
    .string()
    .regex(/^0x[a-fA-F0-9]{40}$/, 'Invalid curator wallet address')
    .optional(),
  isCurated: stringBooleanSchema.optional(),
  // Gap 4: Declared OASF filters
  declaredSkill: z.string().max(MAX_LENGTHS.SKILL).optional(),
  declaredDomain: z.string().max(MAX_LENGTHS.SKILL).optional(),
  // Declared OASF array filters
  declaredSkills: skillArrayFilters.csv,
  'declaredSkills[]': skillArrayFilters.bracket,
  declaredDomains: skillArrayFilters.csv,
  'declaredDomains[]': skillArrayFilters.bracket,
  // Has OASF data filter
  hasOasf: stringBooleanSchema.optional(),
  // Tags filter
  hasTags: skillArrayFilters.csv,
  'hasTags[]': skillArrayFilters.bracket,
  // Gap 5: New endpoint filters
  hasEmail: stringBooleanSchema.optional(),
  hasOasfEndpoint: stringBooleanSchema.optional(),
  // Gap 6: Reachability attestation filters
  hasRecentReachability: stringBooleanSchema.optional(),
  // Validation score filters
  /** Minimum validation score (0-100) */
  minValidationScore: z.coerce.number().min(0).max(100).optional(),
  /** Maximum validation score (0-100) */
  maxValidationScore: z.coerce.number().min(0).max(100).optional(),
  /** Filter by agents with at least one validation */
  hasValidations: stringBooleanSchema.optional(),
  /** Filter by agents with pending validations */
  hasPendingValidations: stringBooleanSchema.optional(),
  /** Filter by agents with expired validations */
  hasExpiredValidations: stringBooleanSchema.optional(),
  // Date range filters
  createdAfter: z.string().datetime({ offset: true }).optional(),
  createdBefore: z.string().datetime({ offset: true }).optional(),
  updatedAfter: z.string().datetime({ offset: true }).optional(),
  updatedBefore: z.string().datetime({ offset: true }).optional(),
  sort: sortFieldSchema.optional(),
  order: sortOrderSchema.optional(),
  limit: limitSchema,
  cursor: z.string().max(MAX_LENGTHS.CURSOR).optional(),
  /** Offset-based pagination: skip N items before returning results */
  offset: z.coerce.number().int().min(0).optional(),
  /** Offset-based pagination: page number (1-indexed) */
  page: z.coerce.number().int().min(1).optional(),
  /** Search mode: semantic (vector search), name (substring), or auto (semantic with name fallback) */
  searchMode: searchModeInputSchema.optional(),
});

export type ListAgentsQuery = z.infer<typeof listAgentsQuerySchema>;

/**
 * Search request body schema
 */
export const searchRequestSchema = z.object({
  query: z.string().min(1, 'Query is required').max(MAX_LENGTHS.QUERY),
  filters: z
    .object({
      chainIds: z.array(chainIdSchema).max(MAX_LENGTHS.ARRAY_ITEMS).optional(),
      active: z.boolean().optional(),
      mcp: z.boolean().optional(),
      a2a: z.boolean().optional(),
      x402: z.boolean().optional(),
      skills: z.array(z.string().max(MAX_LENGTHS.SKILL)).max(MAX_LENGTHS.ARRAY_ITEMS).optional(),
      domains: z.array(z.string().max(MAX_LENGTHS.SKILL)).max(MAX_LENGTHS.ARRAY_ITEMS).optional(),
      mcpTools: z.array(z.string().max(MAX_LENGTHS.SKILL)).max(MAX_LENGTHS.ARRAY_ITEMS).optional(),
      a2aSkills: z.array(z.string().max(MAX_LENGTHS.SKILL)).max(MAX_LENGTHS.ARRAY_ITEMS).optional(),
      filterMode: z.enum(['AND', 'OR']).optional(),
      // Reputation filters
      minRep: z.number().min(0).max(100).optional(),
      maxRep: z.number().min(0).max(100).optional(),
      // Wallet filters
      owner: z.string().max(MAX_LENGTHS.ADDRESS).optional(),
      walletAddress: z.string().max(MAX_LENGTHS.ADDRESS).optional(),
      /** Filter by wallet verified status (ERC-8004 v1.0) */
      walletVerified: z.boolean().optional(),
      // Trust model filters
      trustModels: z.array(z.string().max(MAX_LENGTHS.TRUST_MODEL)).max(MAX_LENGTHS.ARRAY_ITEMS).optional(),
      hasTrusts: z.boolean().optional(),
      // Reachability filters
      reachableA2a: z.boolean().optional(),
      reachableMcp: z.boolean().optional(),
      /** Filter by Web reachability */
      reachableWeb: z.boolean().optional(),
      // Trust score filters (Gap 1)
      trustScoreMin: z.number().min(0).max(100).optional(),
      trustScoreMax: z.number().min(0).max(100).optional(),
      // Curation filters (Gap 3)
      curatedBy: z.string().regex(/^0x[a-fA-F0-9]{40}$/).optional(),
      isCurated: z.boolean().optional(),
      // Gap 4: Declared OASF filters
      declaredSkill: z.string().max(MAX_LENGTHS.SKILL).optional(),
      declaredDomain: z.string().max(MAX_LENGTHS.SKILL).optional(),
      /** Filter by multiple declared OASF skill slugs (match any) */
      declaredSkills: z.array(z.string().max(MAX_LENGTHS.SKILL)).max(MAX_LENGTHS.ARRAY_ITEMS).optional(),
      /** Filter by multiple declared OASF domain slugs (match any) */
      declaredDomains: z.array(z.string().max(MAX_LENGTHS.SKILL)).max(MAX_LENGTHS.ARRAY_ITEMS).optional(),
      /** Filter by agents with OASF data (declared skills or domains) */
      hasOasf: z.boolean().optional(),
      /** Filter by agents with specific feedback tags (match any) */
      hasTags: z.array(z.string().max(MAX_LENGTHS.SKILL)).max(MAX_LENGTHS.ARRAY_ITEMS).optional(),
      // Gap 5: New endpoint filters
      hasEmail: z.boolean().optional(),
      hasOasfEndpoint: z.boolean().optional(),
      // Gap 6: Reachability attestation filters
      hasRecentReachability: z.boolean().optional(),
      // Validation score filters
      /** Minimum validation score (0-100) */
      minValidationScore: z.number().min(0).max(100).optional(),
      /** Maximum validation score (0-100) */
      maxValidationScore: z.number().min(0).max(100).optional(),
      /** Filter by agents with at least one validation */
      hasValidations: z.boolean().optional(),
      /** Filter by agents with pending validations */
      hasPendingValidations: z.boolean().optional(),
      /** Filter by agents with expired validations */
      hasExpiredValidations: z.boolean().optional(),
      // Registration file filter
      hasRegistrationFile: z.boolean().optional(),
      // Exact match filters (new)
      ens: z.string().max(MAX_LENGTHS.ENS).optional(),
      did: z.string().max(MAX_LENGTHS.DID).optional(),
      // Exclusion filters (notIn)
      excludeChainIds: z.array(z.number()).max(MAX_LENGTHS.ARRAY_ITEMS).optional(),
      excludeSkills: z.array(z.string().max(MAX_LENGTHS.SKILL)).max(MAX_LENGTHS.ARRAY_ITEMS).optional(),
      excludeDomains: z.array(z.string().max(MAX_LENGTHS.SKILL)).max(MAX_LENGTHS.ARRAY_ITEMS).optional(),
    })
    .optional(),
  minScore: z.number().min(0).max(1).default(0.3),
  limit: limitBodySchema,
  cursor: z.string().max(MAX_LENGTHS.CURSOR).optional(),
  offset: z.number().int().min(0).optional(),
  /** Search mode: semantic (vector search), name (substring), or auto (semantic with name fallback) */
  searchMode: searchModeInputSchema.optional(),
});

export type SearchRequestBody = z.infer<typeof searchRequestSchema>;

/**
 * Classification request body schema
 */
export const classifyRequestSchema = z.object({
  force: z.boolean().default(false),
});

export type ClassifyRequestBody = z.infer<typeof classifyRequestSchema>;

/**
 * Taxonomy query parameters schema
 */
export const taxonomyQuerySchema = z.object({
  type: z.enum(['skill', 'domain', 'all']).default('all'),
});

export type TaxonomyQuery = z.infer<typeof taxonomyQuerySchema>;

/**
 * OASF classification data structure
 * Note: skills/domains are typed as arrays for JSON parsing safety
 * They should contain SkillClassification[] and DomainClassification[]
 */
export interface ParsedClassification {
  skills: Array<{ slug: string; confidence: number; reasoning?: string }>;
  domains: Array<{ slug: string; confidence: number; reasoning?: string }>;
  confidence: number;
  classifiedAt: string;
  modelVersion: string;
}

/**
 * Database classification row type (subset of AgentClassificationRow)
 */
export interface ClassificationRowData {
  skills: string;
  domains: string;
  confidence: number;
  classified_at: string;
  model_version: string;
}

/**
 * Safely parse classification data from database row
 * Protects against corrupted JSON data
 * @param row - Database classification row or null
 * @returns Parsed classification or undefined if row is null or JSON is invalid
 */
export function parseClassificationRow(
  row: ClassificationRowData | null | undefined
): ParsedClassification | undefined {
  if (!row) return undefined;

  try {
    return {
      skills: JSON.parse(row.skills),
      domains: JSON.parse(row.domains),
      confidence: row.confidence,
      classifiedAt: row.classified_at,
      modelVersion: row.model_version,
    };
  } catch (error) {
    // Log error for debugging but don't crash
    console.error('Failed to parse classification JSON:', error);
    return undefined;
  }
}

// ============================================================================
// Phase 1 Endpoint Schemas
// ============================================================================

/**
 * Leaderboard query parameters schema
 */
export const leaderboardQuerySchema = z.object({
  period: z.enum(['all', '30d', '7d', '24h']).default('all'),
  'chainIds[]': chainsSchema.optional(),
  chainIds: chainsSchema.optional(),
  mcp: stringBooleanSchema.optional(),
  a2a: stringBooleanSchema.optional(),
  x402: stringBooleanSchema.optional(),
  limit: limitSchema,
  cursor: z.string().optional(),
  offset: z.coerce.number().int().min(0).optional(),
});

export type LeaderboardQuery = z.infer<typeof leaderboardQuerySchema>;

/**
 * Global feedbacks query parameters schema
 */
export const feedbacksQuerySchema = z.object({
  'chainIds[]': chainsSchema.optional(),
  chainIds: chainsSchema.optional(),
  scoreCategory: z.enum(['positive', 'neutral', 'negative']).optional(),
  // Reviewer wallet addresses filter
  reviewers: addressArrayFilters.csv,
  'reviewers[]': addressArrayFilters.bracket,
  /** Filter by multiple agent IDs (comma-separated or array, format: chainId:tokenId) */
  agentIds: z
    .string()
    .transform((val) =>
      val
        .split(',')
        .map((s) => s.trim())
        .filter((s) => /^\d+:\d+$/.test(s))
        .slice(0, MAX_LENGTHS.ARRAY_ITEMS)
    )
    .optional(),
  'agentIds[]': z
    .union([z.string(), z.array(z.string()).max(MAX_LENGTHS.ARRAY_ITEMS)])
    .transform((val) =>
      (Array.isArray(val) ? val : [val])
        .filter((s) => /^\d+:\d+$/.test(s))
        .slice(0, MAX_LENGTHS.ARRAY_ITEMS)
    )
    .optional(),
  /** Filter by specific feedback index */
  feedbackIndex: z.coerce.number().int().min(0).optional(),
  limit: limitSchema,
  cursor: z.string().optional(),
  offset: z.coerce.number().int().min(0).optional(),
});

export type FeedbacksQuery = z.infer<typeof feedbacksQuerySchema>;

/**
 * Trending agents query parameters schema
 */
export const trendingQuerySchema = z.object({
  period: z.enum(['24h', '7d', '30d']).default('7d'),
  limit: z.coerce
    .number()
    .int()
    .min(1)
    .transform((v) => Math.min(v, 50))
    .default(20),
});

export type TrendingQuery = z.infer<typeof trendingQuerySchema>;

/**
 * Evaluations list query parameters schema
 */
export const evaluationsQuerySchema = z.object({
  /** Filter by agent ID */
  agentId: z.string().optional(),
  /** Filter by chain IDs */
  'chainIds[]': chainsSchema.optional(),
  chainIds: chainsSchema.optional(),
  /** Filter by status */
  status: z.enum(['pending', 'processing', 'completed', 'failed']).optional(),
  /** Filter by minimum score */
  minScore: z.coerce.number().int().min(0).max(100).optional(),
  /** Filter by maximum score */
  maxScore: z.coerce.number().int().min(0).max(100).optional(),
  /** Results limit */
  limit: limitSchema,
  /** Pagination cursor */
  cursor: z.string().optional(),
  /** Pagination offset */
  offset: z.coerce.number().int().min(0).optional(),
});

export type EvaluationsQuery = z.infer<typeof evaluationsQuerySchema>;

/**
 * Evaluation queue request schema
 */
export const queueEvaluationSchema = z.object({
  /** Agent ID to evaluate */
  agentId: agentIdSchema,
  /** Specific skills to test */
  skills: z.array(z.string()).optional(),
  /** Priority (higher = processed first) */
  priority: z.number().int().min(0).max(10).default(0),
  /** Force re-evaluation even if recent result exists */
  force: z.boolean().default(false),
});

export type QueueEvaluationRequest = z.infer<typeof queueEvaluationSchema>;

/**
 * Agent evaluations history query schema
 */
export const agentEvaluationsQuerySchema = z.object({
  /** Results limit */
  limit: z.coerce
    .number()
    .int()
    .min(1)
    .transform((v) => Math.min(v, 50))
    .default(10),
  /** Pagination cursor */
  cursor: z.string().optional(),
  /** Pagination offset */
  offset: z.coerce.number().int().min(0).optional(),
});
