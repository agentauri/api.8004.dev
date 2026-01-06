/**
 * API Keys service for individual key management
 * @module services/api-keys
 */

import { globalLogger } from '@/lib/logger';

/**
 * API Key tier with default rate limits
 */
export type ApiKeyTier = 'anonymous' | 'standard' | 'premium';

/**
 * API Key permissions
 */
export type ApiKeyPermission = 'read' | 'write' | 'classify' | 'evaluate' | 'admin';

/**
 * Safely parse API key permissions from database
 * @param raw - Raw permissions string from database
 * @param keyId - Key ID for logging context
 * @returns Parsed permissions array, defaults to ['read'] on error
 */
function parsePermissions(raw: string | null, keyId: string): ApiKeyPermission[] {
  if (!raw) return ['read'];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      globalLogger.error('Invalid permissions format - not an array', { keyId, raw });
      return ['read'];
    }
    return parsed as ApiKeyPermission[];
  } catch (error) {
    globalLogger.error('Failed to parse API key permissions', {
      keyId,
      raw: raw.substring(0, 100), // Truncate for logs
      error: error instanceof Error ? error.message : String(error),
    });
    return ['read'];
  }
}

/**
 * Default rate limits by tier (requests per minute)
 */
export const DEFAULT_RATE_LIMITS: Record<ApiKeyTier, number> = {
  anonymous: 60,
  standard: 300,
  premium: 1000,
};

/**
 * API Key record from database
 */
export interface ApiKeyRecord {
  id: string;
  keyHash: string;
  name: string;
  tier: ApiKeyTier;
  rateLimitRpm: number | null;
  enabled: boolean;
  owner: string | null;
  createdAt: string;
  expiresAt: string | null;
  lastUsedAt: string | null;
  usageCount: number;
  permissions: ApiKeyPermission[];
  description: string | null;
  dailyQuota: number | null;
  monthlyQuota: number | null;
  dailyUsage: number;
  monthlyUsage: number;
  dailyResetAt: string | null;
  monthlyResetAt: string | null;
  rotatedFrom: string | null;
  rotatedAt: string | null;
}

/**
 * API Key validation result
 */
export interface ApiKeyValidationResult {
  valid: boolean;
  keyId?: string;
  tier: ApiKeyTier;
  rateLimitRpm: number;
  permissions: ApiKeyPermission[];
  quotaExceeded?: boolean;
  reason?: string;
}

/**
 * Generate a secure random API key
 * Format: 8004_[32 random hex chars] = 37 chars total
 */
