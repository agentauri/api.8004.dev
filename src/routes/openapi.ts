/**
 * OpenAPI specification endpoint
 * @module routes/openapi
 */

import { OASF_VERSION } from '@/lib/oasf/taxonomy';
import { SUPPORTED_CHAIN_IDS } from '@/lib/utils/validation';
import type { Env, Variables } from '@/types';
import { Hono } from 'hono';

/**
 * OpenAPI 3.1.0 specification for 8004 Backend API
 */
function generateOpenAPISpec(): object {
  return {
    openapi: '3.1.0',
    info: {
      title: '8004 Backend API',
      version: '1.0.0',
      description:
        'Unified REST API for the ERC-8004 agent explorer. Provides agent discovery, semantic search, OASF classification, and reputation data.',
      license: {
        name: 'MIT',
        url: 'https://github.com/agentauri/api.8004.dev/blob/main/LICENSE',
      },
      contact: {
        name: '8004 API Support',
        url: 'https://github.com/agentauri/api.8004.dev/issues',
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
      { name: 'Chains', description: 'Blockchain network statistics' },
      { name: 'Taxonomy', description: 'OASF taxonomy data' },
      { name: 'Stats', description: 'Platform-wide statistics' },
      { name: 'Health', description: 'Service health checks' },
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
              schema: { type: 'string', example: '11155111,84532' },
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
              name: 'skills',
              in: 'query',
              description: 'Filter by OASF skill slugs (comma-separated)',
              schema: { type: 'string', example: 'natural_language_processing/text_generation' },
            },
            {
              name: 'domains',
              in: 'query',
              description: 'Filter by OASF domain slugs (comma-separated)',
              schema: { type: 'string', example: 'technology/software_development' },
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
            oasf: { $ref: '#/components/schemas/OASFClassification' },
            oasfSource: {
              type: 'string',
              enum: ['creator-defined', 'llm-classification', 'none'],
            },
            searchScore: { type: 'number', minimum: 0, maximum: 1 },
            reputationScore: { type: 'number', minimum: 0, maximum: 100 },
            reputationCount: { type: 'integer' },
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
            slug: { type: 'string', example: 'natural_language_processing/text_generation' },
            confidence: { type: 'number', minimum: 0, maximum: 1 },
            reasoning: { type: 'string' },
          },
        },
        DomainClassification: {
          type: 'object',
          required: ['slug', 'confidence'],
          properties: {
            slug: { type: 'string', example: 'technology/software_development' },
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
                skills: { type: 'array', items: { type: 'string' } },
                domains: { type: 'array', items: { type: 'string' } },
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
          required: ['chainId', 'name', 'agentCount', 'activeCount'],
          properties: {
            chainId: { type: 'integer' },
            name: { type: 'string' },
            agentCount: { type: 'integer' },
            activeCount: { type: 'integer' },
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
              required: ['totalAgents', 'activeAgents', 'inactiveAgents', 'chainBreakdown'],
              properties: {
                totalAgents: { type: 'integer' },
                activeAgents: { type: 'integer' },
                inactiveAgents: { type: 'integer' },
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
      },
    },
  };
}

const openapi = new Hono<{ Bindings: Env; Variables: Variables }>();

/**
 * GET /api/v1/openapi.json
 * Returns OpenAPI 3.1.0 specification
 */
openapi.get('/', (c) => {
  const spec = generateOpenAPISpec();
  return c.json(spec);
});

/**
 * GET /api/v1/openapi.yaml
 * Returns OpenAPI 3.1.0 specification in YAML format
 * Note: Returns JSON structure with YAML content-type hint.
 * Full YAML serialization would require an additional dependency.
 */
openapi.get('/yaml', (_c) => {
  const spec = generateOpenAPISpec();
  return new Response(JSON.stringify(spec, null, 2), {
    headers: { 'Content-Type': 'application/x-yaml' },
  });
});

export { openapi };
