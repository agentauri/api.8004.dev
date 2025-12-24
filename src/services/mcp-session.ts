/**
 * MCP Session Service
 *
 * Manages MCP session persistence in KV storage for handling
 * reconnection from Claude.ai web connector.
 */

import type { MCPSession, CreateSessionData, UpdateSessionData } from '../types/mcp-session';

/** Session TTL in seconds (1 hour) */
export const MCP_SESSION_TTL = 3600;

/** KV key prefix for MCP sessions */
const KEY_PREFIX = 'mcp-session:';

/**
 * MCP Session Service interface
 */
export interface MCPSessionService {
  /**
   * Create a new session
   */
  create(data: CreateSessionData): Promise<MCPSession>;

  /**
   * Get a session by ID
   */
  get(sessionId: string): Promise<MCPSession | null>;

  /**
   * Update an existing session
   */
  update(sessionId: string, data: UpdateSessionData): Promise<MCPSession | null>;

  /**
   * Delete a session
   */
  delete(sessionId: string): Promise<void>;

  /**
   * Touch a session (update lastActivityAt and refresh TTL)
   */
  touch(sessionId: string): Promise<MCPSession | null>;
}

/**
 * Create an MCP session service instance
 */
export function createMCPSessionService(kv: KVNamespace): MCPSessionService {
  const getKey = (sessionId: string) => `${KEY_PREFIX}${sessionId}`;

  return {
    async create(data: CreateSessionData): Promise<MCPSession> {
      const now = new Date().toISOString();
      const session: MCPSession = {
        ...data,
        createdAt: now,
        lastActivityAt: now,
      };

      await kv.put(getKey(data.sessionId), JSON.stringify(session), {
        expirationTtl: MCP_SESSION_TTL,
      });

      return session;
    },

    async get(sessionId: string): Promise<MCPSession | null> {
      const value = await kv.get(getKey(sessionId));
      if (!value) {
        return null;
      }

      try {
        return JSON.parse(value) as MCPSession;
      } catch {
        return null;
      }
    },

    async update(sessionId: string, data: UpdateSessionData): Promise<MCPSession | null> {
      const existing = await this.get(sessionId);
      if (!existing) {
        return null;
      }

      const updated: MCPSession = {
        ...existing,
        ...data,
        lastActivityAt: new Date().toISOString(),
      };

      await kv.put(getKey(sessionId), JSON.stringify(updated), {
        expirationTtl: MCP_SESSION_TTL,
      });

      return updated;
    },

    async delete(sessionId: string): Promise<void> {
      await kv.delete(getKey(sessionId));
    },

    async touch(sessionId: string): Promise<MCPSession | null> {
      return this.update(sessionId, {});
    },
  };
}
