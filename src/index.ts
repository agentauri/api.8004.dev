/**
 * 8004-backend main entry point
 * @module index
 */

import {
  enqueueClassificationsBatch,
  getClassifiedAgentIds,
  getQueueStatus,
  getQueuedAgentIds,
  incrementJobAttempts,
  markJobProcessing,
  resetFailedJobs,
  updateQueueStatus,
  upsertClassification,
} from '@/db/queries';
import {
  apiKeyAuth,
  bodyLimit,
  cors,
  requestId,
  requireApiKey,
  securityHeaders,
} from '@/lib/middleware';
import { handleError } from '@/lib/utils/errors';
import { parseAgentId } from '@/lib/utils/validation';
import { createMcp8004Handler } from '@/mcp';
import { agents, chains, compose, events, health, intents, openapi, scripts, search, stats, taxonomy } from '@/routes';
import { createClassifierService } from '@/services/classifier';
import { createEASIndexerService } from '@/services/eas-indexer';
import { createSDKService } from '@/services/sdk';
import { runReconciliation, syncD1ToQdrant, syncFromGraph } from '@/services/sync';
import type { ClassificationJob, Env, Variables } from '@/types';
import { Hono } from 'hono';

/**
 * Required environment variables that must be set in production
 */
const REQUIRED_ENV_VARS = [
  'ANTHROPIC_API_KEY',
  'SEARCH_SERVICE_URL',
  'SEPOLIA_RPC_URL',
  'BASE_SEPOLIA_RPC_URL',
  'POLYGON_AMOY_RPC_URL',
] as const;

/**
 * Validate that all required environment variables are set
 * @param env - Environment bindings
 * @throws Error if any required env var is missing (only in production)
 */
function validateEnv(env: Env): void {
  // Skip validation in test environment (ENVIRONMENT=test or not set)
  if (!env.ENVIRONMENT || env.ENVIRONMENT === 'test') {
    return;
  }

  const missing: string[] = [];
  for (const key of REQUIRED_ENV_VARS) {
    if (!env[key]) {
      missing.push(key);
    }
  }
  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }
}

// Create Hono app
const app = new Hono<{ Bindings: Env; Variables: Variables }>();

// Global middleware
app.use('*', requestId());
app.use('*', securityHeaders());
app.use('*', cors);
app.use('*', bodyLimit());
app.use('*', apiKeyAuth());

// Global error handler
app.onError(handleError);

// Protected routes (require API key)
// Note: Both root and wildcard patterns needed for Hono
app.use('/api/v1/agents', requireApiKey());
app.use('/api/v1/agents/*', requireApiKey());
app.use('/api/v1/search', requireApiKey());
app.use('/api/v1/search/*', requireApiKey());
app.use('/api/v1/chains', requireApiKey());
app.use('/api/v1/chains/*', requireApiKey());
app.use('/api/v1/stats', requireApiKey());
app.use('/api/v1/stats/*', requireApiKey());
app.use('/api/v1/taxonomy', requireApiKey());
app.use('/api/v1/taxonomy/*', requireApiKey());
app.use('/api/v1/events', requireApiKey());
app.use('/api/v1/events/*', requireApiKey());
app.use('/api/v1/compose', requireApiKey());
app.use('/api/v1/compose/*', requireApiKey());

// Mount routes
app.route('/api/v1/health', health);
app.route('/api/v1/openapi', openapi);
app.route('/api/v1/agents', agents);
app.route('/api/v1/search', search);
app.route('/api/v1/chains', chains);
app.route('/api/v1/stats', stats);
app.route('/api/v1/taxonomy', taxonomy);
app.route('/api/v1/events', events);
app.route('/api/v1/compose', compose);
app.route('/api/v1/intents', intents);

// Scripts routes (public, no auth required)
app.route('', scripts);

// Root endpoint
app.get('/', (c) => {
  return c.json({
    name: '8004-backend',
    version: '1.0.0',
    docs: {
      json: '/api/v1/openapi/openapi.json',
      yaml: '/api/v1/openapi/openapi.yaml',
    },
    health: '/api/v1/health',
  });
});

// 404 handler
app.notFound((c) => {
  return c.json(
    {
      success: false,
      error: 'Not Found',
      code: 'NOT_FOUND',
    },
    404
  );
});

/**
 * Queue consumer for classification jobs
 */
