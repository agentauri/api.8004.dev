/**
 * MCP Session Service tests
 * @module test/unit/services/mcp-session
 */

import { env } from 'cloudflare:test';
import {
  type MCPSessionService,
  MCP_SESSION_TTL,
  createMCPSessionService,
} from '@/services/mcp-session';
import type { CreateSessionData } from '@/types/mcp-session';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

describe('createMCPSessionService', () => {
  let service: MCPSessionService;

  beforeEach(() => {
    service = createMCPSessionService(env.CACHE);
  });

  afterEach(async () => {
    // Clean up any test sessions
    await env.CACHE.delete('mcp-session:test-session-1');
    await env.CACHE.delete('mcp-session:test-session-2');
    await env.CACHE.delete('mcp-session:test-session-update');
    await env.CACHE.delete('mcp-session:test-session-delete');
    await env.CACHE.delete('mcp-session:test-session-touch');
    await env.CACHE.delete('mcp-session:invalid-json');
  });

  it('creates service instance with all methods', () => {
    expect(service).toBeDefined();
    expect(service.create).toBeDefined();
    expect(service.get).toBeDefined();
    expect(service.update).toBeDefined();
    expect(service.delete).toBeDefined();
    expect(service.touch).toBeDefined();
  });

  describe('MCP_SESSION_TTL', () => {
    it('has correct TTL value (1 hour)', () => {
      expect(MCP_SESSION_TTL).toBe(3600);
    });
  });

  describe('create', () => {
    it('creates a new session with timestamps', async () => {
      const data: CreateSessionData = {
        sessionId: 'test-session-1',
        protocolVersion: '2025-11-25',
        clientInfo: { name: 'TestClient', version: '1.0.0' },
        serverInfo: { name: '8004.dev MCP', version: '1.0.0' },
        initialized: false,
      };

      const session = await service.create(data);

      expect(session.sessionId).toBe('test-session-1');
      expect(session.protocolVersion).toBe('2025-11-25');
      expect(session.clientInfo).toEqual({ name: 'TestClient', version: '1.0.0' });
      expect(session.serverInfo).toEqual({ name: '8004.dev MCP', version: '1.0.0' });
      expect(session.initialized).toBe(false);
      expect(session.createdAt).toBeDefined();
      expect(session.lastActivityAt).toBeDefined();
      expect(session.createdAt).toBe(session.lastActivityAt);
    });

    it('stores session in KV', async () => {
      const data: CreateSessionData = {
        sessionId: 'test-session-2',
        protocolVersion: '2025-11-25',
        serverInfo: { name: '8004.dev MCP', version: '1.0.0' },
        initialized: true,
      };

      await service.create(data);

      // Verify it's stored in KV
      const stored = await env.CACHE.get('mcp-session:test-session-2');
      expect(stored).not.toBeNull();

      const parsed = JSON.parse(stored as string);
      expect(parsed.sessionId).toBe('test-session-2');
    });
  });

  describe('get', () => {
    it('returns null for non-existent session', async () => {
      const session = await service.get('nonexistent-session');
      expect(session).toBeNull();
    });

    it('retrieves an existing session', async () => {
      const data: CreateSessionData = {
        sessionId: 'test-session-1',
        protocolVersion: '2025-11-25',
        serverInfo: { name: '8004.dev MCP', version: '1.0.0' },
        initialized: true,
      };

      await service.create(data);
      const session = await service.get('test-session-1');

      expect(session).not.toBeNull();
      expect(session?.sessionId).toBe('test-session-1');
      expect(session?.initialized).toBe(true);
    });

    it('returns null for invalid JSON in KV', async () => {
      // Store invalid JSON directly
      await env.CACHE.put('mcp-session:invalid-json', 'not valid json');

      const session = await service.get('invalid-json');
      expect(session).toBeNull();
    });
  });

  describe('update', () => {
    it('returns null when updating non-existent session', async () => {
      const result = await service.update('nonexistent', { initialized: true });
      expect(result).toBeNull();
    });

    it('updates session data and refreshes lastActivityAt', async () => {
      const data: CreateSessionData = {
        sessionId: 'test-session-update',
        protocolVersion: '2025-11-25',
        serverInfo: { name: '8004.dev MCP', version: '1.0.0' },
        initialized: false,
      };

      const created = await service.create(data);
      const originalLastActivity = created.lastActivityAt;

      // Wait a tiny bit to ensure timestamp changes
      await new Promise((resolve) => setTimeout(resolve, 10));

      const updated = await service.update('test-session-update', {
        initialized: true,
        clientInfo: { name: 'UpdatedClient', version: '2.0.0' },
      });

      expect(updated).not.toBeNull();
      expect(updated?.initialized).toBe(true);
      expect(updated?.clientInfo).toEqual({ name: 'UpdatedClient', version: '2.0.0' });
      expect(updated?.lastActivityAt).not.toBe(originalLastActivity);
    });

    it('preserves unchanged fields', async () => {
      const data: CreateSessionData = {
        sessionId: 'test-session-update',
        protocolVersion: '2025-11-25',
        clientInfo: { name: 'OriginalClient', version: '1.0.0' },
        serverInfo: { name: '8004.dev MCP', version: '1.0.0' },
        initialized: false,
      };

      await service.create(data);
      const updated = await service.update('test-session-update', { initialized: true });

      expect(updated?.clientInfo).toEqual({ name: 'OriginalClient', version: '1.0.0' });
      expect(updated?.protocolVersion).toBe('2025-11-25');
    });
  });

  describe('delete', () => {
    it('deletes an existing session', async () => {
      const data: CreateSessionData = {
        sessionId: 'test-session-delete',
        protocolVersion: '2025-11-25',
        serverInfo: { name: '8004.dev MCP', version: '1.0.0' },
        initialized: true,
      };

      await service.create(data);

      // Verify it exists
      const before = await service.get('test-session-delete');
      expect(before).not.toBeNull();

      // Delete it
      await service.delete('test-session-delete');

      // Verify it's gone
      const after = await service.get('test-session-delete');
      expect(after).toBeNull();
    });

    it('does not throw when deleting non-existent session', async () => {
      // Should not throw
      await expect(service.delete('nonexistent')).resolves.not.toThrow();
    });
  });

  describe('touch', () => {
    it('returns null when touching non-existent session', async () => {
      const result = await service.touch('nonexistent');
      expect(result).toBeNull();
    });

    it('updates lastActivityAt without changing other fields', async () => {
      const data: CreateSessionData = {
        sessionId: 'test-session-touch',
        protocolVersion: '2025-11-25',
        clientInfo: { name: 'TestClient', version: '1.0.0' },
        serverInfo: { name: '8004.dev MCP', version: '1.0.0' },
        initialized: true,
      };

      const created = await service.create(data);
      const originalLastActivity = created.lastActivityAt;

      // Wait a tiny bit to ensure timestamp changes
      await new Promise((resolve) => setTimeout(resolve, 10));

      const touched = await service.touch('test-session-touch');

      expect(touched).not.toBeNull();
      expect(touched?.sessionId).toBe('test-session-touch');
      expect(touched?.initialized).toBe(true);
      expect(touched?.clientInfo).toEqual({ name: 'TestClient', version: '1.0.0' });
      expect(touched?.lastActivityAt).not.toBe(originalLastActivity);
    });
  });
});
