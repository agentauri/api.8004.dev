-- OAuth 2.0 tables for MCP server authentication
-- Supports Dynamic Client Registration (RFC 7591) and PKCE (RFC 7636)

-- OAuth Clients (Dynamic Client Registration)
CREATE TABLE IF NOT EXISTS oauth_clients (
  id TEXT PRIMARY KEY,
  client_id TEXT NOT NULL UNIQUE,
  client_secret TEXT,  -- Hashed with SHA-256, NULL for public clients
  client_name TEXT NOT NULL,
  redirect_uris TEXT NOT NULL,  -- JSON array of allowed redirect URIs
  grant_types TEXT DEFAULT '["authorization_code"]',  -- JSON array
  token_endpoint_auth_method TEXT DEFAULT 'client_secret_post',
  registered_at TEXT DEFAULT (datetime('now'))
);

-- Authorization Codes (short-lived, 10 min)
CREATE TABLE IF NOT EXISTS oauth_authorization_codes (
  id TEXT PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,  -- Hashed with SHA-256
  client_id TEXT NOT NULL,
  redirect_uri TEXT NOT NULL,
  code_challenge TEXT NOT NULL,  -- PKCE challenge
  code_challenge_method TEXT DEFAULT 'S256',
  resource TEXT NOT NULL,  -- MCP server URL (audience)
  scope TEXT,  -- Space-separated scopes
  state TEXT,  -- Client state for CSRF protection
  expires_at TEXT NOT NULL,
  used INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (client_id) REFERENCES oauth_clients(client_id) ON DELETE CASCADE
);

-- Access Tokens (1 hour TTL)
CREATE TABLE IF NOT EXISTS oauth_access_tokens (
  id TEXT PRIMARY KEY,
  token_hash TEXT NOT NULL UNIQUE,  -- SHA-256 hash of token
  client_id TEXT NOT NULL,
  scope TEXT,  -- Granted scopes
  resource TEXT NOT NULL,  -- Audience
  expires_at TEXT NOT NULL,
  revoked INTEGER DEFAULT 0,
  issued_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (client_id) REFERENCES oauth_clients(client_id) ON DELETE CASCADE
);

-- Refresh Tokens (30 day TTL)
CREATE TABLE IF NOT EXISTS oauth_refresh_tokens (
  id TEXT PRIMARY KEY,
  token_hash TEXT NOT NULL UNIQUE,  -- SHA-256 hash of token
  client_id TEXT NOT NULL,
  scope TEXT,  -- Granted scopes
  resource TEXT NOT NULL,  -- Audience
  expires_at TEXT NOT NULL,
  revoked INTEGER DEFAULT 0,
  issued_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (client_id) REFERENCES oauth_clients(client_id) ON DELETE CASCADE
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_oauth_clients_client_id ON oauth_clients(client_id);
CREATE INDEX IF NOT EXISTS idx_oauth_auth_codes_code ON oauth_authorization_codes(code);
CREATE INDEX IF NOT EXISTS idx_oauth_auth_codes_client_id ON oauth_authorization_codes(client_id);
CREATE INDEX IF NOT EXISTS idx_oauth_auth_codes_expires ON oauth_authorization_codes(expires_at);
CREATE INDEX IF NOT EXISTS idx_oauth_access_tokens_hash ON oauth_access_tokens(token_hash);
CREATE INDEX IF NOT EXISTS idx_oauth_access_tokens_client ON oauth_access_tokens(client_id);
CREATE INDEX IF NOT EXISTS idx_oauth_access_tokens_expires ON oauth_access_tokens(expires_at);
CREATE INDEX IF NOT EXISTS idx_oauth_refresh_tokens_hash ON oauth_refresh_tokens(token_hash);
CREATE INDEX IF NOT EXISTS idx_oauth_refresh_tokens_client ON oauth_refresh_tokens(client_id);
CREATE INDEX IF NOT EXISTS idx_oauth_refresh_tokens_expires ON oauth_refresh_tokens(expires_at);
