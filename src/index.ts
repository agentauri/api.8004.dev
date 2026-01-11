/**
 * 8004-backend main entry point
 * @module index
 */

import { Hono } from 'hono';
import {
  enqueueClassificationsBatch,
  getClassifiedAgentIds,
  getQueuedAgentIds,
  getQueueStatus,
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
import {
  agents,
  analytics,
  chains,
  compose,
  evaluate,
  evaluations,
  events,
  feedbacks,
  health,
  intents,
  keys,
  leaderboard,
  openapi,
  scripts,
  search,
  searchStream,
  stats,
  taxonomy,
  trending,
  webhooks,
} from '@/routes';
import { createClassifierService } from '@/services/classifier';
import { createEASIndexerService } from '@/services/eas-indexer';
import { updateQueueItemStatus } from '@/services/evaluator';
import { createSDKService } from '@/services/sdk';
import {
  processReembedQueue,
  runReconciliation,
  syncD1ToQdrant,
  syncFeedbackFromGraph,
  syncFromGraph,
} from '@/services/sync';
import { crawlMcpCapabilities } from '@/services/sync/mcp-crawl-worker';
import type { ClassificationJob, Env, EvaluationJob, Variables } from '@/types';

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
app.use('/api/v1/evaluate', requireApiKey());
app.use('/api/v1/evaluate/*', requireApiKey());
app.use('/api/v1/feedbacks', requireApiKey());
app.use('/api/v1/feedbacks/*', requireApiKey());
app.use('/api/v1/leaderboard', requireApiKey());
app.use('/api/v1/leaderboard/*', requireApiKey());
app.use('/api/v1/trending', requireApiKey());
app.use('/api/v1/trending/*', requireApiKey());
app.use('/api/v1/evaluations', requireApiKey());
app.use('/api/v1/evaluations/*', requireApiKey());
app.use('/api/v1/webhooks', requireApiKey());
app.use('/api/v1/webhooks/*', requireApiKey());
app.use('/api/v1/keys', requireApiKey());
app.use('/api/v1/keys/*', requireApiKey());
app.use('/api/v1/analytics', requireApiKey());
app.use('/api/v1/analytics/*', requireApiKey());

// Mount routes
app.route('/api/v1/health', health);
app.route('/api/v1/openapi', openapi);
app.route('/api/v1/agents', agents);
app.route('/api/v1/search', search);
app.route('/api/v1/search/stream', searchStream);
app.route('/api/v1/chains', chains);
app.route('/api/v1/stats', stats);
app.route('/api/v1/taxonomy', taxonomy);
app.route('/api/v1/events', events);
app.route('/api/v1/compose', compose);
app.route('/api/v1/intents', intents);
app.route('/api/v1/evaluate', evaluate);
app.route('/api/v1/feedbacks', feedbacks);
app.route('/api/v1/leaderboard', leaderboard);
app.route('/api/v1/trending', trending);
app.route('/api/v1/evaluations', evaluations);
app.route('/api/v1/webhooks', webhooks);
app.route('/api/v1/keys', keys);
app.route('/api/v1/analytics', analytics);

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
 * Queue consumer for evaluation jobs
 * Processes agent evaluations (mystery shopper testing)
 */
async function processEvaluationJob(job: EvaluationJob, env: Env): Promise<void> {
  const { queueItemId, agentId, skills } = job;

  console.info(`Processing evaluation job ${queueItemId} for agent ${agentId}`);

  // Mark as processing (started_at set automatically)
  await updateQueueItemStatus(env.DB, queueItemId, 'processing');

  try {
    // TODO: Implement actual evaluation logic (mystery shopper testing)
    // For now, this is a placeholder that marks the evaluation as completed
    // The actual evaluation would:
    // 1. Connect to the agent's MCP/A2A endpoints
    // 2. Send test requests based on the agent's claimed skills
    // 3. Verify the responses meet quality thresholds
    // 4. Store results in agent_evaluations table

    console.info(`Evaluation job ${queueItemId} for agent ${agentId}: skills=${skills.join(',')}`);

    // Mark as completed (placeholder - actual evaluation logic to be implemented)
    // completed_at set automatically based on status
    await updateQueueItemStatus(env.DB, queueItemId, 'completed');

    console.info(`Evaluation job ${queueItemId} completed`);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error(`Failed to evaluate agent ${agentId}:`, errorMessage);

    // Mark as failed (completed_at set automatically)
    await updateQueueItemStatus(env.DB, queueItemId, 'failed', {
      error: errorMessage,
    });

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
      } catch (error) {
        // Fail-closed: if rate limiting fails, reject the request for security
        console.error(
          'MCP rate limiting error (fail-closed):',
          error instanceof Error ? error.message : String(error)
        );
        return new Response(
          JSON.stringify({
            jsonrpc: '2.0',
            error: { code: -32000, message: 'Service temporarily unavailable. Please retry.' },
          }),
          {
            status: 503,
            headers: {
              'Content-Type': 'application/json',
              'Retry-After': '5',
            },
          }
        );
      }

      const mcpHandler = createMcp8004Handler(env);
      return mcpHandler(request);
    }

    return app.fetch(request, env, ctx);
  },

  /**
   * Queue consumer handler
   * Handles both classification and evaluation queues
   * Processes messages in parallel with concurrency limit for improved throughput
   */
  async queue(batch: MessageBatch<ClassificationJob | EvaluationJob>, env: Env): Promise<void> {
    const CONCURRENCY = 5; // Process up to 5 messages concurrently
    const { globalLogger } = await import('@/lib/logger');

    const queueName = batch.queue;
    const isEvaluationQueue =
      queueName === 'evaluation-jobs' || queueName === 'evaluation-jobs-staging';

    globalLogger.info('Processing queue batch', {
      operation: 'queue-batch',
      queue: queueName,
      messageCount: batch.messages.length,
      concurrency: CONCURRENCY,
    });

    // Process messages in parallel with controlled concurrency
    const results = await Promise.allSettled(
      batch.messages.map(async (message) => {
        try {
          if (isEvaluationQueue) {
            // Process evaluation job
            const job = message.body as EvaluationJob;
            await processEvaluationJob(job, env);
            message.ack();
            return { agentId: job.agentId, queueItemId: job.queueItemId, status: 'success' };
          } else {
            // Process classification job
            const job = message.body as ClassificationJob;
            await processClassificationJob(job, env);
            message.ack();
            return { agentId: job.agentId, status: 'success' };
          }
        } catch (error) {
          const agentId = isEvaluationQueue
            ? (message.body as EvaluationJob).agentId
            : (message.body as ClassificationJob).agentId;
          globalLogger.logError(
            `${isEvaluationQueue ? 'Evaluation' : 'Classification'} job failed`,
            error,
            {
              agentId,
            }
          );
          // Message will be retried or sent to DLQ
          message.retry();
          return { agentId, status: 'failed' };
        }
      })
    );

    // Log batch summary
    const succeeded = results.filter((r) => r.status === 'fulfilled').length;
    const failed = results.filter((r) => r.status === 'rejected').length;
    globalLogger.info('Queue batch completed', {
      operation: 'queue-batch-complete',
      queue: queueName,
      succeeded,
      failed,
      total: batch.messages.length,
    });
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
                `${graphResult.reembedded} reembedded, ${graphResult.skipped ?? 0} skipped, ` +
                `${graphResult.errors.length} errors${graphResult.hasMore ? ' (more pending)' : ''}`
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
                `${d1Result.reputationUpdated} reputation, ` +
                `${d1Result.agentsMarkedForReembed} marked for re-embed, ` +
                `${d1Result.errors.length} errors`
            );
          } catch (error) {
            console.error('D1 sync failed:', error instanceof Error ? error.message : error);
          }
        })()
      );

      // Every 30 minutes: Process re-embedding queue (at minute 0 and 30)
      if (minute === 0 || minute === 30) {
        ctx.waitUntil(
          (async () => {
            console.info('Starting re-embedding queue processing...');
            try {
              const reembedResult = await processReembedQueue(env.DB, {
                QDRANT_URL: qdrantUrl,
                QDRANT_API_KEY: qdrantApiKey,
                QDRANT_COLLECTION: qdrantCollection,
                VENICE_API_KEY: veniceApiKey,
              });
              console.info(
                `Re-embed: ${reembedResult.successful} success, ${reembedResult.failed} failed, ` +
                  `${reembedResult.errors.length} errors`
              );
            } catch (error) {
              console.error('Re-embed failed:', error instanceof Error ? error.message : error);
            }
          })()
        );

        // Every 30 minutes: Crawl MCP endpoints for detailed capabilities
        ctx.waitUntil(
          (async () => {
            console.info('Starting MCP capabilities crawl...');
            try {
              const mcpResult = await crawlMcpCapabilities({
                QDRANT_URL: qdrantUrl,
                QDRANT_API_KEY: qdrantApiKey,
                QDRANT_COLLECTION: qdrantCollection,
              });
              console.info(
                `MCP crawl: ${mcpResult.agentsWithMcp} agents with MCP, ` +
                  `${mcpResult.crawledSuccessfully} crawled, ${mcpResult.crawlErrors} errors`
              );
            } catch (error) {
              console.error('MCP crawl failed:', error instanceof Error ? error.message : error);
            }
          })()
        );
      }

      // Hourly only: Run reconciliation (at minute 0)
      // Requires GRAPH_API_KEY to be configured
      if (minute === 0 && graphApiKey) {
        ctx.waitUntil(
          (async () => {
            console.info('Starting Qdrant reconciliation...');
            try {
              const reconResult = await runReconciliation(env.DB, {
                QDRANT_URL: qdrantUrl,
                QDRANT_API_KEY: qdrantApiKey,
                QDRANT_COLLECTION: qdrantCollection,
                VENICE_API_KEY: veniceApiKey,
                GRAPH_API_KEY: graphApiKey,
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

    // Hourly only (at minute 0): EAS + Graph feedback + batch classification + analytics
    if (minute === 0) {
      // Sync EAS attestations every hour
      ctx.waitUntil(syncEASAttestations(env));

      // Sync Graph feedback every hour
      ctx.waitUntil(
        (async () => {
          console.info('Starting Graph feedback sync...');
          try {
            const graphFeedbackResult = await syncFeedbackFromGraph(env.DB, {
              GRAPH_API_KEY: graphApiKey,
            });
            console.info(
              `Graph feedback sync: ${graphFeedbackResult.feedbackProcessed} processed, ` +
                `${graphFeedbackResult.newFeedbackCount} new, ${graphFeedbackResult.revokedCount} revoked`
            );
          } catch (error) {
            console.error(
              'Graph feedback sync failed:',
              error instanceof Error ? error.message : error
            );
          }
        })()
      );

      // Batch classify unclassified agents (50 per hour)
      ctx.waitUntil(batchClassifyAgents(env));

      // Run hourly analytics aggregation
      ctx.waitUntil(
        (async () => {
          console.info('Starting hourly analytics aggregation...');
          try {
            const { runHourlyAggregation } = await import('@/services/analytics');
            await runHourlyAggregation(env.DB);
            console.info('Analytics aggregation completed');
          } catch (error) {
            console.error(
              'Analytics aggregation failed:',
              error instanceof Error ? error.message : error
            );
          }
        })()
      );

      // Daily only (at 00:00 UTC): Take reputation snapshots for trending
      const hour = new Date(event.scheduledTime).getUTCHours();
      if (hour === 0) {
        ctx.waitUntil(
          (async () => {
            console.info('Starting daily reputation snapshot...');
            try {
              const { createTrendingService } = await import('@/services/trending');
              const trendingService = createTrendingService(env);
              const result = await trendingService.takeSnapshot();
              console.info(
                `Reputation snapshot: ${result.agentsSnapshotted} agents, ` +
                  `${result.errors.length} errors`
              );
            } catch (error) {
              console.error(
                'Reputation snapshot failed:',
                error instanceof Error ? error.message : error
              );
            }
          })()
        );
      }
    }
  },
};
// CI trigger: 2026-01-11T17:30:50Z
// E2E test trigger: 2026-01-11T17:42:10Z