async function processClassificationJob(job: ClassificationJob, env: Env): Promise<void> {
  // Note: force is reserved for future use to skip cache
  const { agentId, force: _force } = job;

  // Get queue status
  const queueStatus = await getQueueStatus(env.DB, agentId);
  if (!queueStatus) {
    console.error(`No queue entry found for agent ${agentId}`);
    return;
  }

  // Mark as processing
  await markJobProcessing(env.DB, queueStatus.id);
  await incrementJobAttempts(env.DB, queueStatus.id);

  try {
    // Get agent data
    const { chainId, tokenId } = parseAgentId(agentId);
    const sdk = createSDKService(env);
    const agent = await sdk.getAgent(chainId, tokenId);

    if (!agent) {
      throw new Error(`Agent not found: ${agentId}`);
    }

    // Classify the agent (Gemini primary, Claude fallback)
    const classifier = createClassifierService(
      env.GOOGLE_AI_API_KEY,
      env.CLASSIFICATION_MODEL || 'gemini-2.0-flash',
      env.ANTHROPIC_API_KEY,
      env.FALLBACK_MODEL || 'claude-3-haiku-20240307'
    );

    const result = await classifier.classify({
      agentId,
      name: agent.name,
      description: agent.description,
      mcpTools: agent.mcpTools,
      a2aSkills: agent.a2aSkills,
    });

    // Store classification
    await upsertClassification(env.DB, {
      agent_id: agentId,
      chain_id: chainId,
      skills: JSON.stringify(result.skills),
      domains: JSON.stringify(result.domains),
      confidence: result.confidence,
      model_version: result.modelVersion,
      classified_at: new Date().toISOString(),
    });

    // Mark as completed
    await updateQueueStatus(env.DB, queueStatus.id, 'completed');
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error(`Failed to classify agent ${agentId}:`, errorMessage);

    // Mark as failed
    await updateQueueStatus(env.DB, queueStatus.id, 'failed', errorMessage);

    // Re-throw to trigger retry
    throw error;
  }
}

/**
 * Scheduled handler for EAS attestation indexer
 */
async function syncEASAttestations(env: Env): Promise<void> {
  console.info('Starting EAS attestation sync...');

  const indexer = createEASIndexerService(env.DB);
  const results = await indexer.syncAll();

  for (const [chainId, result] of results) {
    if (result.success) {
      console.info(
        `Chain ${chainId}: Processed ${result.attestationsProcessed} attestations, ` +
          `${result.newFeedbackCount} new feedback entries`
      );
    } else {
      console.error(`Chain ${chainId}: Sync failed - ${result.error}`);
    }
  }

  console.info('EAS attestation sync complete');
}

/**
 * Batch size for classification jobs per cron run
 * Processes 50 agents per hour = ~1,200 agents/day
 */
const CLASSIFICATION_BATCH_SIZE = 50;

/**
 * Scheduled handler for batch agent classification
 * Finds unclassified agents and queues them for classification
 */
async function batchClassifyAgents(env: Env): Promise<void> {
  console.info('Starting batch classification...');

  try {
    // 1. Get already classified and queued agent IDs
    const [classifiedIds, queuedIds] = await Promise.all([
      getClassifiedAgentIds(env.DB),
      getQueuedAgentIds(env.DB),
    ]);

    console.info(`Found ${classifiedIds.size} classified, ${queuedIds.size} queued agents`);

    // 2. Get agents from SDK (with registration files)
    const sdk = createSDKService(env);
    // Fetch more agents to find unclassified ones (3x batch size)
    const agentsResult = await sdk.getAgents({
      limit: CLASSIFICATION_BATCH_SIZE * 3,
      hasRegistrationFile: true,
    });

    // 3. Filter to only unclassified agents
    const unclassifiedAgents = agentsResult.items.filter(
      (agent) => !classifiedIds.has(agent.id) && !queuedIds.has(agent.id)
    );

    console.info(`Found ${unclassifiedAgents.length} unclassified agents`);

    if (unclassifiedAgents.length === 0) {
      // No new agents to classify, try to retry some failed jobs
      const resetCount = await resetFailedJobs(env.DB, CLASSIFICATION_BATCH_SIZE);
      if (resetCount > 0) {
        console.info(`Reset ${resetCount} failed jobs for retry`);
      } else {
        console.info('No agents to classify and no failed jobs to retry');
      }
      return;
    }

    // 4. Take batch size and queue for classification
    const toClassify = unclassifiedAgents.slice(0, CLASSIFICATION_BATCH_SIZE);
    const agentIds = toClassify.map((a) => a.id);

    // 5. Enqueue in database and send to queue
    const enqueuedIds = await enqueueClassificationsBatch(env.DB, agentIds);

    // Send to Cloudflare Queue
    for (const agentId of enqueuedIds) {
      await env.CLASSIFICATION_QUEUE.send({ agentId, force: false });
    }

    console.info(`Queued ${enqueuedIds.length} agents for classification`);
  } catch (error) {
    console.error('Batch classification failed:', error instanceof Error ? error.message : error);
  }
}

