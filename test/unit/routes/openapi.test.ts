/**
 * OpenAPI endpoint tests
 * @module test/unit/routes/openapi
 */

import { env } from 'cloudflare:test';
import { Hono } from 'hono';
import { describe, expect, it } from 'vitest';
import { openapi } from '@/routes/openapi';
import type { Env, Variables } from '@/types';

function createTestApp() {
  const app = new Hono<{ Bindings: Env; Variables: Variables }>();
  app.route('/api/v1/openapi', openapi);
  return app;
}

describe('GET /api/v1/openapi/openapi.json', () => {
  it('returns OpenAPI specification', async () => {
    const app = createTestApp();
    const res = await app.request('/api/v1/openapi/openapi.json', {}, env);

    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.openapi).toBe('3.1.0');
    expect(data.info.title).toBe('8004 Backend API');
    expect(data.info.version).toBe('2.2.0');
  });

  it('includes all required paths', async () => {
    const app = createTestApp();
    const res = await app.request('/api/v1/openapi/openapi.json', {}, env);
    const data = await res.json();

    const expectedPaths = [
      '/api/v1/health',
      '/api/v1/agents',
      '/api/v1/agents/{agentId}',
      '/api/v1/agents/{agentId}/classify',
      '/api/v1/agents/{agentId}/reputation',
      '/api/v1/agents/{agentId}/reputation/feedback',
      '/api/v1/search',
      '/api/v1/chains',
      '/api/v1/stats',
      '/api/v1/taxonomy',
    ];

    for (const path of expectedPaths) {
      expect(data.paths).toHaveProperty(path);
    }
  });

  it('includes security scheme', async () => {
    const app = createTestApp();
    const res = await app.request('/api/v1/openapi/openapi.json', {}, env);
    const data = await res.json();

    expect(data.components.securitySchemes).toBeDefined();
    expect(data.components.securitySchemes.ApiKeyAuth).toBeDefined();
    expect(data.components.securitySchemes.ApiKeyAuth.type).toBe('apiKey');
    expect(data.components.securitySchemes.ApiKeyAuth.in).toBe('header');
    expect(data.components.securitySchemes.ApiKeyAuth.name).toBe('X-API-Key');
  });

  it('includes all required schemas', async () => {
    const app = createTestApp();
    const res = await app.request('/api/v1/openapi/openapi.json', {}, env);
    const data = await res.json();

    const expectedSchemas = [
      'ErrorResponse',
      'HealthResponse',
      'AgentSummary',
      'AgentDetail',
      'AgentListResponse',
      'AgentDetailResponse',
      'SearchRequest',
      'SearchResponse',
      'ClassificationResponse',
      'ReputationResponse',
      'ChainStatsResponse',
      'TaxonomyResponse',
    ];

    for (const schema of expectedSchemas) {
      expect(data.components.schemas).toHaveProperty(schema);
    }
  });

  it('includes tags for grouping', async () => {
    const app = createTestApp();
    const res = await app.request('/api/v1/openapi/openapi.json', {}, env);
    const data = await res.json();

    expect(data.tags).toBeDefined();
    expect(data.tags.length).toBeGreaterThan(0);

    const tagNames = data.tags.map((t: { name: string }) => t.name);
    expect(tagNames).toContain('Agents');
    expect(tagNames).toContain('Search');
    expect(tagNames).toContain('Health');
  });

  it('health endpoint has no security requirement', async () => {
    const app = createTestApp();
    const res = await app.request('/api/v1/openapi/openapi.json', {}, env);
    const data = await res.json();

    const healthPath = data.paths['/api/v1/health'];
    expect(healthPath.get.security).toEqual([]);
  });

  it('includes server information', async () => {
    const app = createTestApp();
    const res = await app.request('/api/v1/openapi/openapi.json', {}, env);
    const data = await res.json();

    expect(data.servers).toBeDefined();
    expect(data.servers.length).toBeGreaterThan(0);
    expect(data.servers[0].url).toBe('https://api.8004.dev');
  });
});

describe('GET /api/v1/openapi/openapi.yaml', () => {
  it('returns YAML content type', async () => {
    const app = createTestApp();
    const res = await app.request('/api/v1/openapi/openapi.yaml', {}, env);

    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toContain('application/x-yaml');
  });
});
