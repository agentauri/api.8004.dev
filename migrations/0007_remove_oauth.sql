-- Migration: Remove OAuth 2.0 tables
-- OAuth functionality removed in favor of public MCP access

DROP TABLE IF EXISTS oauth_access_tokens;
DROP TABLE IF EXISTS oauth_refresh_tokens;
DROP TABLE IF EXISTS oauth_authorization_codes;
DROP TABLE IF EXISTS oauth_clients;
