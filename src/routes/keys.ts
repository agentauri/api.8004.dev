/**
 * API Keys management endpoints
 * @module routes/keys
 */

import type { Context } from 'hono';
import { Hono } from 'hono';
import { errors } from '@/lib/utils/errors';
import { rateLimit } from '@/lib/utils/rate-limit';
import {
  createApiKey,
  deleteApiKey,
  getApiKey,
  getApiKeyUsage,
  listApiKeys,
  rotateApiKey,
  updateApiKey,
  type ApiKeyPermission,
  type ApiKeyTier,
} from '@/services/api-keys';
import type { Env, Variables } from '@/types';
import { z } from 'zod';

const keys = new Hono<{ Bindings: Env; Variables: Variables }>();

// Apply stricter rate limiting for key management (M5: 10 RPM instead of 60)
keys.use('*', rateLimit({ limit: 10, window: 60, keyPrefix: 'ratelimit:keys' }));

/**
 * Check if the current request is authorized for the target key
 * Admin permission allows all operations
 * Non-admin users can only access their own keys (ownership check)
 */
function isAuthorized(
  c: Context<{ Bindings: Env; Variables: Variables }>,
  targetKeyId?: string
): boolean {
  const permissions = (c.get('apiKeyPermissions') as string[] | undefined) ?? [];
  const currentKeyId = c.get('apiKeyId') as string | undefined;

  // Admin can do anything
  if (permissions.includes('admin')) {
    return true;
  }

  // Owner can access their own key
  if (targetKeyId && currentKeyId && targetKeyId === currentKeyId) {
    return true;
  }

  return false;
}

/**
 * Check if the current user has admin permission
 */
function isAdmin(c: Context<{ Bindings: Env; Variables: Variables }>): boolean {
  const permissions = (c.get('apiKeyPermissions') as string[] | undefined) ?? [];
  return permissions.includes('admin');
}

/**
 * Validation schemas
 */
const createKeySchema = z.object({
  name: z.string().min(1).max(100),
  tier: z.enum(['anonymous', 'standard', 'premium']).optional(),
  rateLimitRpm: z.number().int().positive().optional(),
  owner: z.string().optional(),
  expiresAt: z.string().datetime().optional(),
  permissions: z
    .array(z.enum(['read', 'write', 'classify', 'evaluate', 'admin']))
    .optional(),
  description: z.string().max(500).optional(),
  dailyQuota: z.number().int().positive().optional(),
  monthlyQuota: z.number().int().positive().optional(),
});

const updateKeySchema = z.object({
  name: z.string().min(1).max(100).optional(),
  tier: z.enum(['anonymous', 'standard', 'premium']).optional(),
  rateLimitRpm: z.number().int().positive().nullable().optional(),
  permissions: z
    .array(z.enum(['read', 'write', 'classify', 'evaluate', 'admin']))
    .optional(),
  description: z.string().max(500).nullable().optional(),
  dailyQuota: z.number().int().positive().nullable().optional(),
  monthlyQuota: z.number().int().positive().nullable().optional(),
  expiresAt: z.string().datetime().nullable().optional(),
  enabled: z.boolean().optional(),
});

/**
 * POST /api/v1/keys
 * Create a new API key (requires admin permission)
 */
keys.post('/', async (c) => {
  // C1: Require admin permission to create keys
  if (!isAdmin(c)) {
    return errors.forbidden(c, 'Admin permission required to create API keys');
  }

  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return errors.validationError(c, 'Invalid JSON body');
  }

  const parseResult = createKeySchema.safeParse(body);
  if (!parseResult.success) {
    return errors.validationError(c, parseResult.error.issues[0]?.message ?? 'Invalid request');
  }

  const data = parseResult.data;

  const result = await createApiKey(c.env.DB, {
    name: data.name,
    tier: data.tier as ApiKeyTier | undefined,
    rateLimitRpm: data.rateLimitRpm,
    owner: data.owner,
    expiresAt: data.expiresAt,
    permissions: data.permissions as ApiKeyPermission[] | undefined,
    description: data.description,
    dailyQuota: data.dailyQuota,
    monthlyQuota: data.monthlyQuota,
  });

  return c.json(
    {
      success: true,
      data: {
        id: result.record.id,
        key: result.key, // Only returned on creation
        name: result.record.name,
        tier: result.record.tier,
        rateLimitRpm: result.record.rateLimitRpm,
        permissions: result.record.permissions,
        description: result.record.description,
        dailyQuota: result.record.dailyQuota,
        monthlyQuota: result.record.monthlyQuota,
        expiresAt: result.record.expiresAt,
        createdAt: result.record.createdAt,
      },
      message: 'API key created. Save the key securely - it cannot be retrieved again.',
    },
    201
  );
});

/**
 * GET /api/v1/keys
 * List API keys (no secrets returned)
 * Admin can see all keys; non-admin can only see their own key
 */
