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
  const [chainIdStr, tokenId] = agentId.split(':');
  return {
    chainId: Number.parseInt(chainIdStr!, 10),
    tokenId: tokenId!,
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
 * List agents query parameters schema
 */
export const listAgentsQuerySchema = z.object({
  q: z.string().min(1).optional(),
  chainId: chainIdSchema.optional(),
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
  minScore: z.coerce.number().min(0).max(1).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  cursor: z.string().optional(),
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
