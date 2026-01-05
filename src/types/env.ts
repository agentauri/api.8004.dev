/**
 * Environment bindings for Cloudflare Workers
 * @module types/env
 */

import type { Logger } from '@/lib/logger';
import type { ClassificationJob } from './classification';

/**
 * Cloudflare Workers environment bindings
 */
export interface Env {
  // Cloudflare bindings
  DB: D1Database;
  CACHE: KVNamespace;
  CLASSIFICATION_QUEUE: Queue<ClassificationJob>;

  // Required secrets
  ANTHROPIC_API_KEY: string;
  GOOGLE_AI_API_KEY: string;
  SEARCH_SERVICE_URL: string;

  // RPC URLs for supported chains
  SEPOLIA_RPC_URL: string;
  BASE_SEPOLIA_RPC_URL: string;
  POLYGON_AMOY_RPC_URL: string;
  LINEA_SEPOLIA_RPC_URL: string;
  HEDERA_TESTNET_RPC_URL: string;
  HYPEREVM_TESTNET_RPC_URL: string;
  SKALE_BASE_SEPOLIA_RPC_URL: string;

  // Qdrant configuration
  /** Qdrant Cloud URL */
  QDRANT_URL: string;
  /** Qdrant API key */
  QDRANT_API_KEY: string;
  /** Qdrant collection name (default: agents) */
  QDRANT_COLLECTION?: string;

  // The Graph configuration
  /** The Graph API key for gateway access */
  GRAPH_API_KEY?: string;

  // Embedding configuration
  /** Venice AI API key for embeddings */
  VENICE_API_KEY?: string;
  /** Embedding model to use (default: text-embedding-3-small) */
  EMBEDDING_MODEL?: string;

  // Configuration (with defaults in wrangler.toml)
  ENVIRONMENT: string;
  CACHE_TTL: string;
  RATE_LIMIT_RPM: string;
  CLASSIFICATION_MODEL: string;
  FALLBACK_MODEL: string;

  // Optional API key for authenticated access
  API_KEY?: string;

  // IPFS configuration (optional, with defaults)
  /** IPFS gateway URL (default: https://ipfs.io/ipfs/) */
  IPFS_GATEWAY_URL?: string;
  /** IPFS fetch timeout in milliseconds (default: 10000) */
  IPFS_TIMEOUT_MS?: string;

  // E2E testing configuration
  /** Enable mock services for deterministic E2E testing (default: false) */
  MOCK_EXTERNAL_SERVICES?: string;

  // HyDE (Hypothetical Document Embeddings) configuration
  /** Enable HyDE for improved semantic search (default: true) */
  HYDE_ENABLED?: string;
  /** Model for HyDE generation (default: gemini-2.0-flash) */
  HYDE_MODEL?: string;

  // Cross-Encoder Reranking configuration
  /** Enable cross-encoder reranking (default: false) */
  RERANKER_ENABLED?: string;
  /** Model for reranking (default: bge-reranker-v2-m3) */
  RERANKER_MODEL?: string;
  /** Number of top results to rerank (default: 50) */
  RERANKER_TOP_K?: string;
}

/**
 * Context variables stored during request lifecycle
 */
export interface Variables {
  requestId: string;
  /** Structured logger with request context */
  logger: Logger;
  /** Whether request is authenticated with valid API key */
  isAuthenticated?: boolean;
  /** API key tier for rate limiting */
  apiKeyTier?: 'anonymous' | 'standard' | 'premium';
}