keys.get('/', async (c) => {
  const owner = c.req.query('owner');
  const limitParam = c.req.query('limit');
  const offsetParam = c.req.query('offset');

  const limit = limitParam ? Math.min(Math.max(1, Number.parseInt(limitParam, 10)), 100) : 50;
  const offset = offsetParam ? Math.max(0, Number.parseInt(offsetParam, 10)) : 0;

  // C1: Non-admin users can only see their own key
  const currentKeyId = c.get('apiKeyId') as string | undefined;
  if (!isAdmin(c)) {
    // Non-admin: return only their own key
    if (!currentKeyId) {
      return c.json({
        success: true,
        data: [],
        meta: { total: 0, limit, offset },
      });
    }

    const ownKey = await getApiKey(c.env.DB, currentKeyId);
    if (!ownKey) {
      return c.json({
        success: true,
        data: [],
        meta: { total: 0, limit, offset },
      });
    }

    // Don't expose keyHash in the response
    const { keyHash: _keyHash, ...sanitized } = ownKey;
    return c.json({
      success: true,
      data: [sanitized],
      meta: { total: 1, limit, offset },
    });
  }

  // Admin: can see all keys
  const apiKeys = await listApiKeys(c.env.DB, { owner, limit, offset });

  // Don't expose keyHash in the response
  const sanitizedKeys = apiKeys.map(
    ({ keyHash: _keyHash, ...rest }) => rest
  );

  return c.json({
    success: true,
    data: sanitizedKeys,
    meta: {
      total: apiKeys.length,
      limit,
      offset,
    },
  });
});

/**
 * GET /api/v1/keys/:id
 * Get API key details (no secret returned)
 * Requires admin permission OR ownership
 */
keys.get('/:id', async (c) => {
  const keyId = c.req.param('id');

  // C1: Check authorization before fetching
  if (!isAuthorized(c, keyId)) {
    return errors.forbidden(c, 'Not authorized to access this API key');
  }

  const apiKey = await getApiKey(c.env.DB, keyId);
  if (!apiKey) {
    return errors.notFound(c, 'API key');
  }

  // Don't expose keyHash in the response
  const { keyHash: _keyHash, ...sanitized } = apiKey;

  return c.json({
    success: true,
    data: sanitized,
  });
});

/**
 * PATCH /api/v1/keys/:id
 * Update API key properties
 * Requires admin permission OR ownership
 */
keys.patch('/:id', async (c) => {
  const keyId = c.req.param('id');

  // C1: Check authorization before updating
  if (!isAuthorized(c, keyId)) {
    return errors.forbidden(c, 'Not authorized to update this API key');
  }

  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return errors.validationError(c, 'Invalid JSON body');
  }

  const parseResult = updateKeySchema.safeParse(body);
  if (!parseResult.success) {
    return errors.validationError(c, parseResult.error.issues[0]?.message ?? 'Invalid request');
  }

  const data = parseResult.data;

  const updated = await updateApiKey(c.env.DB, keyId, {
    name: data.name,
    tier: data.tier as ApiKeyTier | undefined,
    rateLimitRpm: data.rateLimitRpm,
    permissions: data.permissions as ApiKeyPermission[] | undefined,
    description: data.description,
    dailyQuota: data.dailyQuota,
    monthlyQuota: data.monthlyQuota,
    expiresAt: data.expiresAt,
    enabled: data.enabled,
  });

  if (!updated) {
    return errors.notFound(c, 'API key');
  }

  // Don't expose keyHash in the response
  const { keyHash: _keyHash, ...sanitized } = updated;

  return c.json({
    success: true,
    data: sanitized,
  });
});

/**
 * DELETE /api/v1/keys/:id
 * Delete an API key
 * Requires admin permission OR ownership
 */
keys.delete('/:id', async (c) => {
  const keyId = c.req.param('id');

  // C1: Check authorization before deleting
  if (!isAuthorized(c, keyId)) {
    return errors.forbidden(c, 'Not authorized to delete this API key');
  }

  const deleted = await deleteApiKey(c.env.DB, keyId);
  if (!deleted) {
    return errors.notFound(c, 'API key');
  }

  return c.json({
    success: true,
    message: 'API key deleted',
  });
});

/**
 * POST /api/v1/keys/:id/rotate
 * Rotate an API key (creates new key, disables old one)
 * Requires admin permission OR ownership
 */
keys.post('/:id/rotate', async (c) => {
  const keyId = c.req.param('id');

  // C1: Check authorization before rotating
  if (!isAuthorized(c, keyId)) {
    return errors.forbidden(c, 'Not authorized to rotate this API key');
  }

  const result = await rotateApiKey(c.env.DB, keyId);
  if (!result) {
    return errors.notFound(c, 'API key');
  }

  return c.json({
    success: true,
    data: {
      id: result.record.id,
      key: result.key, // Only returned on rotation
      name: result.record.name,
      tier: result.record.tier,
      permissions: result.record.permissions,
      rotatedFrom: result.record.rotatedFrom,
      rotatedAt: result.record.rotatedAt,
      createdAt: result.record.createdAt,
    },
    message: 'API key rotated. The old key has been disabled. Save the new key securely.',
  });
});

/**
 * GET /api/v1/keys/:id/usage
 * Get usage statistics for an API key
 * Requires admin permission OR ownership
 */
keys.get('/:id/usage', async (c) => {
  const keyId = c.req.param('id');
  const period = c.req.query('period') as 'day' | 'week' | 'month' | undefined;

  // C1: Check authorization before accessing usage
  if (!isAuthorized(c, keyId)) {
    return errors.forbidden(c, 'Not authorized to view this API key usage');
  }

  // Verify key exists
  const apiKey = await getApiKey(c.env.DB, keyId);
  if (!apiKey) {
    return errors.notFound(c, 'API key');
  }

  const usage = await getApiKeyUsage(c.env.DB, keyId, { period });

  return c.json({
    success: true,
    data: {
      keyId,
      keyName: apiKey.name,
      period: period ?? 'day',
      currentUsage: {
        daily: apiKey.dailyUsage,
        monthly: apiKey.monthlyUsage,
        total: apiKey.usageCount,
      },
      quotas: {
        daily: apiKey.dailyQuota,
        monthly: apiKey.monthlyQuota,
      },
      ...usage,
    },
  });
});

export { keys };
