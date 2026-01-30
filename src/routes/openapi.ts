/**
 * OpenAPI specification endpoint
 * @module routes/openapi
 */

import { Hono } from 'hono';
import { OASF_VERSION } from '@/lib/oasf/taxonomy';
import { SUPPORTED_CHAIN_IDS } from '@/lib/utils/validation';
import type { Env, Variables } from '@/types';

/**
 * OpenAPI 3.1.0 specification for 8004 Backend API
 */
function generateOpenAPISpec(): object {
  return {
    openapi: '3.1.0',
    info: {
      title: '8004 Backend API',
      version: '2.2.0',
      description:
        'Unified REST API for the ERC-8004 agent explorer. Provides agent discovery, semantic search, OASF classification, reputation data, team composition, intent templates, and more.',
      license: {
        name: 'MIT',
        url: 'https://github.com/agent0lab/8004-backend/blob/main/LICENSE',
      },
      contact: {
        name: '8004 API Support',
        url: 'https://github.com/agent0lab/8004-backend/issues',
      },
    },
    servers: [
      {
        url: 'https://api.8004.dev',
        description: 'Production',
      },
    ],
    security: [{ ApiKeyAuth: [] }],
    tags: [
      { name: 'Agents', description: 'Agent discovery and details' },
      { name: 'Search', description: 'Semantic search for agents' },
      { name: 'Classification', description: 'OASF skill/domain classification' },
      { name: 'Reputation', description: 'Agent reputation and feedback' },
      { name: 'Compose', description: 'AI-powered team composition' },
      { name: 'Intents', description: 'Multi-agent workflow templates' },
      { name: 'Events', description: 'Real-time SSE event streams' },
      { name: 'Leaderboard', description: 'Agent reputation rankings' },
      { name: 'Trending', description: 'Trending agents by reputation change' },
      { name: 'Feedbacks', description: 'Global feedback data' },
      { name: 'Analytics', description: 'Platform analytics and metrics' },
      { name: 'Evaluations', description: 'Agent capability evaluations' },
      { name: 'Verification', description: 'Agent identity verification' },
      { name: 'Chains', description: 'Blockchain network statistics' },
      { name: 'Taxonomy', description: 'OASF taxonomy data' },
      { name: 'Stats', description: 'Platform-wide statistics' },
      { name: 'Health', description: 'Service health checks' },
      { name: 'API Keys', description: 'API key management' },
    ],
    paths: {
      '/api/v1/health': {
        get: {
          tags: ['Health'],
          summary: 'Health check',
          description: 'Returns service health status and dependency checks',
          security: [],
          responses: {
            200: {
              description: 'Service is healthy',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/HealthResponse' },
                },
              },
            },
            503: {
              description: 'Service is degraded or down',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/HealthResponse' },
                },
              },
            },
          },
        },
      },
      '/api/v1/agents': {
        get: {
          tags: ['Agents'],
          summary: 'List agents',
          description:
            'List agents with optional filters, search, and pagination. When using the `q` parameter, results are sorted by semantic relevance.',
          parameters: [
            {
              name: 'q',
              in: 'query',
              description: 'Semantic search query',
              schema: { type: 'string', minLength: 1 },
            },
            {
              name: 'chainId',
              in: 'query',
              description: 'Filter by single chain ID (deprecated, use `chains`)',
              schema: { type: 'integer', enum: SUPPORTED_CHAIN_IDS },
            },
            {
              name: 'chains',
              in: 'query',
              description: 'Filter by chain IDs (comma-separated)',
              schema: { type: 'string', example: '1,11155111,84532' },
            },
            {
              name: 'active',
              in: 'query',
              description: 'Filter by active status',
              schema: { type: 'boolean' },
            },
            {
              name: 'mcp',
              in: 'query',
              description: 'Filter by MCP endpoint availability',
              schema: { type: 'boolean' },
            },
            {
              name: 'a2a',
              in: 'query',
              description: 'Filter by A2A endpoint availability',
              schema: { type: 'boolean' },
            },
            {
              name: 'x402',
              in: 'query',
              description: 'Filter by x402 payment support',
              schema: { type: 'boolean' },
            },
            {
              name: 'skills',
              in: 'query',
              description: 'Filter by OASF skill slugs (comma-separated)',
              schema: { type: 'string', example: 'natural_language_processing,tool_interaction' },
            },
            {
              name: 'domains',
              in: 'query',
              description: 'Filter by OASF domain slugs (comma-separated)',
              schema: { type: 'string', example: 'technology,finance_business' },
            },
            {
              name: 'filterMode',
              in: 'query',
              description: 'How to combine filters: AND (all must match) or OR (any can match)',
              schema: { type: 'string', enum: ['AND', 'OR'], default: 'AND' },
            },
            {
              name: 'owner',
              in: 'query',
              description: 'Filter by owner wallet address (exact match, case-insensitive)',
              schema: { type: 'string', pattern: '^0x[a-fA-F0-9]{40}$' },
            },
            {
              name: 'walletAddress',
              in: 'query',
              description: 'Filter by agent wallet address (exact match)',
              schema: { type: 'string', pattern: '^0x[a-fA-F0-9]{40}$' },
            },
            {
              name: 'ens',
              in: 'query',
              description: 'Filter by ENS name (exact match)',
              schema: { type: 'string' },
            },
            {
              name: 'did',
              in: 'query',
              description: 'Filter by DID identifier (exact match)',
              schema: { type: 'string' },
            },
            {
              name: 'trustModels',
              in: 'query',
              description: 'Filter by trust models (comma-separated, e.g., "x402,eas")',
              schema: { type: 'string' },
            },
            {
              name: 'hasTrusts',
              in: 'query',
              description: 'Filter agents that have any trust model configured',
              schema: { type: 'boolean' },
            },
            {
              name: 'reachableA2a',
              in: 'query',
              description: 'Filter by A2A endpoint reachability',
              schema: { type: 'boolean' },
            },
            {
              name: 'reachableMcp',
              in: 'query',
              description: 'Filter by MCP endpoint reachability',
              schema: { type: 'boolean' },
            },
            {
              name: 'mcpTools',
              in: 'query',
              description: 'Filter by MCP tool names (comma-separated)',
              schema: { type: 'string' },
            },
            {
              name: 'a2aSkills',
              in: 'query',
              description: 'Filter by A2A skill names (comma-separated)',
              schema: { type: 'string' },
            },
            {
              name: 'hasRegistrationFile',
              in: 'query',
              description: 'Filter agents that have registration metadata file',
              schema: { type: 'boolean' },
            },
            {
              name: 'excludeChainIds',
              in: 'query',
              description: 'Chain IDs to exclude (comma-separated)',
              schema: { type: 'string', example: '84532,80002' },
            },
            {
              name: 'excludeSkills',
              in: 'query',
              description: 'OASF skills to exclude (comma-separated)',
              schema: { type: 'string' },
            },
            {
              name: 'excludeDomains',
              in: 'query',
              description: 'OASF domains to exclude (comma-separated)',
              schema: { type: 'string' },
            },
            {
              name: 'minScore',
              in: 'query',
              description: 'Minimum semantic search score (0-1)',
              schema: { type: 'number', minimum: 0, maximum: 1 },
            },
            {
              name: 'minRep',
              in: 'query',
              description: 'Minimum reputation score (0-100)',
              schema: { type: 'integer', minimum: 0, maximum: 100 },
            },
            {
              name: 'maxRep',
              in: 'query',
              description: 'Maximum reputation score (0-100)',
              schema: { type: 'integer', minimum: 0, maximum: 100 },
            },
            {
              name: 'sort',
              in: 'query',
              description: 'Sort field',
              schema: { type: 'string', enum: ['relevance', 'name', 'createdAt', 'reputation'] },
            },
            {
              name: 'order',
              in: 'query',
              description: 'Sort order',
              schema: { type: 'string', enum: ['asc', 'desc'], default: 'desc' },
            },
            {
              name: 'limit',
              in: 'query',
              description: 'Number of results per page',
              schema: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
            },
            {
              name: 'cursor',
              in: 'query',
              description: 'Pagination cursor',
              schema: { type: 'string' },
            },
            {
              name: 'trustScoreMin',
              in: 'query',
              description: 'Minimum trust score (0-100)',
              schema: { type: 'integer', minimum: 0, maximum: 100 },
            },
            {
              name: 'trustScoreMax',
              in: 'query',
              description: 'Maximum trust score (0-100)',
              schema: { type: 'integer', minimum: 0, maximum: 100 },
            },
            {
              name: 'curatedBy',
              in: 'query',
              description: 'Filter by curator wallet address',
              schema: { type: 'string', pattern: '^0x[a-fA-F0-9]{40}$' },
            },
            {
              name: 'isCurated',
              in: 'query',
              description: 'Filter by curated status',
              schema: { type: 'boolean' },
            },
            {
              name: 'declaredSkill',
              in: 'query',
              description: 'Filter by declared OASF skill slug (from agent registration file)',
              schema: { type: 'string' },
            },
            {
              name: 'declaredDomain',
              in: 'query',
              description: 'Filter by declared OASF domain slug (from agent registration file)',
              schema: { type: 'string' },
            },
            {
              name: 'hasEmail',
              in: 'query',
              description: 'Filter by agents with email endpoint',
              schema: { type: 'boolean' },
            },
            {
              name: 'hasOasfEndpoint',
              in: 'query',
              description: 'Filter by agents with OASF API endpoint',
              schema: { type: 'boolean' },
            },
            {
              name: 'hasRecentReachability',
              in: 'query',
              description: 'Filter by agents with reachability attestation within last 14 days',
              schema: { type: 'boolean' },
            },
            {
              name: 'offset',
              in: 'query',
              description: 'Number of results to skip (offset-based pagination)',
              schema: { type: 'integer', minimum: 0 },
            },
            {
              name: 'page',
              in: 'query',
              description: 'Page number (1-indexed, alternative to offset)',
              schema: { type: 'integer', minimum: 1 },
            },
            {
              name: 'searchMode',
              in: 'query',
              description: 'Search mode: semantic (vector search), name (substring), or auto (semantic with name fallback)',
              schema: { type: 'string', enum: ['semantic', 'name', 'auto'], default: 'auto' },
            },
            {
              name: 'createdAfter',
              in: 'query',
              description: 'Filter by creation date (ISO 8601)',
              schema: { type: 'string', format: 'date-time' },
            },
            {
              name: 'createdBefore',
              in: 'query',
              description: 'Filter by creation date (ISO 8601)',
              schema: { type: 'string', format: 'date-time' },
            },
            {
              name: 'updatedAfter',
              in: 'query',
              description: 'Filter by update date (ISO 8601)',
              schema: { type: 'string', format: 'date-time' },
            },
            {
              name: 'updatedBefore',
              in: 'query',
              description: 'Filter by update date (ISO 8601)',
              schema: { type: 'string', format: 'date-time' },
            },
            {
              name: 'walletVerified',
              in: 'query',
              description: 'Filter by wallet verification status (ERC-8004 v1.0)',
              schema: { type: 'boolean' },
            },
            {
              name: 'declaredSkills',
              in: 'query',
              description: 'Filter by multiple declared OASF skill slugs (comma-separated)',
              schema: { type: 'string' },
            },
            {
              name: 'declaredDomains',
              in: 'query',
              description: 'Filter by multiple declared OASF domain slugs (comma-separated)',
              schema: { type: 'string' },
            },
            {
              name: 'hasTags',
              in: 'query',
              description: 'Filter by agents with specific feedback tags (comma-separated)',
              schema: { type: 'string' },
            },
            {
              name: 'reachableWeb',
              in: 'query',
              description: 'Filter by Web endpoint reachability',
              schema: { type: 'boolean' },
            },
            {
              name: 'minValidationScore',
              in: 'query',
              description: 'Minimum validation score (0-100)',
              schema: { type: 'integer', minimum: 0, maximum: 100 },
            },
            {
              name: 'maxValidationScore',
              in: 'query',
              description: 'Maximum validation score (0-100)',
              schema: { type: 'integer', minimum: 0, maximum: 100 },
            },
            {
              name: 'hasValidations',
              in: 'query',
              description: 'Filter by agents with at least one validation',
              schema: { type: 'boolean' },
            },
            {
              name: 'hasPendingValidations',
              in: 'query',
              description: 'Filter by agents with pending validations',
              schema: { type: 'boolean' },
            },
            {
              name: 'hasExpiredValidations',
              in: 'query',
              description: 'Filter by agents with expired validations',
              schema: { type: 'boolean' },
            },
          ],
          responses: {
            200: {
              description: 'List of agents',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/AgentListResponse' },
                },
              },
            },
            400: {
              description: 'Validation error',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/ErrorResponse' },
                },
              },
            },
          },
        },
      },
      '/api/v1/agents/{agentId}': {
        get: {
          tags: ['Agents'],
          summary: 'Get agent details',
          description:
            'Get full details for a specific agent, including endpoints, registration, IPFS metadata, and OASF classification.',
          parameters: [
            {
              name: 'agentId',
              in: 'path',
              required: true,
              description: 'Agent ID in format chainId:tokenId',
              schema: { type: 'string', pattern: '^\\d+:\\d+$', example: '11155111:123' },
            },
          ],
          responses: {
            200: {
              description: 'Agent details',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/AgentDetailResponse' },
                },
              },
            },
            404: {
              description: 'Agent not found',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/ErrorResponse' },
                },
              },
            },
          },
        },
      },
      '/api/v1/agents/{agentId}/classify': {
        get: {
          tags: ['Classification'],
          summary: 'Get agent classification',
          description: 'Get OASF classification (skills/domains) for an agent.',
          parameters: [
            {
              name: 'agentId',
              in: 'path',
              required: true,
              description: 'Agent ID in format chainId:tokenId',
              schema: { type: 'string', pattern: '^\\d+:\\d+$' },
            },
          ],
          responses: {
            200: {
              description: 'Classification data',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/ClassificationResponse' },
                },
              },
            },
            202: {
              description: 'Classification in progress',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/ClassificationPendingResponse' },
                },
              },
            },
            404: {
              description: 'Classification not found',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/ErrorResponse' },
                },
              },
            },
          },
        },
        post: {
          tags: ['Classification'],
          summary: 'Request agent classification',
          description: 'Queue an agent for OASF classification using Claude AI.',
          parameters: [
            {
              name: 'agentId',
              in: 'path',
              required: true,
              description: 'Agent ID in format chainId:tokenId',
              schema: { type: 'string', pattern: '^\\d+:\\d+$' },
            },
          ],
          requestBody: {
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    force: {
                      type: 'boolean',
                      default: false,
                      description: 'Force re-classification even if already classified',
                    },
                  },
                },
              },
            },
          },
          responses: {
            202: {
              description: 'Classification queued',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/ClassificationQueuedResponse' },
                },
              },
            },
          },
        },
      },
      '/api/v1/agents/{agentId}/reputation': {
        get: {
          tags: ['Reputation'],
          summary: 'Get agent reputation',
          description: 'Get reputation score and recent feedback for an agent.',
          parameters: [
            {
              name: 'agentId',
              in: 'path',
              required: true,
              description: 'Agent ID in format chainId:tokenId',
              schema: { type: 'string', pattern: '^\\d+:\\d+$' },
            },
          ],
          responses: {
            200: {
              description: 'Reputation data',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/ReputationResponse' },
                },
              },
            },
          },
        },
      },
      '/api/v1/agents/{agentId}/reputation/feedback': {
        get: {
          tags: ['Reputation'],
          summary: 'Get agent feedback',
          description: 'Get paginated list of feedback for an agent.',
          parameters: [
            {
              name: 'agentId',
              in: 'path',
              required: true,
              description: 'Agent ID in format chainId:tokenId',
              schema: { type: 'string', pattern: '^\\d+:\\d+$' },
            },
            {
              name: 'limit',
              in: 'query',
              description: 'Number of feedback items',
              schema: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
            },
          ],
          responses: {
            200: {
              description: 'Feedback list',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/FeedbackListResponse' },
                },
              },
            },
          },
        },
      },
      '/api/v1/agents/{agentId}/reputation/history': {
        get: {
          tags: ['Reputation'],
          summary: 'Get reputation history',
          description: 'Get historical reputation data for an agent over a specified period.',
          parameters: [
            {
              name: 'agentId',
              in: 'path',
              required: true,
              description: 'Agent ID in format chainId:tokenId',
              schema: { type: 'string', pattern: '^\\d+:\\d+$' },
            },
            {
              name: 'period',
              in: 'query',
              description: 'Time period for history',
              schema: { type: 'string', enum: ['7d', '30d', '90d', '1y'], default: '30d' },
            },
          ],
          responses: {
            200: {
              description: 'Reputation history',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/ReputationHistoryResponse' },
                },
              },
            },
            404: {
              description: 'Agent not found',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/ErrorResponse' },
                },
              },
            },
          },
        },
      },
      '/api/v1/search': {
        post: {
          tags: ['Search'],
          summary: 'Semantic search',
          description: 'Search for agents using natural language queries.',
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/SearchRequest' },
              },
            },
          },
          responses: {
            200: {
              description: 'Search results',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/SearchResponse' },
                },
              },
            },
            400: {
              description: 'Validation error',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/ErrorResponse' },
                },
              },
            },
          },
        },
      },
      '/api/v1/search/stream': {
        post: {
          tags: ['Search'],
          summary: 'Streaming semantic search',
          description:
            'Search for agents using natural language queries with results streamed via Server-Sent Events (SSE). Each result is sent as it becomes available.',
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/SearchRequest' },
              },
            },
          },
          responses: {
            200: {
              description: 'SSE stream of search results',
              content: {
                'text/event-stream': {
                  schema: {
                    type: 'string',
                    description:
                      'Server-Sent Events stream. Events: `result` (individual agent), `meta` (search metadata), `done` (stream complete), `error` (error occurred).',
                  },
                },
              },
            },
            400: {
              description: 'Validation error',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/ErrorResponse' },
                },
              },
            },
          },
        },
      },
      '/api/v1/keys': {
        post: {
          tags: ['API Keys'],
          summary: 'Create API key',
          description: 'Create a new API key with specified permissions and rate limits.',
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['name'],
                  properties: {
                    name: { type: 'string', description: 'Descriptive name for the API key' },
                    permissions: {
                      type: 'array',
                      items: { type: 'string' },
                      description: 'Permission scopes (default: ["read"])',
                    },
                    rateLimit: {
                      type: 'integer',
                      description: 'Custom rate limit (requests per minute)',
                    },
                    expiresAt: {
                      type: 'string',
                      format: 'date-time',
                      description: 'Expiration date (ISO 8601)',
                    },
                  },
                },
              },
            },
          },
          responses: {
            201: {
              description: 'API key created',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      success: { type: 'boolean' },
                      data: {
                        type: 'object',
                        properties: {
                          id: { type: 'string' },
                          key: {
                            type: 'string',
                            description: 'The API key value (only shown once)',
                          },
                          name: { type: 'string' },
                          permissions: { type: 'array', items: { type: 'string' } },
                          createdAt: { type: 'string', format: 'date-time' },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
        get: {
          tags: ['API Keys'],
          summary: 'List API keys',
          description: 'List all API keys for the authenticated account.',
          responses: {
            200: {
              description: 'List of API keys',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      success: { type: 'boolean' },
                      data: {
                        type: 'array',
                        items: {
                          type: 'object',
                          properties: {
                            id: { type: 'string' },
                            name: { type: 'string' },
                            permissions: { type: 'array', items: { type: 'string' } },
                            lastUsedAt: { type: 'string', format: 'date-time', nullable: true },
                            createdAt: { type: 'string', format: 'date-time' },
                            expiresAt: { type: 'string', format: 'date-time', nullable: true },
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
      '/api/v1/keys/{id}': {
        get: {
          tags: ['API Keys'],
          summary: 'Get API key details',
          description: 'Get details for a specific API key.',
          parameters: [
            {
              name: 'id',
              in: 'path',
              required: true,
              description: 'API key ID',
              schema: { type: 'string' },
            },
          ],
          responses: {
            200: { description: 'API key details' },
            404: { description: 'API key not found' },
          },
        },
        patch: {
          tags: ['API Keys'],
          summary: 'Update API key',
          description: 'Update an existing API key (name, permissions, rate limit, expiration).',
          parameters: [
            {
              name: 'id',
              in: 'path',
              required: true,
              description: 'API key ID',
              schema: { type: 'string' },
            },
          ],
          requestBody: {
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    name: { type: 'string' },
                    permissions: { type: 'array', items: { type: 'string' } },
                    rateLimit: { type: 'integer' },
                    expiresAt: { type: 'string', format: 'date-time', nullable: true },
                  },
                },
              },
            },
          },
          responses: {
            200: { description: 'API key updated' },
            404: { description: 'API key not found' },
          },
        },
        delete: {
          tags: ['API Keys'],
          summary: 'Delete API key',
          description: 'Permanently delete an API key.',
          parameters: [
            {
              name: 'id',
              in: 'path',
              required: true,
              description: 'API key ID',
              schema: { type: 'string' },
            },
          ],
          responses: {
            200: { description: 'API key deleted' },
            404: { description: 'API key not found' },
          },
        },
      },
      '/api/v1/keys/{id}/rotate': {
        post: {
          tags: ['API Keys'],
          summary: 'Rotate API key',
          description: 'Generate a new key value for an existing API key. The old key is invalidated.',
          parameters: [
            {
              name: 'id',
              in: 'path',
              required: true,
              description: 'API key ID',
              schema: { type: 'string' },
            },
          ],
          responses: {
            200: {
              description: 'New key generated',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      success: { type: 'boolean' },
                      data: {
                        type: 'object',
                        properties: {
                          id: { type: 'string' },
                          key: { type: 'string', description: 'New API key value (only shown once)' },
                        },
                      },
                    },
                  },
                },
              },
            },
            404: { description: 'API key not found' },
          },
        },
      },
      '/api/v1/keys/{id}/usage': {
        get: {
          tags: ['API Keys'],
          summary: 'Get API key usage',
          description: 'Get usage statistics for a specific API key.',
          parameters: [
            {
              name: 'id',
              in: 'path',
              required: true,
              description: 'API key ID',
              schema: { type: 'string' },
            },
          ],
          responses: {
            200: { description: 'Usage statistics' },
            404: { description: 'API key not found' },
          },
        },
      },
      '/api/v1/chains': {
        get: {
          tags: ['Chains'],
          summary: 'Get chain statistics',
          description: 'Get agent counts and statistics for all supported chains.',
          responses: {
            200: {
              description: 'Chain statistics',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/ChainStatsResponse' },
                },
              },
            },
          },
        },
      },
      '/api/v1/stats': {
        get: {
          tags: ['Stats'],
          summary: 'Get platform statistics',
          description: 'Get aggregated platform-wide statistics.',
          responses: {
            200: {
              description: 'Platform statistics',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/PlatformStatsResponse' },
                },
              },
            },
          },
        },
      },
      '/api/v1/stats/global': {
        get: {
          tags: ['Stats'],
          summary: 'Get global cross-chain statistics',
          description: 'Get aggregated statistics across all supported chains.',
          responses: {
            200: {
              description: 'Global statistics',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/GlobalStatsResponse' },
                },
              },
            },
          },
        },
      },
      '/api/v1/stats/chains/{chainId}': {
        get: {
          tags: ['Stats'],
          summary: 'Get chain-specific statistics',
          description: 'Get protocol statistics for a specific chain.',
          parameters: [
            {
              name: 'chainId',
              in: 'path',
              required: true,
              description: 'Chain ID',
              schema: { type: 'integer', enum: SUPPORTED_CHAIN_IDS },
            },
          ],
          responses: {
            200: {
              description: 'Chain statistics',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/ChainProtocolStatsResponse' },
                },
              },
            },
            404: {
              description: 'Chain not found',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/ErrorResponse' },
                },
              },
            },
          },
        },
      },
      '/api/v1/tags': {
        get: {
          tags: ['Feedbacks'],
          summary: 'Get all unique feedback tags',
          description: 'Get all unique feedback tags across agents with counts.',
          parameters: [
            {
              name: 'chainIds',
              in: 'query',
              description: 'Filter by chain IDs (comma-separated)',
              schema: { type: 'string' },
            },
            {
              name: 'limit',
              in: 'query',
              description: 'Number of results',
              schema: { type: 'integer', minimum: 1, maximum: 100, default: 50 },
            },
          ],
          responses: {
            200: {
              description: 'List of tags with counts',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      success: { type: 'boolean' },
                      data: {
                        type: 'array',
                        items: {
                          type: 'object',
                          properties: {
                            tag: { type: 'string' },
                            count: { type: 'integer' },
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
      '/api/v1/taxonomy': {
        get: {
          tags: ['Taxonomy'],
          summary: 'Get OASF taxonomy',
          description: `Get the OASF taxonomy tree (v${OASF_VERSION}) for skills and domains.`,
          parameters: [
            {
              name: 'type',
              in: 'query',
              description: 'Taxonomy type to retrieve',
              schema: { type: 'string', enum: ['skill', 'domain', 'all'], default: 'all' },
            },
          ],
          responses: {
            200: {
              description: 'Taxonomy data',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/TaxonomyResponse' },
                },
              },
            },
          },
        },
      },
      '/api/v1/agents/batch': {
        get: {
          tags: ['Agents'],
          summary: 'Get multiple agents by IDs',
          description: 'Fetch multiple agents in a single request. Maximum 50 IDs per request.',
          parameters: [
            {
              name: 'ids',
              in: 'query',
              required: true,
              description: 'Comma-separated list of agent IDs (format: chainId:tokenId)',
              schema: { type: 'string', example: '11155111:1,11155111:2,84532:1' },
            },
          ],
          responses: {
            200: {
              description: 'Batch agent results',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/AgentBatchResponse' },
                },
              },
            },
            400: {
              description: 'Validation error',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/ErrorResponse' },
                },
              },
            },
          },
        },
      },
      '/api/v1/agents/{agentId}/similar': {
        get: {
          tags: ['Agents'],
          summary: 'Find similar agents',
          description: 'Find agents with similar OASF classification (skills and domains overlap).',
          parameters: [
            {
              name: 'agentId',
              in: 'path',
              required: true,
              description: 'Agent ID in format chainId:tokenId',
              schema: { type: 'string', pattern: '^\\d+:\\d+$' },
            },
            {
              name: 'limit',
              in: 'query',
              description: 'Maximum number of similar agents to return',
              schema: { type: 'integer', minimum: 1, maximum: 20, default: 10 },
            },
          ],
          responses: {
            200: {
              description: 'Similar agents with similarity scores',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/SimilarAgentsResponse' },
                },
              },
            },
          },
        },
      },
      '/api/v1/agents/{agentId}/complementary': {
        get: {
          tags: ['Agents'],
          summary: 'Find complementary agents',
          description: 'Find agents that complement this agent (different skills, domain overlap, compatible protocols).',
          parameters: [
            {
              name: 'agentId',
              in: 'path',
              required: true,
              description: 'Agent ID in format chainId:tokenId',
              schema: { type: 'string', pattern: '^\\d+:\\d+$' },
            },
            {
              name: 'limit',
              in: 'query',
              description: 'Maximum number of complementary agents to return',
              schema: { type: 'integer', minimum: 1, maximum: 20, default: 10 },
            },
          ],
          responses: {
            200: {
              description: 'Complementary agents with analysis',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/ComplementaryAgentsResponse' },
                },
              },
            },
          },
        },
      },
      '/api/v1/agents/{agentId}/compatible': {
        get: {
          tags: ['Agents'],
          summary: 'Find I/O compatible agents',
          description: 'Find agents that can be chained together in pipelines (upstream/downstream I/O compatibility).',
          parameters: [
            {
              name: 'agentId',
              in: 'path',
              required: true,
              description: 'Agent ID in format chainId:tokenId',
              schema: { type: 'string', pattern: '^\\d+:\\d+$' },
            },
            {
              name: 'limit',
              in: 'query',
              description: 'Maximum number of compatible agents per direction',
              schema: { type: 'integer', minimum: 1, maximum: 20, default: 10 },
            },
          ],
          responses: {
            200: {
              description: 'I/O compatible agents (upstream and downstream)',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/CompatibleAgentsResponse' },
                },
              },
            },
          },
        },
      },
      '/api/v1/agents/{agentId}/health': {
        get: {
          tags: ['Agents'],
          summary: 'Get agent health status',
          description: 'Get health and reliability metrics for an agent (uptime, latency, reachability).',
          parameters: [
            {
              name: 'agentId',
              in: 'path',
              required: true,
              description: 'Agent ID in format chainId:tokenId',
              schema: { type: 'string', pattern: '^\\d+:\\d+$' },
            },
          ],
          responses: {
            200: {
              description: 'Agent health status',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/AgentHealthResponse' },
                },
              },
            },
          },
        },
      },
      '/api/v1/agents/{agentId}/metadata': {
        get: {
          tags: ['Agents'],
          summary: 'Get agent on-chain metadata',
          description: 'Get all on-chain key-value metadata for an agent.',
          parameters: [
            {
              name: 'agentId',
              in: 'path',
              required: true,
              description: 'Agent ID in format chainId:tokenId',
              schema: { type: 'string', pattern: '^\\d+:\\d+$' },
            },
          ],
          responses: {
            200: {
              description: 'Agent metadata key-value pairs',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      success: { type: 'boolean' },
                      data: {
                        type: 'object',
                        additionalProperties: { type: 'string' },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
      '/api/v1/agents/{agentId}/metadata/{key}': {
        get: {
          tags: ['Agents'],
          summary: 'Get specific agent metadata entry',
          description: 'Get a specific on-chain metadata entry by key.',
          parameters: [
            {
              name: 'agentId',
              in: 'path',
              required: true,
              description: 'Agent ID in format chainId:tokenId',
              schema: { type: 'string', pattern: '^\\d+:\\d+$' },
            },
            {
              name: 'key',
              in: 'path',
              required: true,
              description: 'Metadata key',
              schema: { type: 'string' },
            },
          ],
          responses: {
            200: {
              description: 'Metadata entry value',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      success: { type: 'boolean' },
                      data: {
                        type: 'object',
                        properties: {
                          key: { type: 'string' },
                          value: { type: 'string' },
                        },
                      },
                    },
                  },
                },
              },
            },
            404: {
              description: 'Metadata key not found',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/ErrorResponse' },
                },
              },
            },
          },
        },
      },
      '/api/v1/agents/{agentId}/validations': {
        get: {
          tags: ['Agents'],
          summary: 'Get agent validations',
          description: 'Get paginated list of validations for an agent.',
          parameters: [
            {
              name: 'agentId',
              in: 'path',
              required: true,
              description: 'Agent ID in format chainId:tokenId',
              schema: { type: 'string', pattern: '^\\d+:\\d+$' },
            },
            {
              name: 'limit',
              in: 'query',
              description: 'Number of results per page',
              schema: { type: 'integer', minimum: 1, maximum: 50, default: 10 },
            },
            {
              name: 'cursor',
              in: 'query',
              description: 'Pagination cursor',
              schema: { type: 'string' },
            },
          ],
          responses: {
            200: {
              description: 'Agent validations list',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/AgentValidationsResponse' },
                },
              },
            },
          },
        },
      },
      '/api/v1/agents/{agentId}/validations/summary': {
        get: {
          tags: ['Agents'],
          summary: 'Get agent validation summary',
          description: 'Get validation summary with AgentStats for an agent.',
          parameters: [
            {
              name: 'agentId',
              in: 'path',
              required: true,
              description: 'Agent ID in format chainId:tokenId',
              schema: { type: 'string', pattern: '^\\d+:\\d+$' },
            },
          ],
          responses: {
            200: {
              description: 'Agent validation summary',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      success: { type: 'boolean' },
                      data: {
                        type: 'object',
                        properties: {
                          totalValidations: { type: 'integer' },
                          completedValidations: { type: 'integer' },
                          pendingValidations: { type: 'integer' },
                          expiredValidations: { type: 'integer' },
                          averageScore: { type: 'number' },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
      '/api/v1/agents/{agentId}/evaluations': {
        get: {
          tags: ['Evaluations'],
          summary: 'Get agent evaluation history',
          description: 'Get paginated list of capability evaluations for a specific agent.',
          parameters: [
            {
              name: 'agentId',
              in: 'path',
              required: true,
              description: 'Agent ID in format chainId:tokenId',
              schema: { type: 'string', pattern: '^\\d+:\\d+$' },
            },
            {
              name: 'limit',
              in: 'query',
              description: 'Number of results per page',
              schema: { type: 'integer', minimum: 1, maximum: 50, default: 10 },
            },
            {
              name: 'cursor',
              in: 'query',
              description: 'Pagination cursor',
              schema: { type: 'string' },
            },
          ],
          responses: {
            200: {
              description: 'Agent evaluation history',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/AgentEvaluationsResponse' },
                },
              },
            },
          },
        },
      },
      '/api/v1/agents/{agentId}/verification': {
        get: {
          tags: ['Verification'],
          summary: 'Get agent verification status',
          description: 'Get verification status and badge level for an agent.',
          parameters: [
            {
              name: 'agentId',
              in: 'path',
              required: true,
              description: 'Agent ID in format chainId:tokenId',
              schema: { type: 'string', pattern: '^\\d+:\\d+$' },
            },
          ],
          responses: {
            200: {
              description: 'Verification status and badge',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/VerificationStatusResponse' },
                },
              },
            },
          },
        },
      },
      '/api/v1/agents/{agentId}/verification/challenge': {
        get: {
          tags: ['Verification'],
          summary: 'Get challenge status',
          description: 'Get current verification challenge status for a specific method.',
          parameters: [
            {
              name: 'agentId',
              in: 'path',
              required: true,
              schema: { type: 'string', pattern: '^\\d+:\\d+$' },
            },
            {
              name: 'method',
              in: 'query',
              required: true,
              description: 'Verification method',
              schema: { type: 'string', enum: ['dns', 'ens', 'github', 'twitter'] },
            },
          ],
          responses: {
            200: {
              description: 'Challenge status',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/ChallengeStatusResponse' },
                },
              },
            },
          },
        },
        post: {
          tags: ['Verification'],
          summary: 'Start verification challenge',
          description: 'Start a new verification challenge for a specific method.',
          parameters: [
            {
              name: 'agentId',
              in: 'path',
              required: true,
              schema: { type: 'string', pattern: '^\\d+:\\d+$' },
            },
          ],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['method'],
                  properties: {
                    method: {
                      type: 'string',
                      enum: ['dns', 'ens', 'github', 'twitter'],
                      description: 'Verification method to use',
                    },
                  },
                },
              },
            },
          },
          responses: {
            201: {
              description: 'Challenge created',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/ChallengeCreatedResponse' },
                },
              },
            },
          },
        },
      },
      '/api/v1/agents/{agentId}/verification/verify': {
        post: {
          tags: ['Verification'],
          summary: 'Verify a challenge',
          description: 'Submit proof and verify a pending challenge.',
          parameters: [
            {
              name: 'agentId',
              in: 'path',
              required: true,
              schema: { type: 'string', pattern: '^\\d+:\\d+$' },
            },
          ],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['method'],
                  properties: {
                    method: {
                      type: 'string',
                      enum: ['dns', 'ens', 'github', 'twitter'],
                    },
                    proofData: {
                      type: 'string',
                      description: 'Optional proof data (e.g., tweet URL, gist URL)',
                    },
                  },
                },
              },
            },
          },
          responses: {
            200: {
              description: 'Verification result',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/VerificationResultResponse' },
                },
              },
            },
          },
        },
      },
      '/api/v1/compose': {
        post: {
          tags: ['Compose'],
          summary: 'Build agent team',
          description: 'Build a team of complementary agents for a given task using AI-powered analysis.',
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ComposeRequest' },
              },
            },
          },
          responses: {
            200: {
              description: 'Team composition result',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/ComposeResponse' },
                },
              },
            },
            400: {
              description: 'Validation error',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/ErrorResponse' },
                },
              },
            },
            402: {
              description: 'Payment Required - x402 protocol. When x402 is enabled, this endpoint requires payment.',
              headers: {
                'X-Payment': {
                  description: 'x402 payment receipt (include this header with payment to proceed)',
                  schema: { type: 'string' },
                },
              },
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/PaymentRequiredResponse' },
                },
              },
            },
          },
        },
      },
      '/api/v1/compose/info': {
        get: {
          tags: ['Compose'],
          summary: 'Get compose endpoint info',
          description: 'Get documentation and schema information for the compose endpoint.',
          responses: {
            200: {
              description: 'Compose endpoint documentation',
              content: {
                'application/json': {
                  schema: { type: 'object' },
                },
              },
            },
          },
        },
      },
      '/api/v1/intents': {
        get: {
          tags: ['Intents'],
          summary: 'List intent templates',
          description: 'List all available multi-agent workflow templates.',
          parameters: [
            {
              name: 'category',
              in: 'query',
              description: 'Filter by category',
              schema: { type: 'string' },
            },
            {
              name: 'featured',
              in: 'query',
              description: 'Filter featured templates only',
              schema: { type: 'boolean' },
            },
          ],
          responses: {
            200: {
              description: 'List of intent templates',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/IntentTemplatesResponse' },
                },
              },
            },
          },
        },
      },
      '/api/v1/intents/categories': {
        get: {
          tags: ['Intents'],
          summary: 'List template categories',
          description: 'Get all available intent template categories.',
          responses: {
            200: {
              description: 'List of categories',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      success: { type: 'boolean', enum: [true] },
                      data: { type: 'array', items: { type: 'string' } },
                    },
                  },
                },
              },
            },
          },
        },
      },
      '/api/v1/intents/{templateId}': {
        get: {
          tags: ['Intents'],
          summary: 'Get template details',
          description: 'Get detailed information about a specific intent template.',
          parameters: [
            {
              name: 'templateId',
              in: 'path',
              required: true,
              description: 'Template ID',
              schema: { type: 'string' },
            },
          ],
          responses: {
            200: {
              description: 'Template details',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/IntentTemplateResponse' },
                },
              },
            },
            404: {
              description: 'Template not found',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/ErrorResponse' },
                },
              },
            },
          },
        },
      },
      '/api/v1/intents/{templateId}/match': {
        get: {
          tags: ['Intents'],
          summary: 'Match agents to template (GET)',
          description: 'Find agents that match each step of the workflow template.',
          parameters: [
            {
              name: 'templateId',
              in: 'path',
              required: true,
              schema: { type: 'string' },
            },
            {
              name: 'chainIds',
              in: 'query',
              description: 'Filter by chain IDs (comma-separated)',
              schema: { type: 'string' },
            },
            {
              name: 'minReputation',
              in: 'query',
              description: 'Minimum reputation score',
              schema: { type: 'integer', minimum: 0, maximum: 100 },
            },
            {
              name: 'limit',
              in: 'query',
              description: 'Max agents per step',
              schema: { type: 'integer', minimum: 1, maximum: 20, default: 5 },
            },
          ],
          responses: {
            200: {
              description: 'Matched agents for template',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/IntentMatchResponse' },
                },
              },
            },
          },
        },
        post: {
          tags: ['Intents'],
          summary: 'Match agents to template (POST)',
          description: 'Find agents that match each step of the workflow template.',
          parameters: [
            {
              name: 'templateId',
              in: 'path',
              required: true,
              schema: { type: 'string' },
            },
          ],
          requestBody: {
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    chainIds: { type: 'array', items: { type: 'integer' } },
                    minReputation: { type: 'integer', minimum: 0, maximum: 100 },
                    limit: { type: 'integer', minimum: 1, maximum: 20, default: 5 },
                  },
                },
              },
            },
          },
          responses: {
            200: {
              description: 'Matched agents for template',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/IntentMatchResponse' },
                },
              },
            },
          },
        },
      },
      '/api/v1/events': {
        get: {
          tags: ['Events'],
          summary: 'Subscribe to real-time events',
          description: 'Server-Sent Events (SSE) stream for real-time updates on agents, reputation, and more.',
          parameters: [
            {
              name: 'agentIds',
              in: 'query',
              description: 'Filter by agent IDs (comma-separated)',
              schema: { type: 'string' },
            },
            {
              name: 'chainIds',
              in: 'query',
              description: 'Filter by chain IDs (comma-separated)',
              schema: { type: 'string' },
            },
            {
              name: 'eventTypes',
              in: 'query',
              description: 'Filter by event types (comma-separated)',
              schema: { type: 'string' },
            },
            {
              name: 'reputation',
              in: 'query',
              description: 'Include reputation change events',
              schema: { type: 'boolean' },
            },
            {
              name: 'reachability',
              in: 'query',
              description: 'Include reachability update events',
              schema: { type: 'boolean' },
            },
            {
              name: 'heartbeat',
              in: 'query',
              description: 'Heartbeat interval in seconds (5-60)',
              schema: { type: 'integer', minimum: 5, maximum: 60, default: 30 },
            },
          ],
          responses: {
            200: {
              description: 'SSE event stream',
              content: {
                'text/event-stream': {
                  schema: { type: 'string' },
                },
              },
            },
          },
        },
      },
      '/api/v1/events/info': {
        get: {
          tags: ['Events'],
          summary: 'Get SSE event info',
          description: 'Get documentation about available SSE event types and filters.',
          responses: {
            200: {
              description: 'SSE event documentation',
              content: {
                'application/json': {
                  schema: { type: 'object' },
                },
              },
            },
          },
        },
      },
      '/api/v1/leaderboard': {
        get: {
          tags: ['Leaderboard'],
          summary: 'Get reputation leaderboard',
          description: 'Get agents ranked by reputation score with optional filters.',
          parameters: [
            {
              name: 'period',
              in: 'query',
              description: 'Time period for ranking',
              schema: { type: 'string', enum: ['all', '30d', '7d', '24h'], default: 'all' },
            },
            {
              name: 'chainIds',
              in: 'query',
              description: 'Filter by chain IDs (comma-separated)',
              schema: { type: 'string' },
            },
            {
              name: 'mcp',
              in: 'query',
              description: 'Filter by MCP support',
              schema: { type: 'boolean' },
            },
            {
              name: 'a2a',
              in: 'query',
              description: 'Filter by A2A support',
              schema: { type: 'boolean' },
            },
            {
              name: 'limit',
              in: 'query',
              description: 'Number of results',
              schema: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
            },
            {
              name: 'cursor',
              in: 'query',
              description: 'Pagination cursor',
              schema: { type: 'string' },
            },
          ],
          responses: {
            200: {
              description: 'Leaderboard entries',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/LeaderboardResponse' },
                },
              },
            },
          },
        },
      },
      '/api/v1/trending': {
        get: {
          tags: ['Trending'],
          summary: 'Get trending agents',
          description: 'Get agents with highest reputation changes in the specified period.',
          parameters: [
            {
              name: 'period',
              in: 'query',
              description: 'Time period',
              schema: { type: 'string', enum: ['24h', '7d', '30d'], default: '7d' },
            },
            {
              name: 'limit',
              in: 'query',
              description: 'Number of results',
              schema: { type: 'integer', minimum: 1, maximum: 50, default: 20 },
            },
          ],
          responses: {
            200: {
              description: 'Trending agents',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/TrendingResponse' },
                },
              },
            },
          },
        },
      },
      '/api/v1/feedbacks': {
        get: {
          tags: ['Feedbacks'],
          summary: 'Get all feedbacks',
          description: 'Get paginated list of all feedbacks across all agents with advanced filtering.',
          parameters: [
            {
              name: 'chainIds',
              in: 'query',
              description: 'Filter by chain IDs (comma-separated)',
              schema: { type: 'string' },
            },
            {
              name: 'scoreCategory',
              in: 'query',
              description: 'Filter by score category',
              schema: { type: 'string', enum: ['positive', 'neutral', 'negative'] },
            },
            {
              name: 'reviewers',
              in: 'query',
              description: 'Filter by reviewer wallet addresses (comma-separated)',
              schema: { type: 'string' },
            },
            {
              name: 'agentIds',
              in: 'query',
              description: 'Filter by multiple agent IDs in format chainId:tokenId (comma-separated)',
              schema: { type: 'string', example: '11155111:1,11155111:2' },
            },
            {
              name: 'feedbackIndex',
              in: 'query',
              description: 'Filter by specific feedback index',
              schema: { type: 'integer', minimum: 0 },
            },
            {
              name: 'limit',
              in: 'query',
              description: 'Number of results',
              schema: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
            },
            {
              name: 'cursor',
              in: 'query',
              description: 'Pagination cursor',
              schema: { type: 'string' },
            },
            {
              name: 'offset',
              in: 'query',
              description: 'Number of results to skip (offset-based pagination)',
              schema: { type: 'integer', minimum: 0 },
            },
          ],
          responses: {
            200: {
              description: 'Global feedbacks with stats',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/GlobalFeedbacksResponse' },
                },
              },
            },
          },
        },
      },
      '/api/v1/feedbacks/{feedbackId}/responses': {
        get: {
          tags: ['Feedbacks'],
          summary: 'Get feedback responses',
          description:
            'Get responses for a specific feedback entry. Feedback responses are submitted via the appendResponse() function in the ReputationRegistry contract.',
          parameters: [
            {
              name: 'feedbackId',
              in: 'path',
              required: true,
              description: 'Feedback ID (format: chainId:agentId:index)',
              schema: { type: 'string', example: '11155111:1234:42' },
            },
          ],
          responses: {
            200: {
              description: 'Feedback responses',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/FeedbackResponsesResponse' },
                },
              },
            },
            400: {
              description: 'Invalid feedback ID format',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/ErrorResponse' },
                },
              },
            },
          },
        },
      },
      '/api/v1/analytics': {
        get: {
          tags: ['Analytics'],
          summary: 'Get analytics summary',
          description: 'Get analytics summary for a specified period.',
          parameters: [
            {
              name: 'period',
              in: 'query',
              description: 'Time period',
              schema: { type: 'string', enum: ['hour', 'day', 'week', 'month'], default: 'day' },
            },
          ],
          responses: {
            200: {
              description: 'Analytics summary',
              content: {
                'application/json': {
                  schema: { type: 'object' },
                },
              },
            },
          },
        },
      },
      '/api/v1/analytics/stats': {
        get: {
          tags: ['Analytics'],
          summary: 'Get platform stats',
          description: 'Get current platform statistics.',
          responses: {
            200: {
              description: 'Platform statistics',
              content: {
                'application/json': {
                  schema: { type: 'object' },
                },
              },
            },
          },
        },
      },
      '/api/v1/analytics/filters': {
        get: {
          tags: ['Analytics'],
          summary: 'Get popular filters',
          description: 'Get popular filter usage analytics.',
          parameters: [
            {
              name: 'period',
              in: 'query',
              schema: { type: 'string', enum: ['hour', 'day', 'week', 'month'], default: 'day' },
            },
            {
              name: 'limit',
              in: 'query',
              schema: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
            },
          ],
          responses: {
            200: {
              description: 'Popular filters',
              content: {
                'application/json': {
                  schema: { type: 'object' },
                },
              },
            },
          },
        },
      },
      '/api/v1/analytics/endpoints': {
        get: {
          tags: ['Analytics'],
          summary: 'Get top endpoints',
          description: 'Get top API endpoint usage.',
          parameters: [
            {
              name: 'period',
              in: 'query',
              schema: { type: 'string', enum: ['hour', 'day', 'week', 'month'], default: 'day' },
            },
            {
              name: 'limit',
              in: 'query',
              schema: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
            },
          ],
          responses: {
            200: {
              description: 'Top endpoints',
              content: {
                'application/json': {
                  schema: { type: 'object' },
                },
              },
            },
          },
        },
      },
      '/api/v1/analytics/search': {
        get: {
          tags: ['Analytics'],
          summary: 'Get search volume',
          description: 'Get search volume statistics.',
          parameters: [
            {
              name: 'period',
              in: 'query',
              schema: { type: 'string', enum: ['hour', 'day', 'week', 'month'], default: 'day' },
            },
          ],
          responses: {
            200: {
              description: 'Search volume stats',
              content: {
                'application/json': {
                  schema: { type: 'object' },
                },
              },
            },
          },
        },
      },
      '/api/v1/analytics/chains': {
        get: {
          tags: ['Analytics'],
          summary: 'Get chain activity',
          description: 'Get activity breakdown by chain.',
          parameters: [
            {
              name: 'period',
              in: 'query',
              schema: { type: 'string', enum: ['hour', 'day', 'week', 'month'], default: 'day' },
            },
          ],
          responses: {
            200: {
              description: 'Chain activity',
              content: {
                'application/json': {
                  schema: { type: 'object' },
                },
              },
            },
          },
        },
      },
      '/api/v1/analytics/history/{metricType}': {
        get: {
          tags: ['Analytics'],
          summary: 'Get historical metrics',
          description: 'Get historical metrics data for a specific metric type.',
          parameters: [
            {
              name: 'metricType',
              in: 'path',
              required: true,
              description: 'Type of metric',
              schema: { type: 'string', enum: ['agents', 'search', 'classification', 'feedback', 'api_usage'] },
            },
            {
              name: 'period',
              in: 'query',
              schema: { type: 'string', enum: ['hour', 'day', 'week', 'month'], default: 'day' },
            },
            {
              name: 'chainId',
              in: 'query',
              description: 'Filter by chain ID',
              schema: { type: 'integer' },
            },
            {
              name: 'startDate',
              in: 'query',
              description: 'Start date (ISO 8601)',
              schema: { type: 'string', format: 'date-time' },
            },
            {
              name: 'endDate',
              in: 'query',
              description: 'End date (ISO 8601)',
              schema: { type: 'string', format: 'date-time' },
            },
            {
              name: 'limit',
              in: 'query',
              schema: { type: 'integer', minimum: 1, maximum: 1000, default: 168 },
            },
          ],
          responses: {
            200: {
              description: 'Historical metrics',
              content: {
                'application/json': {
                  schema: { type: 'object' },
                },
              },
            },
          },
        },
      },
      '/api/v1/evaluations': {
        get: {
          tags: ['Evaluations'],
          summary: 'List evaluations',
          description: 'Get paginated list of all agent evaluations.',
          parameters: [
            {
              name: 'agentId',
              in: 'query',
              description: 'Filter by agent ID',
              schema: { type: 'string' },
            },
            {
              name: 'chainIds',
              in: 'query',
              description: 'Filter by chain IDs (comma-separated)',
              schema: { type: 'string' },
            },
            {
              name: 'status',
              in: 'query',
              description: 'Filter by status',
              schema: { type: 'string', enum: ['pending', 'processing', 'completed', 'failed'] },
            },
            {
              name: 'minScore',
              in: 'query',
              description: 'Minimum score filter',
              schema: { type: 'integer', minimum: 0, maximum: 100 },
            },
            {
              name: 'maxScore',
              in: 'query',
              description: 'Maximum score filter',
              schema: { type: 'integer', minimum: 0, maximum: 100 },
            },
            {
              name: 'limit',
              in: 'query',
              schema: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
            },
            {
              name: 'cursor',
              in: 'query',
              schema: { type: 'string' },
            },
          ],
          responses: {
            200: {
              description: 'List of evaluations',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/EvaluationsListResponse' },
                },
              },
            },
          },
        },
        post: {
          tags: ['Evaluations'],
          summary: 'Queue evaluation',
          description: 'Queue a new evaluation for an agent.',
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/QueueEvaluationRequest' },
              },
            },
          },
          responses: {
            202: {
              description: 'Evaluation queued',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/EvaluationQueuedResponse' },
                },
              },
            },
            402: {
              description: 'Payment Required - x402 protocol. When x402 is enabled, this endpoint requires payment.',
              headers: {
                'X-Payment': {
                  description: 'x402 payment receipt (include this header with payment to proceed)',
                  schema: { type: 'string' },
                },
              },
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/PaymentRequiredResponse' },
                },
              },
            },
            409: {
              description: 'Already queued',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/ErrorResponse' },
                },
              },
            },
          },
        },
      },
      '/api/v1/evaluations/{id}': {
        get: {
          tags: ['Evaluations'],
          summary: 'Get evaluation details',
          description: 'Get detailed results of a specific evaluation.',
          parameters: [
            {
              name: 'id',
              in: 'path',
              required: true,
              description: 'Evaluation ID',
              schema: { type: 'string' },
            },
          ],
          responses: {
            200: {
              description: 'Evaluation details',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/EvaluationDetailResponse' },
                },
              },
            },
            404: {
              description: 'Not found',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/ErrorResponse' },
                },
              },
            },
          },
        },
      },
      '/api/v1/evaluate/info': {
        get: {
          tags: ['Evaluations'],
          summary: 'Get evaluate endpoint info',
          description: 'Get documentation about the evaluation system.',
          responses: {
            200: {
              description: 'Evaluation system documentation',
              content: {
                'application/json': {
                  schema: { type: 'object' },
                },
              },
            },
          },
        },
      },
      '/api/v1/evaluate/benchmarks': {
        get: {
          tags: ['Evaluations'],
          summary: 'List benchmarks',
          description: 'List available benchmark tests by skill.',
          responses: {
            200: {
              description: 'Available benchmarks',
              content: {
                'application/json': {
                  schema: { type: 'object' },
                },
              },
            },
          },
        },
      },
      '/api/v1/evaluate/{agentId}': {
        get: {
          tags: ['Evaluations'],
          summary: 'Get latest evaluation',
          description: 'Get the most recent evaluation result for an agent.',
          parameters: [
            {
              name: 'agentId',
              in: 'path',
              required: true,
              schema: { type: 'string', pattern: '^\\d+:\\d+$' },
            },
          ],
          responses: {
            200: {
              description: 'Latest evaluation result',
              content: {
                'application/json': {
                  schema: { type: 'object' },
                },
              },
            },
          },
        },
        post: {
          tags: ['Evaluations'],
          summary: 'Trigger evaluation',
          description: 'Trigger a new capability evaluation for an agent.',
          parameters: [
            {
              name: 'agentId',
              in: 'path',
              required: true,
              schema: { type: 'string', pattern: '^\\d+:\\d+$' },
            },
          ],
          requestBody: {
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    force: { type: 'boolean', default: false, description: 'Force re-evaluation' },
                    skills: { type: 'array', items: { type: 'string' }, description: 'Skills to test' },
                  },
                },
              },
            },
          },
          responses: {
            200: {
              description: 'Evaluation result',
              content: {
                'application/json': {
                  schema: { type: 'object' },
                },
              },
            },
            402: {
              description: 'Payment Required - x402 protocol. When x402 is enabled, this endpoint requires payment.',
              headers: {
                'X-Payment': {
                  description: 'x402 payment receipt (include this header with payment to proceed)',
                  schema: { type: 'string' },
                },
              },
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/PaymentRequiredResponse' },
                },
              },
            },
          },
        },
      },
    },
    components: {
      securitySchemes: {
        ApiKeyAuth: {
          type: 'apiKey',
          in: 'header',
          name: 'X-API-Key',
          description: 'API key for authenticated access',
        },
      },
      schemas: {
        ErrorResponse: {
          type: 'object',
          required: ['success', 'error', 'code'],
          properties: {
            success: { type: 'boolean', enum: [false] },
            error: { type: 'string' },
            code: {
              type: 'string',
              enum: ['NOT_FOUND', 'VALIDATION_ERROR', 'INTERNAL_ERROR', 'RATE_LIMIT_EXCEEDED'],
            },
            requestId: { type: 'string' },
          },
        },
        PaymentRequiredResponse: {
          type: 'object',
          description: 'x402 payment required response. Contains payment instructions for pay-per-request endpoints.',
          properties: {
            error: { type: 'string', example: 'Payment required' },
            x402Version: { type: 'integer', example: 1 },
            accepts: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  scheme: { type: 'string', example: 'exact' },
                  network: { type: 'string', example: 'eip155:8453', description: 'CAIP-2 network identifier' },
                  maxAmountRequired: { type: 'string', example: '50000', description: 'Amount in smallest unit (USDC: 6 decimals)' },
                  resource: { type: 'string', description: 'Resource URL' },
                  description: { type: 'string', example: 'AI-powered team composition' },
                  mimeType: { type: 'string', example: 'application/json' },
                  payTo: { type: 'string', example: '0x...', description: 'Receiver wallet address' },
                  maxTimeoutSeconds: { type: 'integer', example: 60 },
                  asset: { type: 'string', example: 'eip155:8453/erc20:0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', description: 'CAIP-19 asset identifier (USDC on Base)' },
                },
              },
            },
          },
        },
        HealthResponse: {
          type: 'object',
          required: ['status', 'timestamp', 'version', 'services'],
          properties: {
            status: { type: 'string', enum: ['ok', 'degraded', 'down'] },
            timestamp: { type: 'string', format: 'date-time' },
            version: { type: 'string' },
            services: {
              type: 'object',
              properties: {
                sdk: { type: 'string', enum: ['ok', 'error'] },
                searchService: { type: 'string', enum: ['ok', 'error'] },
                classifier: { type: 'string', enum: ['ok', 'error'] },
                database: { type: 'string', enum: ['ok', 'error'] },
              },
            },
          },
        },
        AgentSummary: {
          type: 'object',
          required: [
            'id',
            'chainId',
            'tokenId',
            'name',
            'description',
            'active',
            'hasMcp',
            'hasA2a',
            'x402Support',
            'supportedTrust',
          ],
          properties: {
            id: { type: 'string', example: '11155111:123' },
            chainId: { type: 'integer', example: 11155111 },
            tokenId: { type: 'string', example: '123' },
            name: { type: 'string' },
            description: { type: 'string' },
            image: { type: 'string', format: 'uri' },
            active: { type: 'boolean' },
            hasMcp: { type: 'boolean' },
            hasA2a: { type: 'boolean' },
            x402Support: { type: 'boolean' },
            supportedTrust: {
              type: 'array',
              items: { type: 'string', enum: ['x402', 'eas'] },
            },
            owner: { type: 'string', description: 'Owner wallet address' },
            operators: {
              type: 'array',
              items: { type: 'string' },
              description: 'List of operator addresses',
            },
            ens: { type: 'string', description: 'ENS name if registered' },
            did: { type: 'string', description: 'DID identifier if registered' },
            walletAddress: { type: 'string', description: 'Primary wallet address' },
            oasf: { $ref: '#/components/schemas/OASFClassification' },
            oasfSource: {
              type: 'string',
              enum: ['creator-defined', 'llm-classification', 'none'],
            },
            searchScore: { type: 'number', minimum: 0, maximum: 1 },
            reputationScore: { type: 'number', minimum: 0, maximum: 100 },
            reputationCount: { type: 'integer' },
            matchReasons: {
              type: 'array',
              items: { type: 'string' },
              description: 'Reasons why this agent matched the search query (search results only)',
            },
            inputModes: {
              type: 'array',
              items: { type: 'string' },
              description: 'Supported input modes derived from MCP prompts',
            },
            outputModes: {
              type: 'array',
              items: { type: 'string' },
              description: 'Supported output modes derived from MCP resources',
            },
            trustScore: { type: 'number', minimum: 0, maximum: 100, description: 'PageRank-based trust score' },
            isReachableA2a: { type: 'boolean', description: 'A2A endpoint reachability status' },
            isReachableMcp: { type: 'boolean', description: 'MCP endpoint reachability status' },
            curatedBy: {
              type: 'array',
              items: { type: 'string' },
              description: 'Curator wallet addresses',
            },
            isCurated: { type: 'boolean', description: 'Whether agent is curated' },
            declaredOasfSkills: {
              type: 'array',
              items: { type: 'string' },
              description: 'OASF skill slugs declared by the agent in registration file',
            },
            declaredOasfDomains: {
              type: 'array',
              items: { type: 'string' },
              description: 'OASF domain slugs declared by the agent in registration file',
            },
            emailEndpoint: { type: 'string', description: 'Email contact endpoint' },
            oasfEndpoint: { type: 'string', description: 'OASF API endpoint' },
            oasfVersion: { type: 'string', description: 'OASF API version' },
            lastReachabilityCheckMcp: { type: 'string', format: 'date-time', description: 'Last MCP reachability check timestamp' },
            lastReachabilityCheckA2a: { type: 'string', format: 'date-time', description: 'Last A2A reachability check timestamp' },
            reachabilityAttestor: { type: 'string', description: 'Wallet address of reachability attestor' },
          },
        },
        AgentDetail: {
          allOf: [
            { $ref: '#/components/schemas/AgentSummary' },
            {
              type: 'object',
              required: ['endpoints', 'registration', 'mcpTools', 'a2aSkills'],
              properties: {
                endpoints: { $ref: '#/components/schemas/AgentEndpoints' },
                registration: { $ref: '#/components/schemas/AgentRegistration' },
                mcpTools: { type: 'array', items: { type: 'string' } },
                a2aSkills: { type: 'array', items: { type: 'string' } },
                mcpPrompts: { type: 'array', items: { type: 'string' } },
                mcpResources: { type: 'array', items: { type: 'string' } },
                reputation: { $ref: '#/components/schemas/AgentReputation' },
                ipfsMetadata: { $ref: '#/components/schemas/IPFSMetadata' },
              },
            },
          ],
        },
        AgentEndpoints: {
          type: 'object',
          properties: {
            mcp: {
              type: 'object',
              properties: {
                url: { type: 'string', format: 'uri' },
                version: { type: 'string' },
              },
            },
            a2a: {
              type: 'object',
              properties: {
                url: { type: 'string', format: 'uri' },
                version: { type: 'string' },
              },
            },
            oasf: {
              type: 'object',
              properties: {
                url: { type: 'string', format: 'uri' },
                skills: { type: 'array', items: { type: 'string' } },
                domains: { type: 'array', items: { type: 'string' } },
                version: { type: 'string' },
              },
            },
          },
        },
        AgentRegistration: {
          type: 'object',
          required: [
            'chainId',
            'tokenId',
            'contractAddress',
            'metadataUri',
            'owner',
            'registeredAt',
          ],
          properties: {
            chainId: { type: 'integer' },
            tokenId: { type: 'string' },
            contractAddress: { type: 'string' },
            metadataUri: { type: 'string' },
            owner: { type: 'string' },
            registeredAt: { type: 'string', format: 'date-time' },
          },
        },
        IPFSMetadata: {
          type: 'object',
          properties: {
            socialLinks: {
              type: 'object',
              properties: {
                website: { type: 'string', format: 'uri' },
                twitter: { type: 'string' },
                discord: { type: 'string' },
                github: { type: 'string' },
                telegram: { type: 'string' },
              },
            },
            externalUrl: { type: 'string', format: 'uri' },
            attributes: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  trait_type: { type: 'string' },
                  value: { type: 'string' },
                },
              },
            },
          },
        },
        OASFClassification: {
          type: 'object',
          required: ['skills', 'domains', 'confidence'],
          properties: {
            skills: {
              type: 'array',
              items: { $ref: '#/components/schemas/SkillClassification' },
            },
            domains: {
              type: 'array',
              items: { $ref: '#/components/schemas/DomainClassification' },
            },
            confidence: { type: 'number', minimum: 0, maximum: 1 },
            classifiedAt: { type: 'string', format: 'date-time' },
            modelVersion: { type: 'string' },
            source: {
              type: 'string',
              enum: ['creator-defined', 'llm-classification'],
            },
          },
        },
        SkillClassification: {
          type: 'object',
          required: ['slug', 'confidence'],
          properties: {
            slug: { type: 'string', example: 'natural_language_processing' },
            confidence: { type: 'number', minimum: 0, maximum: 1 },
            reasoning: { type: 'string' },
          },
        },
        DomainClassification: {
          type: 'object',
          required: ['slug', 'confidence'],
          properties: {
            slug: { type: 'string', example: 'technology' },
            confidence: { type: 'number', minimum: 0, maximum: 1 },
            reasoning: { type: 'string' },
          },
        },
        AgentReputation: {
          type: 'object',
          required: ['count', 'averageScore', 'distribution'],
          properties: {
            count: { type: 'integer' },
            averageScore: { type: 'number', minimum: 0, maximum: 100 },
            distribution: {
              type: 'object',
              properties: {
                low: { type: 'integer' },
                medium: { type: 'integer' },
                high: { type: 'integer' },
              },
            },
          },
        },
        AgentListResponse: {
          type: 'object',
          required: ['success', 'data', 'meta'],
          properties: {
            success: { type: 'boolean', enum: [true] },
            data: {
              type: 'array',
              items: { $ref: '#/components/schemas/AgentSummary' },
            },
            meta: {
              type: 'object',
              required: ['total', 'hasMore'],
              properties: {
                total: { type: 'integer' },
                hasMore: { type: 'boolean' },
                nextCursor: { type: 'string' },
              },
            },
          },
        },
        AgentDetailResponse: {
          type: 'object',
          required: ['success', 'data'],
          properties: {
            success: { type: 'boolean', enum: [true] },
            data: { $ref: '#/components/schemas/AgentDetail' },
          },
        },
        SearchRequest: {
          type: 'object',
          required: ['query'],
          properties: {
            query: { type: 'string', minLength: 1 },
            filters: {
              type: 'object',
              properties: {
                chainIds: { type: 'array', items: { type: 'integer' } },
                active: { type: 'boolean' },
                mcp: { type: 'boolean' },
                a2a: { type: 'boolean' },
                x402: { type: 'boolean' },
                skills: { type: 'array', items: { type: 'string' } },
                domains: { type: 'array', items: { type: 'string' } },
                filterMode: { type: 'string', enum: ['AND', 'OR'] },
                owner: { type: 'string', description: 'Owner wallet address (exact match, case-insensitive)' },
                walletAddress: { type: 'string', description: 'Agent wallet address (exact match)' },
                ens: { type: 'string', description: 'ENS name (exact match)' },
                did: { type: 'string', description: 'DID identifier (exact match)' },
                trustModels: { type: 'array', items: { type: 'string' }, description: 'Filter by trust models' },
                hasTrusts: { type: 'boolean', description: 'Has any trust model configured' },
                reachableA2a: { type: 'boolean', description: 'A2A endpoint is reachable' },
                reachableMcp: { type: 'boolean', description: 'MCP endpoint is reachable' },
                mcpTools: { type: 'array', items: { type: 'string' }, description: 'Filter by MCP tool names' },
                a2aSkills: { type: 'array', items: { type: 'string' }, description: 'Filter by A2A skill names' },
                hasRegistrationFile: { type: 'boolean', description: 'Has registration metadata file' },
                minRep: { type: 'number', minimum: 0, maximum: 100, description: 'Minimum reputation score (0-100)' },
                maxRep: { type: 'number', minimum: 0, maximum: 100, description: 'Maximum reputation score (0-100)' },
                excludeChainIds: { type: 'array', items: { type: 'integer' }, description: 'Chain IDs to exclude' },
                excludeSkills: { type: 'array', items: { type: 'string' }, description: 'OASF skills to exclude' },
                excludeDomains: { type: 'array', items: { type: 'string' }, description: 'OASF domains to exclude' },
                trustScoreMin: { type: 'number', minimum: 0, maximum: 100, description: 'Minimum trust score (0-100)' },
                trustScoreMax: { type: 'number', minimum: 0, maximum: 100, description: 'Maximum trust score (0-100)' },
                curatedBy: { type: 'string', description: 'Curator wallet address' },
                isCurated: { type: 'boolean', description: 'Filter by curated status' },
                declaredSkill: { type: 'string', description: 'Declared OASF skill slug (from registration file)' },
                declaredDomain: { type: 'string', description: 'Declared OASF domain slug (from registration file)' },
                hasEmail: { type: 'boolean', description: 'Has email endpoint' },
                hasOasfEndpoint: { type: 'boolean', description: 'Has OASF API endpoint' },
                hasRecentReachability: { type: 'boolean', description: 'Has reachability attestation within 14 days' },
                walletVerified: { type: 'boolean', description: 'Wallet verification status (ERC-8004 v1.0)' },
                declaredSkills: { type: 'array', items: { type: 'string' }, description: 'Multiple declared OASF skill slugs' },
                declaredDomains: { type: 'array', items: { type: 'string' }, description: 'Multiple declared OASF domain slugs' },
                hasTags: { type: 'array', items: { type: 'string' }, description: 'Filter by agents with specific feedback tags' },
                reachableWeb: { type: 'boolean', description: 'Web endpoint is reachable' },
                minValidationScore: { type: 'number', minimum: 0, maximum: 100, description: 'Minimum validation score (0-100)' },
                maxValidationScore: { type: 'number', minimum: 0, maximum: 100, description: 'Maximum validation score (0-100)' },
                hasValidations: { type: 'boolean', description: 'Has at least one validation' },
                hasPendingValidations: { type: 'boolean', description: 'Has pending validations' },
                hasExpiredValidations: { type: 'boolean', description: 'Has expired validations' },
              },
            },
            minScore: { type: 'number', minimum: 0, maximum: 1, default: 0.3 },
            limit: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
            cursor: { type: 'string' },
          },
        },
        SearchResponse: {
          type: 'object',
          required: ['success', 'data', 'meta'],
          properties: {
            success: { type: 'boolean', enum: [true] },
            data: {
              type: 'array',
              items: { $ref: '#/components/schemas/AgentSummary' },
            },
            meta: {
              type: 'object',
              required: ['query', 'total', 'hasMore'],
              properties: {
                query: { type: 'string' },
                total: { type: 'integer' },
                hasMore: { type: 'boolean' },
                nextCursor: { type: 'string' },
              },
            },
          },
        },
        ClassificationResponse: {
          type: 'object',
          required: ['success', 'data'],
          properties: {
            success: { type: 'boolean', enum: [true] },
            data: { $ref: '#/components/schemas/OASFClassification' },
          },
        },
        ClassificationPendingResponse: {
          type: 'object',
          required: ['success', 'status', 'estimatedTime'],
          properties: {
            success: { type: 'boolean', enum: [true] },
            status: { type: 'string', enum: ['pending', 'processing'] },
            estimatedTime: { type: 'integer', description: 'Estimated time in seconds' },
          },
        },
        ClassificationQueuedResponse: {
          type: 'object',
          required: ['success', 'status', 'agentId'],
          properties: {
            success: { type: 'boolean', enum: [true] },
            status: { type: 'string', enum: ['queued', 'already_classified'] },
            agentId: { type: 'string' },
          },
        },
        ReputationResponse: {
          type: 'object',
          required: ['success', 'data'],
          properties: {
            success: { type: 'boolean', enum: [true] },
            data: {
              type: 'object',
              required: ['agentId', 'reputation', 'recentFeedback'],
              properties: {
                agentId: { type: 'string' },
                reputation: { $ref: '#/components/schemas/AgentReputation' },
                recentFeedback: {
                  type: 'array',
                  items: { $ref: '#/components/schemas/FeedbackItem' },
                },
              },
            },
          },
        },
        FeedbackItem: {
          type: 'object',
          required: ['id', 'score', 'createdAt'],
          properties: {
            id: { type: 'string' },
            score: { type: 'integer', minimum: 0, maximum: 100 },
            comment: { type: 'string' },
            attester: { type: 'string' },
            createdAt: { type: 'string', format: 'date-time' },
            feedbackIndex: {
              type: 'integer',
              description: 'Per-client feedback index (ERC-8004 v1.0)',
            },
            endpoint: { type: 'string', description: 'Service endpoint reference (ERC-8004 v1.0)' },
          },
        },
        FeedbackListResponse: {
          type: 'object',
          required: ['success', 'data', 'meta'],
          properties: {
            success: { type: 'boolean', enum: [true] },
            data: {
              type: 'array',
              items: { $ref: '#/components/schemas/FeedbackItem' },
            },
            meta: {
              type: 'object',
              properties: {
                total: { type: 'integer' },
                limit: { type: 'integer' },
              },
            },
          },
        },
        ChainStats: {
          type: 'object',
          required: ['chainId', 'name', 'totalCount', 'withRegistrationFileCount', 'activeCount'],
          properties: {
            chainId: { type: 'integer' },
            name: { type: 'string' },
            shortName: { type: 'string' },
            explorerUrl: { type: 'string' },
            totalCount: { type: 'integer', description: 'Total number of agents (all, no filter)' },
            withRegistrationFileCount: {
              type: 'integer',
              description: 'Agents with registration file (have metadata)',
            },
            activeCount: { type: 'integer', description: 'Active agents with registration file' },
            status: { type: 'string', enum: ['ok', 'error', 'cached'] },
          },
        },
        ChainStatsResponse: {
          type: 'object',
          required: ['success', 'data'],
          properties: {
            success: { type: 'boolean', enum: [true] },
            data: {
              type: 'array',
              items: { $ref: '#/components/schemas/ChainStats' },
            },
          },
        },
        PlatformStatsResponse: {
          type: 'object',
          required: ['success', 'data'],
          properties: {
            success: { type: 'boolean', enum: [true] },
            data: {
              type: 'object',
              required: ['totalAgents', 'withRegistrationFile', 'activeAgents', 'chainBreakdown'],
              properties: {
                totalAgents: {
                  type: 'integer',
                  description: 'Total agents across all chains (no filter)',
                },
                withRegistrationFile: {
                  type: 'integer',
                  description: 'Agents with registration file across all chains',
                },
                activeAgents: { type: 'integer', description: 'Active agents across all chains' },
                chainBreakdown: {
                  type: 'array',
                  items: { $ref: '#/components/schemas/ChainStats' },
                },
              },
            },
          },
        },
        TaxonomyCategory: {
          type: 'object',
          required: ['id', 'slug', 'name'],
          properties: {
            id: { type: 'integer' },
            slug: { type: 'string' },
            name: { type: 'string' },
            description: { type: 'string' },
            children: {
              type: 'array',
              items: { $ref: '#/components/schemas/TaxonomyCategory' },
            },
          },
        },
        TaxonomyResponse: {
          type: 'object',
          required: ['success', 'data'],
          properties: {
            success: { type: 'boolean', enum: [true] },
            data: {
              type: 'object',
              properties: {
                version: { type: 'string' },
                skills: {
                  type: 'array',
                  items: { $ref: '#/components/schemas/TaxonomyCategory' },
                },
                domains: {
                  type: 'array',
                  items: { $ref: '#/components/schemas/TaxonomyCategory' },
                },
              },
            },
          },
        },
        // New schemas for additional endpoints
        AgentBatchResponse: {
          type: 'object',
          required: ['success', 'data', 'meta'],
          properties: {
            success: { type: 'boolean', enum: [true] },
            data: {
              type: 'array',
              items: { $ref: '#/components/schemas/AgentSummary' },
            },
            meta: {
              type: 'object',
              properties: {
                requested: { type: 'integer' },
                found: { type: 'integer' },
                missing: { type: 'array', items: { type: 'string' } },
                invalid: { type: 'array', items: { type: 'string' } },
              },
            },
          },
        },
        SimilarAgentsResponse: {
          type: 'object',
          required: ['success', 'data', 'meta'],
          properties: {
            success: { type: 'boolean', enum: [true] },
            data: {
              type: 'array',
              items: {
                allOf: [
                  { $ref: '#/components/schemas/AgentSummary' },
                  {
                    type: 'object',
                    properties: {
                      similarityScore: { type: 'number', minimum: 0, maximum: 1 },
                      matchedSkills: { type: 'array', items: { type: 'string' } },
                      matchedDomains: { type: 'array', items: { type: 'string' } },
                    },
                  },
                ],
              },
            },
            meta: {
              type: 'object',
              properties: {
                total: { type: 'integer' },
                limit: { type: 'integer' },
                targetAgent: { type: 'string' },
              },
            },
          },
        },
        ComplementaryAgentsResponse: {
          type: 'object',
          required: ['success', 'data', 'meta'],
          properties: {
            success: { type: 'boolean', enum: [true] },
            data: {
              type: 'array',
              items: {
                allOf: [
                  { $ref: '#/components/schemas/AgentSummary' },
                  {
                    type: 'object',
                    properties: {
                      complementarityScore: { type: 'number', minimum: 0, maximum: 1 },
                      complementarySkills: { type: 'array', items: { type: 'string' } },
                      sharedDomains: { type: 'array', items: { type: 'string' } },
                    },
                  },
                ],
              },
            },
            meta: {
              type: 'object',
              properties: {
                sourceAgentId: { type: 'string' },
                sourceSkills: { type: 'array', items: { type: 'string' } },
                sourceDomains: { type: 'array', items: { type: 'string' } },
                analysisTimeMs: { type: 'integer' },
              },
            },
          },
        },
        CompatibleAgentsResponse: {
          type: 'object',
          required: ['success', 'data', 'meta'],
          properties: {
            success: { type: 'boolean', enum: [true] },
            data: {
              type: 'object',
              properties: {
                upstream: {
                  type: 'array',
                  items: { $ref: '#/components/schemas/AgentSummary' },
                  description: 'Agents that can send data TO the source agent',
                },
                downstream: {
                  type: 'array',
                  items: { $ref: '#/components/schemas/AgentSummary' },
                  description: 'Agents that can receive data FROM the source agent',
                },
              },
            },
            meta: {
              type: 'object',
              properties: {
                sourceAgentId: { type: 'string' },
                sourceInputModes: { type: 'array', items: { type: 'string' } },
                sourceOutputModes: { type: 'array', items: { type: 'string' } },
                upstreamCount: { type: 'integer' },
                downstreamCount: { type: 'integer' },
                analysisTimeMs: { type: 'integer' },
              },
            },
          },
        },
        AgentHealthResponse: {
          type: 'object',
          required: ['success', 'data'],
          properties: {
            success: { type: 'boolean', enum: [true] },
            data: {
              type: 'object',
              properties: {
                agentId: { type: 'string' },
                status: { type: 'string', enum: ['healthy', 'degraded', 'unhealthy', 'unknown'] },
                uptimePercentage: { type: 'number', minimum: 0, maximum: 100 },
                mcp: {
                  type: 'object',
                  properties: {
                    reachable: { type: 'boolean' },
                    latencyMs: { type: 'integer' },
                    successRate: { type: 'number' },
                  },
                },
                a2a: {
                  type: 'object',
                  properties: {
                    reachable: { type: 'boolean' },
                    latencyMs: { type: 'integer' },
                    successRate: { type: 'number' },
                  },
                },
                lastCheckedAt: { type: 'string', format: 'date-time' },
              },
            },
          },
        },
        AgentEvaluationsResponse: {
          type: 'object',
          required: ['success', 'data', 'meta'],
          properties: {
            success: { type: 'boolean', enum: [true] },
            data: { type: 'array', items: { type: 'object' } },
            meta: {
              type: 'object',
              properties: {
                total: { type: 'integer' },
                hasMore: { type: 'boolean' },
                nextCursor: { type: 'string' },
              },
            },
          },
        },
        VerificationStatusResponse: {
          type: 'object',
          required: ['success', 'data'],
          properties: {
            success: { type: 'boolean', enum: [true] },
            data: {
              type: 'object',
              properties: {
                agentId: { type: 'string' },
                badge: {
                  type: 'object',
                  properties: {
                    level: { type: 'string', enum: ['none', 'basic', 'verified', 'trusted'] },
                    verifiedMethods: { type: 'array', items: { type: 'string' } },
                    verificationCount: { type: 'integer' },
                    lastVerifiedAt: { type: 'string', format: 'date-time' },
                  },
                },
                verifications: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      method: { type: 'string' },
                      status: { type: 'string' },
                      verifiedAt: { type: 'string', format: 'date-time' },
                      expiresAt: { type: 'string', format: 'date-time' },
                    },
                  },
                },
                availableMethods: { type: 'array', items: { type: 'string' } },
              },
            },
          },
        },
        ChallengeStatusResponse: {
          type: 'object',
          required: ['success', 'data'],
          properties: {
            success: { type: 'boolean', enum: [true] },
            data: {
              type: 'object',
              properties: {
                hasChallenge: { type: 'boolean' },
                method: { type: 'string' },
                challengeCode: { type: 'string' },
                expiresAt: { type: 'string', format: 'date-time' },
                attemptsRemaining: { type: 'integer' },
              },
            },
          },
        },
        ChallengeCreatedResponse: {
          type: 'object',
          required: ['success', 'data'],
          properties: {
            success: { type: 'boolean', enum: [true] },
            data: {
              type: 'object',
              properties: {
                challengeId: { type: 'string' },
                method: { type: 'string' },
                challengeCode: { type: 'string' },
                expiresAt: { type: 'string', format: 'date-time' },
                instructions: { type: 'string' },
                attemptsRemaining: { type: 'integer' },
              },
            },
            message: { type: 'string' },
          },
        },
        VerificationResultResponse: {
          type: 'object',
          required: ['success', 'data'],
          properties: {
            success: { type: 'boolean', enum: [true] },
            data: {
              type: 'object',
              properties: {
                verified: { type: 'boolean' },
                method: { type: 'string' },
                badge: { type: 'object' },
                error: { type: 'string' },
                attemptsRemaining: { type: 'integer' },
              },
            },
            message: { type: 'string' },
          },
        },
        ComposeRequest: {
          type: 'object',
          required: ['task'],
          properties: {
            task: {
              type: 'string',
              minLength: 10,
              maxLength: 2000,
              description: 'Task or goal description',
            },
            teamSize: {
              type: 'integer',
              minimum: 1,
              maximum: 10,
              description: 'Preferred team size',
            },
            requiredSkills: {
              type: 'array',
              items: { type: 'string' },
              maxItems: 20,
              description: 'OASF skill slugs that must be covered',
            },
            requiredDomains: {
              type: 'array',
              items: { type: 'string' },
              maxItems: 20,
              description: 'OASF domain slugs that must be covered',
            },
            minReputation: {
              type: 'integer',
              minimum: 0,
              maximum: 100,
              description: 'Minimum agent reputation score',
            },
            requireMcp: { type: 'boolean', description: 'Only include agents with MCP endpoints' },
            requireA2a: { type: 'boolean', description: 'Only include agents with A2A endpoints' },
            chainIds: {
              type: 'array',
              items: { type: 'integer' },
              maxItems: 10,
              description: 'Filter by chain IDs',
            },
          },
        },
        ComposeResponse: {
          type: 'object',
          required: ['success', 'data'],
          properties: {
            success: { type: 'boolean', enum: [true] },
            data: {
              type: 'object',
              properties: {
                analysis: { type: 'object', description: 'Task analysis with identified skills' },
                team: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      agentId: { type: 'string' },
                      role: { type: 'string' },
                      contributedSkills: { type: 'array', items: { type: 'string' } },
                      fitnessScore: { type: 'number' },
                    },
                  },
                },
                teamFitnessScore: { type: 'number', minimum: 0, maximum: 1 },
                coveredSkills: { type: 'array', items: { type: 'string' } },
                skillGaps: { type: 'array', items: { type: 'string' } },
                coveredDomains: { type: 'array', items: { type: 'string' } },
                compositionTimeMs: { type: 'integer' },
              },
            },
          },
        },
        IntentTemplatesResponse: {
          type: 'object',
          required: ['success', 'data', 'meta'],
          properties: {
            success: { type: 'boolean', enum: [true] },
            data: {
              type: 'array',
              items: { $ref: '#/components/schemas/IntentTemplate' },
            },
            meta: {
              type: 'object',
              properties: {
                total: { type: 'integer' },
                category: { type: 'string' },
                featuredOnly: { type: 'boolean' },
              },
            },
          },
        },
        IntentTemplate: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            name: { type: 'string' },
            description: { type: 'string' },
            category: { type: 'string' },
            isFeatured: { type: 'boolean' },
            steps: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  stepOrder: { type: 'integer' },
                  role: { type: 'string' },
                  description: { type: 'string' },
                  requiredSkills: { type: 'array', items: { type: 'string' } },
                },
              },
            },
          },
        },
        IntentTemplateResponse: {
          type: 'object',
          required: ['success', 'data'],
          properties: {
            success: { type: 'boolean', enum: [true] },
            data: { $ref: '#/components/schemas/IntentTemplate' },
          },
        },
        IntentMatchResponse: {
          type: 'object',
          required: ['success', 'data'],
          properties: {
            success: { type: 'boolean', enum: [true] },
            data: {
              type: 'object',
              properties: {
                template: { $ref: '#/components/schemas/IntentTemplate' },
                steps: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      step: { type: 'object' },
                      matchedAgents: { type: 'array', items: { $ref: '#/components/schemas/AgentSummary' } },
                      bestMatch: { $ref: '#/components/schemas/AgentSummary' },
                      ioCompatible: {
                        type: 'object',
                        properties: {
                          withPrevious: { type: 'boolean' },
                          withNext: { type: 'boolean' },
                        },
                      },
                    },
                  },
                },
                summary: {
                  type: 'object',
                  properties: {
                    isComplete: { type: 'boolean' },
                    canExecute: { type: 'boolean' },
                    totalAgentsMatched: { type: 'integer' },
                    stepsWithMatches: { type: 'integer' },
                    totalSteps: { type: 'integer' },
                  },
                },
              },
            },
          },
        },
        LeaderboardResponse: {
          type: 'object',
          required: ['success', 'data', 'meta'],
          properties: {
            success: { type: 'boolean', enum: [true] },
            data: {
              type: 'array',
              items: {
                allOf: [
                  { $ref: '#/components/schemas/AgentSummary' },
                  {
                    type: 'object',
                    properties: {
                      rank: { type: 'integer' },
                      reputationScore: { type: 'number' },
                      feedbackCount: { type: 'integer' },
                    },
                  },
                ],
              },
            },
            meta: {
              type: 'object',
              properties: {
                total: { type: 'integer' },
                limit: { type: 'integer' },
                hasMore: { type: 'boolean' },
                nextCursor: { type: 'string' },
                period: { type: 'string' },
                generatedAt: { type: 'string', format: 'date-time' },
              },
            },
          },
        },
        TrendingResponse: {
          type: 'object',
          required: ['success', 'data', 'meta'],
          properties: {
            success: { type: 'boolean', enum: [true] },
            data: {
              type: 'object',
              properties: {
                agents: {
                  type: 'array',
                  items: {
                    allOf: [
                      { $ref: '#/components/schemas/AgentSummary' },
                      {
                        type: 'object',
                        properties: {
                          reputationChange: { type: 'number' },
                          previousScore: { type: 'number' },
                          currentScore: { type: 'number' },
                        },
                      },
                    ],
                  },
                },
                period: { type: 'string' },
                generatedAt: { type: 'string', format: 'date-time' },
                nextRefreshAt: { type: 'string', format: 'date-time' },
              },
            },
            meta: {
              type: 'object',
              properties: {
                dataAvailable: { type: 'boolean' },
                message: { type: 'string' },
              },
            },
          },
        },
        GlobalFeedbacksResponse: {
          type: 'object',
          required: ['success', 'data', 'meta', 'stats'],
          properties: {
            success: { type: 'boolean', enum: [true] },
            data: {
              type: 'array',
              items: {
                allOf: [
                  { $ref: '#/components/schemas/FeedbackItem' },
                  {
                    type: 'object',
                    properties: {
                      agentId: { type: 'string' },
                      agentName: { type: 'string' },
                      agentChainId: { type: 'integer' },
                    },
                  },
                ],
              },
            },
            meta: {
              type: 'object',
              properties: {
                total: { type: 'integer' },
                limit: { type: 'integer' },
                hasMore: { type: 'boolean' },
                nextCursor: { type: 'string' },
              },
            },
            stats: {
              type: 'object',
              properties: {
                total: { type: 'integer' },
                positive: { type: 'integer' },
                neutral: { type: 'integer' },
                negative: { type: 'integer' },
              },
            },
          },
        },
        EvaluationsListResponse: {
          type: 'object',
          required: ['success', 'data', 'meta'],
          properties: {
            success: { type: 'boolean', enum: [true] },
            data: { type: 'array', items: { type: 'object' } },
            meta: {
              type: 'object',
              properties: {
                total: { type: 'integer' },
                hasMore: { type: 'boolean' },
                nextCursor: { type: 'string' },
                queue: { type: 'object' },
              },
            },
          },
        },
        QueueEvaluationRequest: {
          type: 'object',
          required: ['agentId'],
          properties: {
            agentId: { type: 'string', pattern: '^\\d+:\\d+$' },
            skills: { type: 'array', items: { type: 'string' } },
            priority: { type: 'integer', minimum: 0, maximum: 10, default: 0 },
            force: { type: 'boolean', default: false },
          },
        },
        EvaluationQueuedResponse: {
          type: 'object',
          required: ['success', 'data'],
          properties: {
            success: { type: 'boolean', enum: [true] },
            data: { type: 'object' },
            message: { type: 'string' },
          },
        },
        EvaluationDetailResponse: {
          type: 'object',
          required: ['success', 'data'],
          properties: {
            success: { type: 'boolean', enum: [true] },
            data: { type: 'object' },
          },
        },
        FeedbackResponsesResponse: {
          type: 'object',
          required: ['success', 'data'],
          properties: {
            success: { type: 'boolean', enum: [true] },
            data: {
              type: 'object',
              required: ['feedbackId', 'responses', 'count'],
              properties: {
                feedbackId: { type: 'string', description: 'Feedback ID' },
                responses: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      id: { type: 'string' },
                      responder: { type: 'string', description: 'Wallet address of responder' },
                      responseUri: { type: 'string', description: 'IPFS or HTTPS URI to response content' },
                      responseHash: { type: 'string', description: 'KECCAK-256 hash of response content' },
                      createdAt: { type: 'string', format: 'date-time' },
                    },
                  },
                },
                count: { type: 'integer', description: 'Number of responses' },
              },
            },
          },
        },
        ReputationHistoryResponse: {
          type: 'object',
          required: ['success', 'data'],
          properties: {
            success: { type: 'boolean', enum: [true] },
            data: {
              type: 'object',
              required: ['agentId', 'period', 'history'],
              properties: {
                agentId: { type: 'string' },
                period: { type: 'string', enum: ['7d', '30d', '90d', '1y'] },
                history: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      date: { type: 'string', format: 'date' },
                      score: { type: 'number', description: 'Reputation score (0-100)' },
                      feedbackCount: { type: 'integer' },
                    },
                  },
                },
                currentScore: { type: 'number' },
                totalFeedback: { type: 'integer' },
              },
            },
          },
        },
        AgentValidationsResponse: {
          type: 'object',
          required: ['success', 'data', 'meta'],
          properties: {
            success: { type: 'boolean', enum: [true] },
            data: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  id: { type: 'string' },
                  validatorAddress: { type: 'string' },
                  score: { type: 'integer', minimum: 0, maximum: 100 },
                  status: { type: 'string', enum: ['pending', 'completed', 'expired'] },
                  createdAt: { type: 'string', format: 'date-time' },
                  expiresAt: { type: 'string', format: 'date-time' },
                },
              },
            },
            meta: {
              type: 'object',
              properties: {
                total: { type: 'integer' },
                hasMore: { type: 'boolean' },
                nextCursor: { type: 'string' },
              },
            },
          },
        },
        GlobalStatsResponse: {
          type: 'object',
          required: ['success', 'data'],
          properties: {
            success: { type: 'boolean', enum: [true] },
            data: {
              type: 'object',
              properties: {
                totalAgents: { type: 'integer' },
                totalFeedback: { type: 'integer' },
                totalChains: { type: 'integer' },
                averageReputation: { type: 'number' },
                mcpEnabledCount: { type: 'integer' },
                a2aEnabledCount: { type: 'integer' },
              },
            },
          },
        },
        ChainProtocolStatsResponse: {
          type: 'object',
          required: ['success', 'data'],
          properties: {
            success: { type: 'boolean', enum: [true] },
            data: {
              type: 'object',
              properties: {
                chainId: { type: 'integer' },
                chainName: { type: 'string' },
                totalAgents: { type: 'integer' },
                activeAgents: { type: 'integer' },
                totalFeedback: { type: 'integer' },
                averageReputation: { type: 'number' },
                mcpEnabledCount: { type: 'integer' },
                a2aEnabledCount: { type: 'integer' },
                erc8004Version: { type: 'string' },
              },
            },
          },
        },
      },
    },
  };
}

const openapi = new Hono<{ Bindings: Env; Variables: Variables }>();

/**
 * GET /api/v1/openapi.json
 * Returns OpenAPI 3.1.0 specification
 */
openapi.get('/openapi.json', (c) => {
  const spec = generateOpenAPISpec();
  return c.json(spec);
});

/**
 * GET /api/v1/openapi.yaml
 * Returns OpenAPI 3.1.0 specification in YAML format
 * Note: Returns JSON structure with YAML content-type hint.
 * Full YAML serialization would require an additional dependency.
 */
openapi.get('/openapi.yaml', (_c) => {
  const spec = generateOpenAPISpec();
  return new Response(JSON.stringify(spec, null, 2), {
    headers: { 'Content-Type': 'application/x-yaml' },
  });
});

/**
 * GET /api/v1/openapi (redirect to .json)
 */
openapi.get('/', (c) => {
  const spec = generateOpenAPISpec();
  return c.json(spec);
});

export { openapi };
