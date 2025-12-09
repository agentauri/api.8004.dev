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
 * Agent ID validation (format: chainId:tokenId)
 */
export const agentIdSchema = z.string().regex(/^\d+:\d+$/, {
  message: 'Agent ID must be in format chainId:tokenId (e.g., "11155111:123")',
});

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
 * Comma-separated chain IDs schema
 * Accepts format like "11155111,84532" and validates each ID
 */
const chainsSchema = z
  .string()
  .transform((val) =>
    val
      .split(',')
      .map((s) => s.trim())
      .filter((s) => s.length > 0)
      .map((s) => Number.parseInt(s, 10))
  )
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
 * List agents query parameters schema
 */
export const listAgentsQuerySchema = z
  .object({
    q: z.string().min(1).optional(),
    chainId: chainIdSchema.optional(),
    chains: chainsSchema.optional(),
    active: stringBooleanSchema.optional(),
    mcp: stringBooleanSchema.optional(),
    a2a: stringBooleanSchema.optional(),
    x402: stringBooleanSchema.optional(),
    skills: z
      .string()
      .transform((val) => val.split(',').map((s) => s.trim()))
      .optional(),
    domains: z
      .string()
      .transform((val) => val.split(',').map((s) => s.trim()))
      .optional(),
    filterMode: z.enum(['AND', 'OR']).optional(),
    minScore: z.coerce.number().min(0).max(1).optional(),
    minRep: z.coerce.number().int().min(0).max(100).optional(),
    maxRep: z.coerce.number().int().min(0).max(100).optional(),
    sort: sortFieldSchema.optional(),
    order: sortOrderSchema.optional(),
    limit: z.coerce.number().int().min(1).max(100).default(20),
    cursor: z.string().optional(),
  })
  .refine(
    (data) => {
      if (data.minRep !== undefined && data.maxRep !== undefined) {
        return data.minRep <= data.maxRep;
      }
      return true;
    },
    { message: 'minRep must be less than or equal to maxRep' }
  );

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
      filterMode: z.enum(['AND', 'OR']).optional(),
    })
    .optional(),
  minScore: z.number().min(0).max(1).default(0.3),
  limit: z.number().int().min(1).max(100).default(20),
  cursor: z.string().optional(),
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
 * Validate and parse request body
 */
export async function validateBody<T>(request: Request, schema: z.ZodSchema<T>): Promise<T> {
  const body = await request.json();
  return schema.parse(body);
}

/**
 * Validate query parameters
 */
export function validateQuery<T>(query: Record<string, string>, schema: z.ZodSchema<T>): T {
  return schema.parse(query);
}

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
