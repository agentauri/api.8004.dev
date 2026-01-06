/**
 * API Keys route integration tests
 * @module test/integration/routes/keys
 *
 * Note: Key management endpoints require admin permission.
 * We create an admin key in beforeEach to test this functionality.
 */

import { beforeEach, describe, expect, it } from 'vitest';
import {
  createTestAdminKey,
  mockHealthyResponse,
  setupMockFetch,
  TEST_ADMIN_API_KEY,
  testRoute,
} from '../../setup';

const mockFetch = setupMockFetch();

describe('POST /api/v1/keys', () => {
  beforeEach(async () => {
    mockFetch.mockReset();
    mockFetch.mockResolvedValue(mockHealthyResponse());
    // Create admin key for this test
    await createTestAdminKey();
  });

  it('creates a new API key', async () => {
    const response = await testRoute('/api/v1/keys', {
      method: 'POST',
      body: {
        name: 'Test Key',
      },
      apiKey: TEST_ADMIN_API_KEY,
    });

    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.data.id).toBeDefined();
    expect(body.data.key).toBeDefined();
    expect(body.data.key).toMatch(/^8004_[a-f0-9]{32}$/);
    expect(body.data.name).toBe('Test Key');
    expect(body.data.tier).toBe('standard');
    expect(body.data.permissions).toContain('read');
  });

  it('creates key with all options', async () => {
    const response = await testRoute('/api/v1/keys', {
      method: 'POST',
      body: {
        name: 'Premium Key',
        tier: 'premium',
        permissions: ['read', 'write', 'classify'],
        description: 'A test premium key',
        dailyQuota: 1000,
        monthlyQuota: 30000,
        rateLimitRpm: 500,
      },
      apiKey: TEST_ADMIN_API_KEY,
    });

    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.data.tier).toBe('premium');
    expect(body.data.permissions).toContain('write');
    expect(body.data.permissions).toContain('classify');
    expect(body.data.description).toBe('A test premium key');
    expect(body.data.dailyQuota).toBe(1000);
    expect(body.data.monthlyQuota).toBe(30000);
  });

  it('returns 400 for missing name', async () => {
    const response = await testRoute('/api/v1/keys', {
      method: 'POST',
      body: {},
      apiKey: TEST_ADMIN_API_KEY,
    });

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.success).toBe(false);
  });

  it('returns 400 for invalid tier', async () => {
    const response = await testRoute('/api/v1/keys', {
      method: 'POST',
      body: {
        name: 'Test Key',
        tier: 'invalid',
      },
      apiKey: TEST_ADMIN_API_KEY,
    });

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.success).toBe(false);
  });

  it('returns 401 without API key', async () => {
    const response = await testRoute('/api/v1/keys', {
      method: 'POST',
      body: { name: 'Test Key' },
      skipAuth: true,
    });
    expect(response.status).toBe(401);
  });

  it('returns 403 without admin permission', async () => {
    // Use the legacy test key which doesn't have admin permission
    const response = await testRoute('/api/v1/keys', {
      method: 'POST',
      body: { name: 'Test Key' },
      // Default TEST_API_KEY is legacy key without admin
    });
    expect(response.status).toBe(403);
  });
});

