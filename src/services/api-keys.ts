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
}

/**
 * API Key validation result
 */
export interface ApiKeyValidationResult {
  valid: boolean;
  keyId?: string;
  tier: ApiKeyTier;
  rateLimitRpm: number;
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
  }
): Promise<{ key: string; record: ApiKeyRecord }> {
  const key = await generateApiKey();
  const keyHash = await hashApiKey(key);
  const id = crypto.randomUUID();

  const tier = options.tier ?? 'standard';

  await db
    .prepare(
      `
		INSERT INTO api_keys (id, key_hash, name, tier, rate_limit_rpm, owner, expires_at)
		VALUES (?, ?, ?, ?, ?, ?, ?)
	`
    )
    .bind(
      id,
      keyHash,
      options.name,
      tier,
      options.rateLimitRpm ?? null,
      options.owner ?? null,
      options.expiresAt ?? null
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
		       created_at, expires_at, last_used_at, usage_count
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
    }>();

  // Key not found
  if (!result) {
    return {
      valid: false,
      tier: 'anonymous',
      rateLimitRpm: DEFAULT_RATE_LIMITS.anonymous,
      reason: 'Invalid API key',
    };
  }

  // Key disabled
  if (!result.enabled) {
    return {
      valid: false,
      tier: 'anonymous',
      rateLimitRpm: DEFAULT_RATE_LIMITS.anonymous,
      reason: 'API key is disabled',
    };
  }

  // Key expired
  if (result.expires_at && new Date(result.expires_at) < new Date()) {
    return {
      valid: false,
      tier: 'anonymous',
      rateLimitRpm: DEFAULT_RATE_LIMITS.anonymous,
      reason: 'API key has expired',
    };
  }

  const tier = result.tier as ApiKeyTier;
  const rateLimitRpm = result.rate_limit_rpm ?? DEFAULT_RATE_LIMITS[tier];

  // Update last_used_at and usage_count (fire and forget)
  db.prepare(
    `
		UPDATE api_keys
		SET last_used_at = datetime('now'), usage_count = usage_count + 1
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
		       created_at, expires_at, last_used_at, usage_count
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
    }>();

  if (!result) return null;

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
		       created_at, expires_at, last_used_at, usage_count
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
    }>();

  return (results.results ?? []).map((r) => ({
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
  }));
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
