/**
 * 8004-backend main entry point
 * @module index
 */

import {
  getQueueStatus,
  incrementJobAttempts,
  markJobProcessing,
  updateQueueStatus,
  upsertClassification,
} from '@/db/queries';
import { cors, requestId, securityHeaders } from '@/lib/middleware';
import { handleError } from '@/lib/utils/errors';
import { parseAgentId } from '@/lib/utils/validation';
import { agents, chains, health, search, taxonomy } from '@/routes';
import { createClassifierService } from '@/services/classifier';
import { createSDKService } from '@/services/sdk';
import type { ClassificationJob, Env, Variables } from '@/types';
import { Hono } from 'hono';

// Create Hono app
const app = new Hono<{ Bindings: Env; Variables: Variables }>();

// Global middleware
app.use('*', requestId());
app.use('*', securityHeaders());
app.use('*', cors);

// Global error handler
app.onError(handleError);

// Mount routes
app.route('/api/v1/health', health);
app.route('/api/v1/agents', agents);
app.route('/api/v1/search', search);
app.route('/api/v1/chains', chains);
app.route('/api/v1/taxonomy', taxonomy);

// Root endpoint
app.get('/', (c) => {
  return c.json({
    name: '8004-backend',
    version: '1.0.0',
    docs: '/api/v1/health',
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

    // Classify the agent
    const classifier = createClassifierService(
      env.ANTHROPIC_API_KEY,
      env.CLASSIFICATION_MODEL || 'claude-3-haiku-20240307'
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

// Export for Cloudflare Workers
export default {
  fetch: app.fetch,

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
};