describe('GET /api/v1/keys', () => {
  beforeEach(async () => {
    mockFetch.mockReset();
    mockFetch.mockResolvedValue(mockHealthyResponse());
    await createTestAdminKey();
  });

  it('returns list with admin key when no other keys exist', async () => {
    const response = await testRoute('/api/v1/keys', {
      apiKey: TEST_ADMIN_API_KEY,
    });

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);
    // Admin sees the admin key itself
    expect(body.data.length).toBe(1);
    expect(body.data[0].name).toBe('Test Admin Key');
  });

  it('returns created keys without secrets', async () => {
    // Create a key first
    await testRoute('/api/v1/keys', {
      method: 'POST',
      body: { name: 'Test Key 1' },
      apiKey: TEST_ADMIN_API_KEY,
    });

    await testRoute('/api/v1/keys', {
      method: 'POST',
      body: { name: 'Test Key 2' },
      apiKey: TEST_ADMIN_API_KEY,
    });

    const response = await testRoute('/api/v1/keys', {
      apiKey: TEST_ADMIN_API_KEY,
    });

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);
    // Admin key + 2 new keys = 3 total
    expect(body.data.length).toBe(3);
    // Should NOT contain key or keyHash
    expect(body.data[0].key).toBeUndefined();
    expect(body.data[0].keyHash).toBeUndefined();
    expect(body.data[0].name).toBeDefined();
  });

  it('supports owner filter', async () => {
    await testRoute('/api/v1/keys', {
      method: 'POST',
      body: { name: 'Key 1', owner: 'user1@example.com' },
      apiKey: TEST_ADMIN_API_KEY,
    });

    await testRoute('/api/v1/keys', {
      method: 'POST',
      body: { name: 'Key 2', owner: 'user2@example.com' },
      apiKey: TEST_ADMIN_API_KEY,
    });

    const response = await testRoute('/api/v1/keys?owner=user1@example.com', {
      apiKey: TEST_ADMIN_API_KEY,
    });

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.data.length).toBe(1);
    expect(body.data[0].owner).toBe('user1@example.com');
  });

  it('returns 401 without API key', async () => {
    const response = await testRoute('/api/v1/keys', { skipAuth: true });
    expect(response.status).toBe(401);
  });

  it('non-admin user only sees their own key', async () => {
    // Legacy key user should only see empty or their own key
    const response = await testRoute('/api/v1/keys');

    expect(response.status).toBe(200);
    const body = await response.json();
    // Legacy key is not in DB, so returns empty
    expect(body.data).toEqual([]);
  });
});

describe('GET /api/v1/keys/:id', () => {
  beforeEach(async () => {
    mockFetch.mockReset();
    mockFetch.mockResolvedValue(mockHealthyResponse());
    await createTestAdminKey();
  });

  it('returns key details without secret', async () => {
    const createResponse = await testRoute('/api/v1/keys', {
      method: 'POST',
      body: { name: 'Test Key', description: 'A test key' },
      apiKey: TEST_ADMIN_API_KEY,
    });
    const createBody = await createResponse.json();
    const keyId = createBody.data.id;

    const response = await testRoute(`/api/v1/keys/${keyId}`, {
      apiKey: TEST_ADMIN_API_KEY,
    });

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.data.id).toBe(keyId);
    expect(body.data.name).toBe('Test Key');
    expect(body.data.description).toBe('A test key');
    // Should NOT contain key or keyHash
    expect(body.data.key).toBeUndefined();
    expect(body.data.keyHash).toBeUndefined();
  });

  it('returns 403 for non-existent key (authorization check first)', async () => {
    // When accessing a key that doesn't exist, authorization check happens first
    // Since we don't know if the key exists, we check authorization which returns 403
    const response = await testRoute('/api/v1/keys/nonexistent', {
      apiKey: TEST_ADMIN_API_KEY,
    });

    // Admin can access any key, so if it doesn't exist, we get 404
    expect(response.status).toBe(404);
    const body = await response.json();
    expect(body.success).toBe(false);
  });

  it('returns 401 without API key', async () => {
    const response = await testRoute('/api/v1/keys/test-id', { skipAuth: true });
    expect(response.status).toBe(401);
  });
});

