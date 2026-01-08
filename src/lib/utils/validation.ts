/**
 * Request validation schemas using Zod
 * @module lib/utils/validation
 */

import { z } from 'zod';

/**
 * Supported chain IDs
 */
export const SUPPORTED_CHAIN_IDS = [11155111, 84532, 80002] as const;

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
 */
export function parseAgentId(agentId: string): { chainId: number; tokenId: string } {
  const [chainIdStr = '0', tokenId = '0'] = agentId.split(':');
  return {
    chainId: Number.parseInt(chainIdStr, 10),
    tokenId,
  };
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
 */
export const sortFieldSchema = z
  .enum(['relevance', 'name', 'createdAt', 'reputation'])
  .default('relevance');

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
  q: z.string().min(1).optional(),
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
  // Skills filter - supports both CSV (skills=a,b) and array notation (skills[]=a&skills[]=b)
  skills: z
    .string()
    .transform((val) => val.split(',').map((s) => s.trim()))
    .optional(),
  'skills[]': z
    .union([z.string(), z.array(z.string())])
    .transform((val) => (Array.isArray(val) ? val : [val]))
    .optional(),
  // Domains filter - supports both CSV and array notation
  domains: z
    .string()
    .transform((val) => val.split(',').map((s) => s.trim()))
    .optional(),
  'domains[]': z
    .union([z.string(), z.array(z.string())])
    .transform((val) => (Array.isArray(val) ? val : [val]))
    .optional(),
  // MCP tools filter - supports both CSV and array notation
  mcpTools: z
    .string()
    .transform((val) => val.split(',').map((s) => s.trim()))
    .optional(),
  'mcpTools[]': z
    .union([z.string(), z.array(z.string())])
    .transform((val) => (Array.isArray(val) ? val : [val]))
    .optional(),
  // A2A skills filter - supports both CSV and array notation
  a2aSkills: z
    .string()
    .transform((val) => val.split(',').map((s) => s.trim()))
    .optional(),
  'a2aSkills[]': z
    .union([z.string(), z.array(z.string())])
    .transform((val) => (Array.isArray(val) ? val : [val]))
    .optional(),
  filterMode: z.enum(['AND', 'OR']).optional(),
  minScore: z.coerce.number().min(0).max(1).optional(),
  minRep: z.coerce.number().min(0).max(100).optional(),
  maxRep: z.coerce.number().min(0).max(100).optional(),
  // Wallet filters
  owner: z.string().optional(),
  walletAddress: z.string().optional(),
  // Trust model filters
  trustModels: z
    .string()
    .transform((val) => val.split(',').map((s) => s.trim()))
    .optional(),
  hasTrusts: stringBooleanSchema.optional(),
  // Exact match filters (new)
  ens: z.string().optional(),
  did: z.string().optional(),
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
  // Date range filters
  createdAfter: z.string().datetime({ offset: true }).optional(),
  createdBefore: z.string().datetime({ offset: true }).optional(),
  updatedAfter: z.string().datetime({ offset: true }).optional(),
  updatedBefore: z.string().datetime({ offset: true }).optional(),
  sort: sortFieldSchema.optional(),
  order: sortOrderSchema.optional(),
  limit: limitSchema,
  cursor: z.string().optional(),
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
  query: z.string().min(1, 'Query is required'),
  filters: z
    .object({
      chainIds: z.array(chainIdSchema).optional(),
      active: z.boolean().optional(),
      mcp: z.boolean().optional(),
      a2a: z.boolean().optional(),
      x402: z.boolean().optional(),
      skills: z.array(z.string()).optional(),
      domains: z.array(z.string()).optional(),
      mcpTools: z.array(z.string()).optional(),
      a2aSkills: z.array(z.string()).optional(),
      filterMode: z.enum(['AND', 'OR']).optional(),
      // Reputation filters
      minRep: z.number().min(0).max(100).optional(),
      maxRep: z.number().min(0).max(100).optional(),
      // Wallet filters
      owner: z.string().optional(),
      walletAddress: z.string().optional(),
      // Trust model filters
      trustModels: z.array(z.string()).optional(),
      hasTrusts: z.boolean().optional(),
      // Reachability filters
      reachableA2a: z.boolean().optional(),
      reachableMcp: z.boolean().optional(),
      // Registration file filter
      hasRegistrationFile: z.boolean().optional(),
      // Exact match filters (new)
      ens: z.string().optional(),
      did: z.string().optional(),
      // Exclusion filters (notIn)
      excludeChainIds: z.array(z.number()).optional(),
      excludeSkills: z.array(z.string()).optional(),
      excludeDomains: z.array(z.string()).optional(),
    })
    .optional(),
  minScore: z.number().min(0).max(1).default(0.3),
  limit: limitBodySchema,
  cursor: z.string().optional(),
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
