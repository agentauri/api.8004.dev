/**
 * Verification route integration tests
 * @module test/integration/routes/verification
 */

import { env } from 'cloudflare:test';
import { beforeEach, describe, expect, it } from 'vitest';
import { mockHealthyResponse, setupMockFetch, testRoute } from '../../setup';

const mockFetch = setupMockFetch();

const TEST_AGENT_ID = '11155111:123';

describe('GET /api/v1/agents/:agentId/verification', () => {
  beforeEach(() => {
    mockFetch.mockReset();
    mockFetch.mockResolvedValue(mockHealthyResponse());
  });

  it('returns verification status with no verifications', async () => {
    const response = await testRoute(`/api/v1/agents/${TEST_AGENT_ID}/verification`);

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.data.agentId).toBe(TEST_AGENT_ID);
    expect(body.data.badge.level).toBe('none');
    expect(body.data.badge.verifiedMethods).toEqual([]);
    expect(body.data.badge.verificationCount).toBe(0);
    expect(body.data.verifications).toEqual([]);
    expect(body.data.availableMethods).toContain('dns');
    expect(body.data.availableMethods).toContain('ens');
    expect(body.data.availableMethods).toContain('github');
    expect(body.data.availableMethods).toContain('twitter');
  });

  it('returns verification status with existing verifications', async () => {
    // Insert a verified DNS verification
    await env.DB.prepare(
      `INSERT INTO agent_verifications (id, agent_id, chain_id, method, status, verified_at) VALUES (?, ?, ?, ?, ?, ?)`
    )
      .bind('test-id', TEST_AGENT_ID, 11155111, 'dns', 'verified', new Date().toISOString())
      .run();

    // Insert badge
    await env.DB.prepare(
      `INSERT INTO agent_verification_badges (agent_id, badge_level, verified_methods, verification_count, last_verified_at) VALUES (?, ?, ?, ?, ?)`
    )
      .bind(TEST_AGENT_ID, 'basic', JSON.stringify(['dns']), 1, new Date().toISOString())
      .run();

    const response = await testRoute(`/api/v1/agents/${TEST_AGENT_ID}/verification`);

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.data.badge.level).toBe('basic');
    expect(body.data.badge.verifiedMethods).toContain('dns');
    expect(body.data.badge.verificationCount).toBe(1);
    expect(body.data.verifications.length).toBe(1);
    expect(body.data.verifications[0].method).toBe('dns');
    expect(body.data.verifications[0].status).toBe('verified');
  });

  it('returns 400 for invalid agent ID', async () => {
    const response = await testRoute('/api/v1/agents/invalid/verification');

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.success).toBe(false);
  });
});

describe('POST /api/v1/agents/:agentId/verification/challenge', () => {
  beforeEach(() => {
    mockFetch.mockReset();
    mockFetch.mockResolvedValue(mockHealthyResponse());
  });

  it('creates a DNS verification challenge', async () => {
    const response = await testRoute(`/api/v1/agents/${TEST_AGENT_ID}/verification/challenge`, {
      method: 'POST',
      body: { method: 'dns' },
    });

    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.data.challengeId).toBeDefined();
    expect(body.data.method).toBe('dns');
    expect(body.data.challengeCode).toBeDefined();
    expect(body.data.expiresAt).toBeDefined();
    expect(body.data.instructions).toContain('TXT record');
    expect(body.data.attemptsRemaining).toBe(5);
  });

  it('creates a GitHub verification challenge', async () => {
    const response = await testRoute(`/api/v1/agents/${TEST_AGENT_ID}/verification/challenge`, {
      method: 'POST',
      body: { method: 'github' },
    });

    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.data.method).toBe('github');
    expect(body.data.instructions).toContain('gist');
  });

  it('creates an ENS verification challenge', async () => {
    const response = await testRoute(`/api/v1/agents/${TEST_AGENT_ID}/verification/challenge`, {
      method: 'POST',
      body: { method: 'ens' },
    });

    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.data.method).toBe('ens');
    expect(body.data.instructions).toContain('ENS');
  });

  it('creates a Twitter verification challenge', async () => {
    const response = await testRoute(`/api/v1/agents/${TEST_AGENT_ID}/verification/challenge`, {
      method: 'POST',
      body: { method: 'twitter' },
    });

    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.data.method).toBe('twitter');
    expect(body.data.instructions).toContain('Tweet');
  });

  it('returns 400 for invalid method', async () => {
    const response = await testRoute(`/api/v1/agents/${TEST_AGENT_ID}/verification/challenge`, {
      method: 'POST',
      body: { method: 'invalid' },
    });

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.success).toBe(false);
  });

  it('returns 400 for missing method', async () => {
    const response = await testRoute(`/api/v1/agents/${TEST_AGENT_ID}/verification/challenge`, {
      method: 'POST',
      body: {},
    });

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.success).toBe(false);
  });

  it('returns 400 for invalid agent ID', async () => {
    const response = await testRoute('/api/v1/agents/invalid/verification/challenge', {
      method: 'POST',
      body: { method: 'dns' },
    });

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.success).toBe(false);
  });
});

