/**
 * MCP Session Types
 *
 * Types for managing MCP session state in KV storage.
 * Sessions are used to handle reconnection from Claude.ai web connector.
 */

/**
 * MCP Session stored in KV
 */
export interface MCPSession {
  /** Unique session identifier */
  sessionId: string;

  /** Negotiated protocol version (e.g., '2025-11-25') */
  protocolVersion: string;

  /** Client information from initialize request */
  clientInfo?: {
    name: string;
    version: string;
  };

  /** Server information sent in initialize response */
  serverInfo: {
    name: string;
    version: string;
  };

  /** ISO timestamp when session was created */
  createdAt: string;

  /** ISO timestamp of last activity (used for TTL refresh) */
  lastActivityAt: string;

  /** Whether the session has completed initialization */
  initialized: boolean;
}

/**
 * Data required to create a new session
 */
export type CreateSessionData = Omit<MCPSession, 'createdAt' | 'lastActivityAt'>;

/**
 * Data that can be updated on an existing session
 */
export type UpdateSessionData = Partial<Omit<MCPSession, 'sessionId' | 'createdAt'>>;