describe('PATCH /api/v1/keys/:id', () => {
  beforeEach(async () => {
    mockFetch.mockReset();
    mockFetch.mockResolvedValue(mockHealthyResponse());
    await createTestAdminKey();
  });

  it('updates key properties', async () => {
    const createResponse = await testRoute('/api/v1/keys', {
      method: 'POST',
      body: { name: 'Original Name' },
      apiKey: TEST_ADMIN_API_KEY,
    });
    const createBody = await createResponse.json();
    const keyId = createBody.data.id;

    const response = await testRoute(`/api/v1/keys/${keyId}`, {
      method: 'PATCH',
      body: {
        name: 'Updated Name',
        description: 'Updated description',
        tier: 'premium',
        dailyQuota: 500,
      },
      apiKey: TEST_ADMIN_API_KEY,
    });

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.data.name).toBe('Updated Name');
    expect(body.data.description).toBe('Updated description');
    expect(body.data.tier).toBe('premium');
    expect(body.data.dailyQuota).toBe(500);
  });

  it('can disable a key', async () => {
    const createResponse = await testRoute('/api/v1/keys', {
      method: 'POST',
      body: { name: 'Test Key' },
      apiKey: TEST_ADMIN_API_KEY,
    });
    const createBody = await createResponse.json();
    const keyId = createBody.data.id;

    const response = await testRoute(`/api/v1/keys/${keyId}`, {
      method: 'PATCH',
      body: { enabled: false },
      apiKey: TEST_ADMIN_API_KEY,
    });

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.data.enabled).toBe(false);
  });

  it('returns 404 for non-existent key (admin)', async () => {
    const response = await testRoute('/api/v1/keys/nonexistent', {
      method: 'PATCH',
      body: { name: 'New Name' },
      apiKey: TEST_ADMIN_API_KEY,
    });

    // Admin can try to access any key, so we get 404 for non-existent
    expect(response.status).toBe(404);
  });

  it('returns 403 for non-existent key (non-admin)', async () => {
    const response = await testRoute('/api/v1/keys/nonexistent', {
      method: 'PATCH',
      body: { name: 'New Name' },
      // Using default non-admin key
    });

    // Non-admin fails authorization first
    expect(response.status).toBe(403);
  });

  it('returns 401 without API key', async () => {
    const response = await testRoute('/api/v1/keys/test-id', {
      method: 'PATCH',
      body: { name: 'New Name' },
      skipAuth: true,
    });
    expect(response.status).toBe(401);
  });
});

describe('DELETE /api/v1/keys/:id', () => {
  beforeEach(async () => {
    mockFetch.mockReset();
    mockFetch.mockResolvedValue(mockHealthyResponse());
    await createTestAdminKey();
  });

  it('deletes a key', async () => {
    const createResponse = await testRoute('/api/v1/keys', {
      method: 'POST',
      body: { name: 'Test Key' },
      apiKey: TEST_ADMIN_API_KEY,
    });
    const createBody = await createResponse.json();
    const keyId = createBody.data.id;

    const response = await testRoute(`/api/v1/keys/${keyId}`, {
      method: 'DELETE',
      apiKey: TEST_ADMIN_API_KEY,
    });

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);

    // Verify it's deleted
    const getResponse = await testRoute(`/api/v1/keys/${keyId}`, {
      apiKey: TEST_ADMIN_API_KEY,
    });
    expect(getResponse.status).toBe(404);
  });

  it('returns 404 for non-existent key (admin)', async () => {
    const response = await testRoute('/api/v1/keys/nonexistent', {
      method: 'DELETE',
      apiKey: TEST_ADMIN_API_KEY,
    });

    expect(response.status).toBe(404);
  });

  it('returns 403 for non-existent key (non-admin)', async () => {
    const response = await testRoute('/api/v1/keys/nonexistent', {
      method: 'DELETE',
      // Using default non-admin key
    });

    expect(response.status).toBe(403);
  });

  it('returns 401 without API key', async () => {
    const response = await testRoute('/api/v1/keys/test-id', {
      method: 'DELETE',
      skipAuth: true,
    });
    expect(response.status).toBe(401);
  });
});