describe('POST /api/v1/agents/:agentId/verification/verify', () => {
  beforeEach(() => {
    mockFetch.mockReset();
    mockFetch.mockResolvedValue(mockHealthyResponse());
  });

  it('returns 400 when no challenge exists', async () => {
    const response = await testRoute(`/api/v1/agents/${TEST_AGENT_ID}/verification/verify`, {
      method: 'POST',
      body: { method: 'dns' },
    });

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.success).toBe(false);
    expect(body.error).toContain('No pending challenge');
  });

  it('attempts verification with existing challenge', async () => {
    // First create a challenge
    await testRoute(`/api/v1/agents/${TEST_AGENT_ID}/verification/challenge`, {
      method: 'POST',
      body: { method: 'dns' },
    });

    // DNS verification will fail because there's no actual DNS record
    // But we can verify the endpoint works
    const response = await testRoute(`/api/v1/agents/${TEST_AGENT_ID}/verification/verify`, {
      method: 'POST',
      body: { method: 'dns', proofData: 'example.com' },
    });

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.data.verified).toBe(false);
    expect(body.data.method).toBe('dns');
    // Should have decrement attempts
    expect(body.data.attemptsRemaining).toBeDefined();
  });

  it('returns 400 for invalid method', async () => {
    const response = await testRoute(`/api/v1/agents/${TEST_AGENT_ID}/verification/verify`, {
      method: 'POST',
      body: { method: 'invalid' },
    });

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.success).toBe(false);
  });
});

describe('GET /api/v1/agents/:agentId/verification/challenge', () => {
  beforeEach(() => {
    mockFetch.mockReset();
    mockFetch.mockResolvedValue(mockHealthyResponse());
  });

  it('returns hasChallenge: false when no challenge exists', async () => {
    const response = await testRoute(
      `/api/v1/agents/${TEST_AGENT_ID}/verification/challenge?method=dns`
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.data.hasChallenge).toBe(false);
    expect(body.data.method).toBe('dns');
  });

  it('returns challenge details when challenge exists', async () => {
    // First create a challenge
    const createResponse = await testRoute(
      `/api/v1/agents/${TEST_AGENT_ID}/verification/challenge`,
      {
        method: 'POST',
        body: { method: 'dns' },
      }
    );
    const createBody = await createResponse.json();
    const challengeCode = createBody.data.challengeCode;

    // Then check challenge status
    const response = await testRoute(
      `/api/v1/agents/${TEST_AGENT_ID}/verification/challenge?method=dns`
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.data.hasChallenge).toBe(true);
    expect(body.data.method).toBe('dns');
    expect(body.data.challengeCode).toBe(challengeCode);
    expect(body.data.expiresAt).toBeDefined();
    expect(body.data.attemptsRemaining).toBe(5);
  });

  it('returns 400 for missing method param', async () => {
    const response = await testRoute(`/api/v1/agents/${TEST_AGENT_ID}/verification/challenge`);

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.success).toBe(false);
  });

  it('returns 400 for invalid method param', async () => {
    const response = await testRoute(
      `/api/v1/agents/${TEST_AGENT_ID}/verification/challenge?method=invalid`
    );

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.success).toBe(false);
  });
});

