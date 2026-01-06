/**
 * Webhooks route integration tests
 * @module test/integration/routes/webhooks
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { mockHealthyResponse, setupMockFetch, testRoute } from '../../setup';

const mockFetch = setupMockFetch();

describe('POST /api/v1/webhooks', () => {
  beforeEach(() => {
    mockFetch.mockReset();
    mockFetch.mockResolvedValue(mockHealthyResponse());
  });

  it('creates a new webhook successfully', async () => {
    const response = await testRoute('/api/v1/webhooks', {
      method: 'POST',
      body: {
        url: 'https://example.com/webhook',
        events: ['agent.registered', 'feedback.received'],
        description: 'Test webhook',
      },
    });

    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.data.id).toBeDefined();
    expect(body.data.url).toBe('https://example.com/webhook');
    expect(body.data.events).toContain('agent.registered');
    expect(body.data.secret).toBeDefined();
    expect(body.data.secret.length).toBe(64); // 32 bytes hex
  });

  it('returns 400 for invalid URL', async () => {
    const response = await testRoute('/api/v1/webhooks', {
      method: 'POST',
      body: {
        url: 'not-a-valid-url',
        events: ['agent.registered'],
      },
    });

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.success).toBe(false);
  });

  it('returns 400 for empty events array', async () => {
    const response = await testRoute('/api/v1/webhooks', {
      method: 'POST',
      body: {
        url: 'https://example.com/webhook',
        events: [],
      },
    });

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.success).toBe(false);
  });

  it('returns 400 for invalid event type', async () => {
    const response = await testRoute('/api/v1/webhooks', {
      method: 'POST',
      body: {
        url: 'https://example.com/webhook',
        events: ['invalid.event'],
      },
    });

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.success).toBe(false);
  });

  it('returns 401 without API key', async () => {
    const response = await testRoute('/api/v1/webhooks', {
      method: 'POST',
      body: {
        url: 'https://example.com/webhook',
        events: ['agent.registered'],
      },
      skipAuth: true,
    });
    expect(response.status).toBe(401);
  });

  it('accepts filters parameter', async () => {
    const response = await testRoute('/api/v1/webhooks', {
      method: 'POST',
      body: {
        url: 'https://example.com/webhook',
        events: ['agent.registered'],
        filters: {
          chainIds: [11155111, 84532],
        },
      },
    });

    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body.data.filters.chainIds).toContain(11155111);
  });
});

describe('GET /api/v1/webhooks', () => {
  beforeEach(() => {
    mockFetch.mockReset();
    mockFetch.mockResolvedValue(mockHealthyResponse());
  });

  it('returns empty list when no webhooks exist', async () => {
    const response = await testRoute('/api/v1/webhooks');

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.data).toEqual([]);
    expect(body.meta.total).toBe(0);
  });

  it('returns created webhooks', async () => {
    // Create a webhook first
    await testRoute('/api/v1/webhooks', {
      method: 'POST',
      body: {
        url: 'https://example.com/webhook',
        events: ['agent.registered'],
      },
    });

    const response = await testRoute('/api/v1/webhooks');

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.data.length).toBe(1);
    expect(body.data[0].url).toBe('https://example.com/webhook');
    // Secret should NOT be returned in list
    expect(body.data[0].secret).toBeUndefined();
  });

  it('returns 401 without API key', async () => {
    const response = await testRoute('/api/v1/webhooks', { skipAuth: true });
    expect(response.status).toBe(401);
  });
});

describe('GET /api/v1/webhooks/:id', () => {
  beforeEach(() => {
    mockFetch.mockReset();
    mockFetch.mockResolvedValue(mockHealthyResponse());
  });

  it('returns webhook details', async () => {
    // Create a webhook first
    const createResponse = await testRoute('/api/v1/webhooks', {
      method: 'POST',
      body: {
        url: 'https://example.com/webhook',
        events: ['agent.registered'],
        description: 'Test webhook',
      },
    });
    const createBody = await createResponse.json();
    const webhookId = createBody.data.id;

    const response = await testRoute(`/api/v1/webhooks/${webhookId}`);

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.data.id).toBe(webhookId);
    expect(body.data.url).toBe('https://example.com/webhook');
    expect(body.data.description).toBe('Test webhook');
    expect(body.data.recentDeliveries).toBeDefined();
  });

  it('returns 404 for non-existent webhook', async () => {
    const response = await testRoute('/api/v1/webhooks/nonexistent');

    expect(response.status).toBe(404);
    const body = await response.json();
    expect(body.success).toBe(false);
  });

  it('returns 401 without API key', async () => {
    const response = await testRoute('/api/v1/webhooks/test-id', { skipAuth: true });
    expect(response.status).toBe(401);
  });
});

describe('DELETE /api/v1/webhooks/:id', () => {
  beforeEach(() => {
    mockFetch.mockReset();
    mockFetch.mockResolvedValue(mockHealthyResponse());
  });

  it('deletes webhook successfully', async () => {
    // Create a webhook first
    const createResponse = await testRoute('/api/v1/webhooks', {
      method: 'POST',
      body: {
        url: 'https://example.com/webhook',
        events: ['agent.registered'],
      },
    });
    const createBody = await createResponse.json();
    const webhookId = createBody.data.id;

    const response = await testRoute(`/api/v1/webhooks/${webhookId}`, {
      method: 'DELETE',
    });

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);

    // Verify it's deleted
    const getResponse = await testRoute(`/api/v1/webhooks/${webhookId}`);
    expect(getResponse.status).toBe(404);
  });

  it('returns 404 for non-existent webhook', async () => {
    const response = await testRoute('/api/v1/webhooks/nonexistent', {
      method: 'DELETE',
    });

    expect(response.status).toBe(404);
    const body = await response.json();
    expect(body.success).toBe(false);
  });

  it('returns 401 without API key', async () => {
    const response = await testRoute('/api/v1/webhooks/test-id', {
      method: 'DELETE',
      skipAuth: true,
    });
    expect(response.status).toBe(401);
  });
});

describe('POST /api/v1/webhooks/:id/test', () => {
  beforeEach(() => {
    mockFetch.mockReset();
    mockFetch.mockResolvedValue(mockHealthyResponse());
  });

  it('sends test webhook', async () => {
    // Mock the webhook endpoint
    mockFetch.mockResolvedValueOnce(
      new Response('OK', { status: 200 }) as unknown as ReturnType<typeof mockHealthyResponse>
    );

    // Create a webhook first
    const createResponse = await testRoute('/api/v1/webhooks', {
      method: 'POST',
      body: {
        url: 'https://example.com/webhook',
        events: ['agent.registered'],
      },
    });
    const createBody = await createResponse.json();
    const webhookId = createBody.data.id;

    const response = await testRoute(`/api/v1/webhooks/${webhookId}/test`, {
      method: 'POST',
    });

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.data).toHaveProperty('delivered');
  });

  it('returns 404 for non-existent webhook', async () => {
    const response = await testRoute('/api/v1/webhooks/nonexistent/test', {
      method: 'POST',
    });

    expect(response.status).toBe(404);
    const body = await response.json();
    expect(body.success).toBe(false);
  });

  it('returns 401 without API key', async () => {
    const response = await testRoute('/api/v1/webhooks/test-id/test', {
      method: 'POST',
      skipAuth: true,
    });
    expect(response.status).toBe(401);
  });
});