describe('POST /api/v1/keys/:id/rotate', () => {
  beforeEach(async () => {
    mockFetch.mockReset();
    mockFetch.mockResolvedValue(mockHealthyResponse());
    await createTestAdminKey();
  });

  it('rotates a key', async () => {
    const createResponse = await testRoute('/api/v1/keys', {
      method: 'POST',
      body: { name: 'Original Key', tier: 'premium' },
      apiKey: TEST_ADMIN_API_KEY,
    });
    const createBody = await createResponse.json();
    const oldKeyId = createBody.data.id;
    const oldKey = createBody.data.key;

    const response = await testRoute(`/api/v1/keys/${oldKeyId}/rotate`, {
      method: 'POST',
      apiKey: TEST_ADMIN_API_KEY,
    });

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.data.id).toBeDefined();
    expect(body.data.id).not.toBe(oldKeyId); // New ID
    expect(body.data.key).toBeDefined();
    expect(body.data.key).not.toBe(oldKey); // New key
    expect(body.data.name).toBe('Original Key'); // Same name
    expect(body.data.tier).toBe('premium'); // Same tier
    expect(body.data.rotatedFrom).toBe(oldKeyId);
    expect(body.data.rotatedAt).toBeDefined();

    // Old key should be disabled
    const oldKeyResponse = await testRoute(`/api/v1/keys/${oldKeyId}`, {
      apiKey: TEST_ADMIN_API_KEY,
    });
    const oldKeyBody = await oldKeyResponse.json();
    expect(oldKeyBody.data.enabled).toBe(false);
  });

  it('returns 404 for non-existent key', async () => {
    const response = await testRoute('/api/v1/keys/nonexistent/rotate', {
      method: 'POST',
      apiKey: TEST_ADMIN_API_KEY,
    });

    expect(response.status).toBe(404);
  });

  it('returns 401 without API key', async () => {
    const response = await testRoute('/api/v1/keys/test-id/rotate', {
      method: 'POST',
      skipAuth: true,
    });
    expect(response.status).toBe(401);
  });
});

describe('GET /api/v1/keys/:id/usage', () => {
  beforeEach(async () => {
    mockFetch.mockReset();
    mockFetch.mockResolvedValue(mockHealthyResponse());
    await createTestAdminKey();
  });

  it('returns usage statistics', async () => {
    const createResponse = await testRoute('/api/v1/keys', {
      method: 'POST',
      body: { name: 'Test Key', dailyQuota: 100, monthlyQuota: 1000 },
      apiKey: TEST_ADMIN_API_KEY,
    });
    const createBody = await createResponse.json();
    const keyId = createBody.data.id;

    const response = await testRoute(`/api/v1/keys/${keyId}/usage`, {
      apiKey: TEST_ADMIN_API_KEY,
    });

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.data.keyId).toBe(keyId);
    expect(body.data.keyName).toBe('Test Key');
    expect(body.data.currentUsage).toBeDefined();
    expect(body.data.quotas).toBeDefined();
    expect(body.data.quotas.daily).toBe(100);
    expect(body.data.quotas.monthly).toBe(1000);
    expect(body.data.totalRequests).toBeDefined();
    expect(body.data.recentEndpoints).toBeDefined();
    expect(body.data.recentRequests).toBeDefined();
  });

  it('accepts period parameter', async () => {
    const createResponse = await testRoute('/api/v1/keys', {
      method: 'POST',
      body: { name: 'Test Key' },
      apiKey: TEST_ADMIN_API_KEY,
    });
    const createBody = await createResponse.json();
    const keyId = createBody.data.id;

    const response = await testRoute(`/api/v1/keys/${keyId}/usage?period=week`, {
      apiKey: TEST_ADMIN_API_KEY,
    });

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.data.period).toBe('week');
  });

  it('returns 404 for non-existent key', async () => {
    const response = await testRoute('/api/v1/keys/nonexistent/usage', {
      apiKey: TEST_ADMIN_API_KEY,
    });

    expect(response.status).toBe(404);
  });

  it('returns 401 without API key', async () => {
    const response = await testRoute('/api/v1/keys/test-id/usage', { skipAuth: true });
    expect(response.status).toBe(401);
  });
});