export async function generateApiKey(): Promise<string> {
  const randomBytes = crypto.getRandomValues(new Uint8Array(16));
  const hex = Array.from(randomBytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
  return `8004_${hex}`;
}

/**
 * Hash an API key using SHA-256
 * @param apiKey - Raw API key
 * @returns Hex-encoded SHA-256 hash
 */
export async function hashApiKey(apiKey: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(apiKey);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Create a new API key
 */
export async function createApiKey(
  db: D1Database,
  options: {
    name: string;
    tier?: ApiKeyTier;
    rateLimitRpm?: number;
    owner?: string;
    expiresAt?: string;
    permissions?: ApiKeyPermission[];
    description?: string;
    dailyQuota?: number;
    monthlyQuota?: number;
  }
): Promise<{ key: string; record: ApiKeyRecord }> {
  const key = await generateApiKey();
  const keyHash = await hashApiKey(key);
  const id = crypto.randomUUID();

  const tier = options.tier ?? 'standard';
  const permissions = options.permissions ?? ['read'];

  await db
    .prepare(
      `
		INSERT INTO api_keys (id, key_hash, name, tier, rate_limit_rpm, owner, expires_at, permissions, description, daily_quota, monthly_quota)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
	`
    )
    .bind(
      id,
      keyHash,
      options.name,
      tier,
      options.rateLimitRpm ?? null,
      options.owner ?? null,
      options.expiresAt ?? null,
      JSON.stringify(permissions),
      options.description ?? null,
      options.dailyQuota ?? null,
      options.monthlyQuota ?? null
    )
    .run();

  const record: ApiKeyRecord = {
    id,
    keyHash,
    name: options.name,
    tier,
    rateLimitRpm: options.rateLimitRpm ?? null,
    enabled: true,
    owner: options.owner ?? null,
    createdAt: new Date().toISOString(),
    expiresAt: options.expiresAt ?? null,
    lastUsedAt: null,
    usageCount: 0,
    permissions,
    description: options.description ?? null,
    dailyQuota: options.dailyQuota ?? null,
    monthlyQuota: options.monthlyQuota ?? null,
    dailyUsage: 0,
    monthlyUsage: 0,
    dailyResetAt: null,
    monthlyResetAt: null,
    rotatedFrom: null,
    rotatedAt: null,
  };

  globalLogger.info('API key created', { keyId: id, name: options.name, tier });

  return { key, record };
}

/**
 * Validate an API key and return its properties
 */
export async function validateApiKey(
  db: D1Database,
  apiKey: string
): Promise<ApiKeyValidationResult> {
  const keyHash = await hashApiKey(apiKey);

  const result = await db
    .prepare(
      `
		SELECT id, key_hash, name, tier, rate_limit_rpm, enabled, owner,
		       created_at, expires_at, last_used_at, usage_count,
		       permissions, daily_quota, monthly_quota, daily_usage, monthly_usage,
		       daily_reset_at, monthly_reset_at
		FROM api_keys
		WHERE key_hash = ?
	`
    )
    .bind(keyHash)
    .first<{
      id: string;
      key_hash: string;
      name: string;
      tier: string;
      rate_limit_rpm: number | null;
      enabled: number;
      owner: string | null;
      created_at: string;
      expires_at: string | null;
      last_used_at: string | null;
      usage_count: number;
      permissions: string;
      daily_quota: number | null;
      monthly_quota: number | null;
      daily_usage: number;
      monthly_usage: number;
      daily_reset_at: string | null;
      monthly_reset_at: string | null;
    }>();

  // Key not found
  if (!result) {
    return {
      valid: false,
      tier: 'anonymous',
      rateLimitRpm: DEFAULT_RATE_LIMITS.anonymous,
      permissions: ['read'],
      reason: 'Invalid API key',
    };
  }

  // Key disabled
  if (!result.enabled) {
    return {
      valid: false,
      tier: 'anonymous',
      rateLimitRpm: DEFAULT_RATE_LIMITS.anonymous,
      permissions: [],
      reason: 'API key is disabled',
    };
  }

  // Key expired
  if (result.expires_at && new Date(result.expires_at) < new Date()) {
    return {
      valid: false,
      tier: 'anonymous',
      rateLimitRpm: DEFAULT_RATE_LIMITS.anonymous,
      permissions: [],
      reason: 'API key has expired',
    };
  }

  const tier = result.tier as ApiKeyTier;
  const rateLimitRpm = result.rate_limit_rpm ?? DEFAULT_RATE_LIMITS[tier];
  const permissions = parsePermissions(result.permissions, result.id);

  // Check quota limits
  const now = new Date();
  let dailyUsage = result.daily_usage;
  let monthlyUsage = result.monthly_usage;

  // Reset daily counter if needed
  if (result.daily_reset_at && new Date(result.daily_reset_at) <= now) {
    dailyUsage = 0;
  }

  // Reset monthly counter if needed
  if (result.monthly_reset_at && new Date(result.monthly_reset_at) <= now) {
    monthlyUsage = 0;
  }

  // Check if quota exceeded
  const dailyExceeded = result.daily_quota !== null && dailyUsage >= result.daily_quota;
  const monthlyExceeded = result.monthly_quota !== null && monthlyUsage >= result.monthly_quota;

  if (dailyExceeded || monthlyExceeded) {
    return {
      valid: false,
      keyId: result.id,
      tier,
      rateLimitRpm,
      permissions,
      quotaExceeded: true,
      reason: dailyExceeded ? 'Daily quota exceeded' : 'Monthly quota exceeded',
    };
  }

  // Update last_used_at and usage_count (fire and forget)
  db.prepare(
    `
		UPDATE api_keys
		SET last_used_at = datetime('now'),
		    usage_count = usage_count + 1,
		    daily_usage = CASE
		      WHEN daily_reset_at IS NULL OR datetime(daily_reset_at) <= datetime('now')
		      THEN 1
		      ELSE daily_usage + 1
		    END,
		    monthly_usage = CASE
		      WHEN monthly_reset_at IS NULL OR datetime(monthly_reset_at) <= datetime('now')
		      THEN 1
		      ELSE monthly_usage + 1
		    END,
		    daily_reset_at = CASE
		      WHEN daily_reset_at IS NULL OR datetime(daily_reset_at) <= datetime('now')
		      THEN datetime('now', 'start of day', '+1 day')
		      ELSE daily_reset_at
		    END,
		    monthly_reset_at = CASE
		      WHEN monthly_reset_at IS NULL OR datetime(monthly_reset_at) <= datetime('now')
		      THEN datetime('now', 'start of month', '+1 month')
		      ELSE monthly_reset_at
		    END
		WHERE id = ?
	`
  )
    .bind(result.id)
    .run()
    .catch((err) => {
      globalLogger.warn('Failed to update API key usage', { keyId: result.id, error: String(err) });
    });

  return {
    valid: true,
    keyId: result.id,
    tier,
    rateLimitRpm,
    permissions,
  };
}

/**
 * Log API key usage for analytics
 */
export async function logApiKeyUsage(
  db: D1Database,
  keyId: string,
  usage: {
    endpoint: string;
    method: string;
    statusCode?: number;
    responseTimeMs?: number;
  }
): Promise<void> {
  try {
    await db
      .prepare(
        `
			INSERT INTO api_key_usage (id, key_id, endpoint, method, status_code, response_time_ms)
			VALUES (?, ?, ?, ?, ?, ?)
		`
      )
      .bind(
        crypto.randomUUID(),
        keyId,
        usage.endpoint,
        usage.method,
        usage.statusCode ?? null,
        usage.responseTimeMs ?? null
      )
      .run();
  } catch (error) {
    globalLogger.warn('Failed to log API key usage', { keyId, error: String(error) });
  }
}

/**
 * Get API key by ID (for admin use)
 */
export async function getApiKey(db: D1Database, keyId: string): Promise<ApiKeyRecord | null> {
  const result = await db
    .prepare(
      `
		SELECT id, key_hash, name, tier, rate_limit_rpm, enabled, owner,
		       created_at, expires_at, last_used_at, usage_count,
		       permissions, description, daily_quota, monthly_quota,
		       daily_usage, monthly_usage, daily_reset_at, monthly_reset_at,
		       rotated_from, rotated_at
		FROM api_keys
		WHERE id = ?
	`
    )
    .bind(keyId)
    .first<{
      id: string;
      key_hash: string;
      name: string;
      tier: string;
      rate_limit_rpm: number | null;
      enabled: number;
      owner: string | null;
      created_at: string;
      expires_at: string | null;
      last_used_at: string | null;
      usage_count: number;
      permissions: string | null;
      description: string | null;
      daily_quota: number | null;
      monthly_quota: number | null;
      daily_usage: number;
      monthly_usage: number;
      daily_reset_at: string | null;
      monthly_reset_at: string | null;
      rotated_from: string | null;
      rotated_at: string | null;
    }>();

  if (!result) return null;

  const permissions = parsePermissions(result.permissions, result.id);

  return {
    id: result.id,
    keyHash: result.key_hash,
    name: result.name,
    tier: result.tier as ApiKeyTier,
    rateLimitRpm: result.rate_limit_rpm,
    enabled: Boolean(result.enabled),
    owner: result.owner,
    createdAt: result.created_at,
    expiresAt: result.expires_at,
    lastUsedAt: result.last_used_at,
    usageCount: result.usage_count,
    permissions,
    description: result.description,
    dailyQuota: result.daily_quota,
    monthlyQuota: result.monthly_quota,
    dailyUsage: result.daily_usage,
    monthlyUsage: result.monthly_usage,
    dailyResetAt: result.daily_reset_at,
    monthlyResetAt: result.monthly_reset_at,
    rotatedFrom: result.rotated_from,
    rotatedAt: result.rotated_at,
  };
}

/**
 * List API keys (for admin use)
 */
export async function listApiKeys(
  db: D1Database,
  options: { owner?: string; limit?: number; offset?: number } = {}
): Promise<ApiKeyRecord[]> {
  const limit = options.limit ?? 50;
  const offset = options.offset ?? 0;

  let query = `
		SELECT id, key_hash, name, tier, rate_limit_rpm, enabled, owner,
		       created_at, expires_at, last_used_at, usage_count,
		       permissions, description, daily_quota, monthly_quota,
		       daily_usage, monthly_usage, daily_reset_at, monthly_reset_at,
		       rotated_from, rotated_at
		FROM api_keys
	`;

  const params: (string | number)[] = [];
  if (options.owner) {
    query += ' WHERE owner = ?';
    params.push(options.owner);
  }

  query += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
  params.push(limit, offset);

  const results = await db
    .prepare(query)
    .bind(...params)
    .all<{
      id: string;
      key_hash: string;
      name: string;
      tier: string;
      rate_limit_rpm: number | null;
      enabled: number;
      owner: string | null;
      created_at: string;
      expires_at: string | null;
      last_used_at: string | null;
      usage_count: number;
      permissions: string | null;
      description: string | null;
      daily_quota: number | null;
      monthly_quota: number | null;
      daily_usage: number;
      monthly_usage: number;
      daily_reset_at: string | null;
      monthly_reset_at: string | null;
      rotated_from: string | null;
      rotated_at: string | null;
    }>();

  return (results.results ?? []).map((r) => {
    let permissions: ApiKeyPermission[] = ['read'];
    try {
      permissions = JSON.parse(r.permissions || '["read"]') as ApiKeyPermission[];
    } catch {
      // Default to read if parsing fails
    }

    return {
      id: r.id,
      keyHash: r.key_hash,
      name: r.name,
      tier: r.tier as ApiKeyTier,
      rateLimitRpm: r.rate_limit_rpm,
      enabled: Boolean(r.enabled),
      owner: r.owner,
      createdAt: r.created_at,
      expiresAt: r.expires_at,
      lastUsedAt: r.last_used_at,
      usageCount: r.usage_count,
      permissions,
      description: r.description,
      dailyQuota: r.daily_quota,
      monthlyQuota: r.monthly_quota,
      dailyUsage: r.daily_usage,
      monthlyUsage: r.monthly_usage,
      dailyResetAt: r.daily_reset_at,
      monthlyResetAt: r.monthly_reset_at,
      rotatedFrom: r.rotated_from,
      rotatedAt: r.rotated_at,
    };
  });
}

/**
 * Disable an API key
 */
export async function disableApiKey(db: D1Database, keyId: string): Promise<boolean> {
  const result = await db.prepare('UPDATE api_keys SET enabled = 0 WHERE id = ?').bind(keyId).run();

  if (result.meta.changes > 0) {
    globalLogger.info('API key disabled', { keyId });
    return true;
  }
  return false;
}

/**
 * Delete an API key
 */
export async function deleteApiKey(db: D1Database, keyId: string): Promise<boolean> {
  const result = await db.prepare('DELETE FROM api_keys WHERE id = ?').bind(keyId).run();

  if (result.meta.changes > 0) {
    globalLogger.info('API key deleted', { keyId });
    return true;
  }
  return false;
}

/**
 * Rotate an API key - creates a new key while disabling the old one
 * The old key remains in the database for audit purposes
 */
export async function rotateApiKey(
  db: D1Database,
  keyId: string
): Promise<{ key: string; record: ApiKeyRecord } | null> {
  // Get the existing key
  const existing = await getApiKey(db, keyId);
  if (!existing) {
    return null;
  }

  // Disable the old key
  await db.prepare('UPDATE api_keys SET enabled = 0 WHERE id = ?').bind(keyId).run();

  // Create a new key with the same properties
  const newKey = await generateApiKey();
  const newKeyHash = await hashApiKey(newKey);
  const newId = crypto.randomUUID();
  const now = new Date().toISOString();

  await db
    .prepare(
      `
		INSERT INTO api_keys (
		  id, key_hash, name, tier, rate_limit_rpm, owner, expires_at,
		  permissions, description, daily_quota, monthly_quota, rotated_from, rotated_at
		)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
	`
    )
    .bind(
      newId,
      newKeyHash,
      existing.name,
      existing.tier,
      existing.rateLimitRpm,
      existing.owner,
      existing.expiresAt,
      JSON.stringify(existing.permissions),
      existing.description,
      existing.dailyQuota,
      existing.monthlyQuota,
      keyId, // rotated_from
      now // rotated_at
    )
    .run();

  const record: ApiKeyRecord = {
    id: newId,
    keyHash: newKeyHash,
    name: existing.name,
    tier: existing.tier,
    rateLimitRpm: existing.rateLimitRpm,
    enabled: true,
    owner: existing.owner,
    createdAt: now,
    expiresAt: existing.expiresAt,
    lastUsedAt: null,
    usageCount: 0,
    permissions: existing.permissions,
    description: existing.description,
    dailyQuota: existing.dailyQuota,
    monthlyQuota: existing.monthlyQuota,
    dailyUsage: 0,
    monthlyUsage: 0,
    dailyResetAt: null,
    monthlyResetAt: null,
    rotatedFrom: keyId,
    rotatedAt: now,
  };

  globalLogger.info('API key rotated', { oldKeyId: keyId, newKeyId: newId, name: existing.name });

  return { key: newKey, record };
}

/**
 * Get usage statistics for an API key
 */
export async function getApiKeyUsage(
  db: D1Database,
  keyId: string,
  options: { period?: 'day' | 'week' | 'month'; limit?: number } = {}
): Promise<{
  totalRequests: number;
  recentEndpoints: Array<{ endpoint: string; count: number }>;
  recentRequests: Array<{
    endpoint: string;
    method: string;
    statusCode: number | null;
    responseTimeMs: number | null;
    timestamp: string;
  }>;
}> {
  const period = options.period ?? 'day';
  const limit = options.limit ?? 100;

  // Calculate start date based on period
  let periodFilter: string;
  switch (period) {
    case 'week':
      periodFilter = "datetime('now', '-7 days')";
      break;
    case 'month':
      periodFilter = "datetime('now', '-30 days')";
      break;
    case 'day':
    default:
      periodFilter = "datetime('now', '-1 day')";
  }

  // Get total requests in period
  const totalResult = await db
    .prepare(
      `
		SELECT COUNT(*) as count
		FROM api_key_usage
		WHERE key_id = ? AND timestamp >= ${periodFilter}
	`
    )
    .bind(keyId)
    .first<{ count: number }>();

  // Get endpoint breakdown
  const endpointResults = await db
    .prepare(
      `
		SELECT endpoint, COUNT(*) as count
		FROM api_key_usage
		WHERE key_id = ? AND timestamp >= ${periodFilter}
		GROUP BY endpoint
		ORDER BY count DESC
		LIMIT 10
	`
    )
    .bind(keyId)
    .all<{ endpoint: string; count: number }>();

  // Get recent requests
  const recentResults = await db
    .prepare(
      `
		SELECT endpoint, method, status_code, response_time_ms, timestamp
		FROM api_key_usage
		WHERE key_id = ?
		ORDER BY timestamp DESC
		LIMIT ?
	`
    )
    .bind(keyId, limit)
    .all<{
      endpoint: string;
      method: string;
      status_code: number | null;
      response_time_ms: number | null;
      timestamp: string;
    }>();

  return {
    totalRequests: totalResult?.count ?? 0,
    recentEndpoints: endpointResults.results ?? [],
    recentRequests: (recentResults.results ?? []).map((r) => ({
      endpoint: r.endpoint,
      method: r.method,
      statusCode: r.status_code,
      responseTimeMs: r.response_time_ms,
      timestamp: r.timestamp,
    })),
  };
}

/**
 * Update API key properties
 */
export async function updateApiKey(
  db: D1Database,
  keyId: string,
  updates: {
    name?: string;
    tier?: ApiKeyTier;
    rateLimitRpm?: number | null;
    permissions?: ApiKeyPermission[];
    description?: string | null;
    dailyQuota?: number | null;
    monthlyQuota?: number | null;
    expiresAt?: string | null;
    enabled?: boolean;
  }
): Promise<ApiKeyRecord | null> {
  const existing = await getApiKey(db, keyId);
  if (!existing) {
    return null;
  }

  const setClauses: string[] = ["updated_at = datetime('now')"];
  const params: (string | number | null)[] = [];

  if (updates.name !== undefined) {
    setClauses.push('name = ?');
    params.push(updates.name);
  }
  if (updates.tier !== undefined) {
    setClauses.push('tier = ?');
    params.push(updates.tier);
  }
  if (updates.rateLimitRpm !== undefined) {
    setClauses.push('rate_limit_rpm = ?');
    params.push(updates.rateLimitRpm);
  }
  if (updates.permissions !== undefined) {
    setClauses.push('permissions = ?');
    params.push(JSON.stringify(updates.permissions));
  }
  if (updates.description !== undefined) {
    setClauses.push('description = ?');
    params.push(updates.description);
  }
  if (updates.dailyQuota !== undefined) {
    setClauses.push('daily_quota = ?');
    params.push(updates.dailyQuota);
  }
  if (updates.monthlyQuota !== undefined) {
    setClauses.push('monthly_quota = ?');
    params.push(updates.monthlyQuota);
  }
  if (updates.expiresAt !== undefined) {
    setClauses.push('expires_at = ?');
    params.push(updates.expiresAt);
  }
  if (updates.enabled !== undefined) {
    setClauses.push('enabled = ?');
    params.push(updates.enabled ? 1 : 0);
  }

  params.push(keyId);

  await db
    .prepare(`UPDATE api_keys SET ${setClauses.join(', ')} WHERE id = ?`)
    .bind(...params)
    .run();

  globalLogger.info('API key updated', { keyId, updates: Object.keys(updates) });

  return getApiKey(db, keyId);
}
