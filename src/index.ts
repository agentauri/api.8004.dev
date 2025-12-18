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
import { agents, chains, health, openapi, search, stats, taxonomy } from '@/routes';
import { createClassifierService } from '@/services/classifier';
import { createEASIndexerService } from '@/services/eas-indexer';
import { createSDKService } from '@/services/sdk';
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

// Mount routes
app.route('/api/v1/health', health);
app.route('/api/v1/openapi', openapi);
app.route('/api/v1/agents', agents);
app.route('/api/v1/search', search);
app.route('/api/v1/chains', chains);
app.route('/api/v1/stats', stats);
app.route('/api/v1/taxonomy', taxonomy);

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
  fetch: (request: Request, env: Env, ctx: ExecutionContext) => {
    // Validate environment on first request
    validateEnv(env);
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
   * Scheduled handler for periodic tasks (runs every hour via cron)
   */
  async scheduled(_event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
    // Sync EAS attestations every hour
    ctx.waitUntil(syncEASAttestations(env));

    // Batch classify unclassified agents (50 per hour)
    ctx.waitUntil(batchClassifyAgents(env));
  },
};