// Export for Cloudflare Workers
export default {
  fetch: async (request: Request, env: Env, ctx: ExecutionContext) => {
    // Validate environment on first request
    validateEnv(env);

    // Handle MCP routes (public access with rate limiting)
    const url = new URL(request.url);
    const isMcpRoute =
      (url.pathname.startsWith('/mcp') && !url.pathname.startsWith('/mcp-setup')) ||
      url.pathname.startsWith('/sse');
    if (isMcpRoute) {
      // Simple rate limiting for MCP endpoints using KV
      const clientIp = request.headers.get('CF-Connecting-IP') || 'anonymous';
      const rateLimitKey = `mcp-ratelimit:${clientIp}`;
      const now = Math.floor(Date.now() / 1000);
      const window = 60; // 60 second window
      const limit = 60; // 60 requests per minute

      try {
        const entryStr = await env.CACHE.get(rateLimitKey);
        let count = 0;
        let resetAt = now + window;

        if (entryStr) {
          const entry = JSON.parse(entryStr) as { count: number; resetAt: number };
          if (now < entry.resetAt) {
            count = entry.count;
            resetAt = entry.resetAt;
          }
        }

        count++;

        if (count > limit) {
          return new Response(
            JSON.stringify({
              jsonrpc: '2.0',
              error: { code: -32000, message: 'Rate limit exceeded. Try again later.' },
            }),
            {
              status: 429,
              headers: {
                'Content-Type': 'application/json',
                'Retry-After': String(resetAt - now),
                'X-RateLimit-Limit': String(limit),
                'X-RateLimit-Remaining': '0',
                'X-RateLimit-Reset': String(resetAt),
              },
            }
          );
        }

        // Store updated count
        await env.CACHE.put(rateLimitKey, JSON.stringify({ count, resetAt }), {
          expirationTtl: Math.max(resetAt - now, 60),
        });
      } catch {
        // If rate limiting fails, allow request but log
        console.error('MCP rate limiting error');
      }

      const mcpHandler = createMcp8004Handler(env);
      return mcpHandler(request);
    }

    return app.fetch(request, env, ctx);
  },

  /**
   * Queue consumer handler
   */
  async queue(batch: MessageBatch<ClassificationJob>, env: Env): Promise<void> {
    for (const message of batch.messages) {
      try {
        await processClassificationJob(message.body, env);
        message.ack();
      } catch (error) {
        console.error('Classification job failed:', error);
        // Message will be retried or sent to DLQ
        message.retry();
      }
    }
  },

  /**
   * Scheduled handler for periodic tasks
   * - Every 15 min: Graph + D1 → Qdrant sync
   * - Every hour: EAS attestations, reconciliation, batch classification
   */
  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
    const minute = new Date(event.scheduledTime).getMinutes();

    // Every 15 minutes: Sync Graph + D1 data to Qdrant
    // Store env vars for use in async closures (TypeScript narrowing)
    const qdrantUrl = env.QDRANT_URL;
    const qdrantApiKey = env.QDRANT_API_KEY;
    const qdrantCollection = env.QDRANT_COLLECTION;
    const veniceApiKey = env.VENICE_API_KEY;
    const graphApiKey = env.GRAPH_API_KEY;

    if (qdrantUrl && qdrantApiKey && veniceApiKey) {
      ctx.waitUntil(
        (async () => {
          console.info('Starting Graph → Qdrant sync...');
          try {
            const graphResult = await syncFromGraph(env.DB, {
              QDRANT_URL: qdrantUrl,
              QDRANT_API_KEY: qdrantApiKey,
              QDRANT_COLLECTION: qdrantCollection,
              VENICE_API_KEY: veniceApiKey,
              GRAPH_API_KEY: graphApiKey,
            });
            console.info(
              `Graph sync: ${graphResult.newAgents} new, ${graphResult.updatedAgents} updated, ` +
                `${graphResult.reembedded} reembedded, ${graphResult.errors.length} errors`
            );
          } catch (error) {
            console.error('Graph sync failed:', error instanceof Error ? error.message : error);
          }
        })()
      );

      ctx.waitUntil(
        (async () => {
          console.info('Starting D1 → Qdrant sync...');
          try {
            const d1Result = await syncD1ToQdrant(env.DB, {
              QDRANT_URL: qdrantUrl,
              QDRANT_API_KEY: qdrantApiKey,
              QDRANT_COLLECTION: qdrantCollection,
            });
            console.info(
              `D1 sync: ${d1Result.classificationsUpdated} classifications, ` +
                `${d1Result.reputationUpdated} reputation, ${d1Result.errors.length} errors`
            );
          } catch (error) {
            console.error('D1 sync failed:', error instanceof Error ? error.message : error);
          }
        })()
      );

      // Hourly only: Run reconciliation (at minute 0)
      if (minute === 0) {
        ctx.waitUntil(
          (async () => {
            console.info('Starting Qdrant reconciliation...');
            try {
              const reconResult = await runReconciliation(env.DB, {
                QDRANT_URL: qdrantUrl,
                QDRANT_API_KEY: qdrantApiKey,
                QDRANT_COLLECTION: qdrantCollection,
                VENICE_API_KEY: veniceApiKey,
              });
              console.info(
                `Reconciliation: ${reconResult.orphansDeleted} orphans deleted, ` +
                  `${reconResult.missingIndexed} missing indexed, ${reconResult.errors.length} errors`
              );
            } catch (error) {
              console.error(
                'Reconciliation failed:',
                error instanceof Error ? error.message : error
              );
            }
          })()
        );
      }
    }

    // Hourly only (at minute 0): EAS + batch classification
    if (minute === 0) {
      // Sync EAS attestations every hour
      ctx.waitUntil(syncEASAttestations(env));

      // Batch classify unclassified agents (50 per hour)
      ctx.waitUntil(batchClassifyAgents(env));
    }
  },
};