describe('Verification badge levels', () => {
  beforeEach(() => {
    mockFetch.mockReset();
    mockFetch.mockResolvedValue(mockHealthyResponse());
  });

  it('shows basic badge with 1 verification', async () => {
    // Insert 1 verified method
    await env.DB.prepare(
      `INSERT INTO agent_verifications (id, agent_id, chain_id, method, status, verified_at) VALUES (?, ?, ?, ?, ?, ?)`
    )
      .bind('id-1', TEST_AGENT_ID, 11155111, 'dns', 'verified', new Date().toISOString())
      .run();

    await env.DB.prepare(
      `INSERT INTO agent_verification_badges (agent_id, badge_level, verified_methods, verification_count) VALUES (?, ?, ?, ?)`
    )
      .bind(TEST_AGENT_ID, 'basic', JSON.stringify(['dns']), 1)
      .run();

    const response = await testRoute(`/api/v1/agents/${TEST_AGENT_ID}/verification`);
    const body = await response.json();

    expect(body.data.badge.level).toBe('basic');
    expect(body.data.badge.verificationCount).toBe(1);
  });

  it('shows verified badge with 2 verifications', async () => {
    // Insert 2 verified methods
    await env.DB.prepare(
      `INSERT INTO agent_verifications (id, agent_id, chain_id, method, status, verified_at) VALUES (?, ?, ?, ?, ?, ?)`
    )
      .bind('id-1', TEST_AGENT_ID, 11155111, 'dns', 'verified', new Date().toISOString())
      .run();

    await env.DB.prepare(
      `INSERT INTO agent_verifications (id, agent_id, chain_id, method, status, verified_at) VALUES (?, ?, ?, ?, ?, ?)`
    )
      .bind('id-2', TEST_AGENT_ID, 11155111, 'github', 'verified', new Date().toISOString())
      .run();

    await env.DB.prepare(
      `INSERT INTO agent_verification_badges (agent_id, badge_level, verified_methods, verification_count) VALUES (?, ?, ?, ?)`
    )
      .bind(TEST_AGENT_ID, 'verified', JSON.stringify(['dns', 'github']), 2)
      .run();

    const response = await testRoute(`/api/v1/agents/${TEST_AGENT_ID}/verification`);
    const body = await response.json();

    expect(body.data.badge.level).toBe('verified');
    expect(body.data.badge.verificationCount).toBe(2);
  });

  it('shows official badge with 3+ verifications', async () => {
    // Insert 3 verified methods
    await env.DB.prepare(
      `INSERT INTO agent_verifications (id, agent_id, chain_id, method, status, verified_at) VALUES (?, ?, ?, ?, ?, ?)`
    )
      .bind('id-1', TEST_AGENT_ID, 11155111, 'dns', 'verified', new Date().toISOString())
      .run();

    await env.DB.prepare(
      `INSERT INTO agent_verifications (id, agent_id, chain_id, method, status, verified_at) VALUES (?, ?, ?, ?, ?, ?)`
    )
      .bind('id-2', TEST_AGENT_ID, 11155111, 'github', 'verified', new Date().toISOString())
      .run();

    await env.DB.prepare(
      `INSERT INTO agent_verifications (id, agent_id, chain_id, method, status, verified_at) VALUES (?, ?, ?, ?, ?, ?)`
    )
      .bind('id-3', TEST_AGENT_ID, 11155111, 'ens', 'verified', new Date().toISOString())
      .run();

    await env.DB.prepare(
      `INSERT INTO agent_verification_badges (agent_id, badge_level, verified_methods, verification_count) VALUES (?, ?, ?, ?)`
    )
      .bind(TEST_AGENT_ID, 'official', JSON.stringify(['dns', 'github', 'ens']), 3)
      .run();

    const response = await testRoute(`/api/v1/agents/${TEST_AGENT_ID}/verification`);
    const body = await response.json();

    expect(body.data.badge.level).toBe('official');
    expect(body.data.badge.verificationCount).toBe(3);
  });
});
