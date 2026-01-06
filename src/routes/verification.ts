/**
 * Agent verification endpoints
 * @module routes/verification
 */

import { Hono } from 'hono';
import { errors } from '@/lib/utils/errors';
import { rateLimit, rateLimitConfigs } from '@/lib/utils/rate-limit';
import { agentIdSchema } from '@/lib/utils/validation';
import {
  createVerificationService,
  VERIFICATION_METHODS,
  type VerificationMethod,
} from '@/services/verification';
import type { Env, Variables } from '@/types';
import { z } from 'zod';

const verification = new Hono<{ Bindings: Env; Variables: Variables }>();

// Apply rate limiting
verification.use('*', rateLimit(rateLimitConfigs.standard));

/**
 * Validation schemas
 */
const startChallengeSchema = z.object({
  method: z.enum(VERIFICATION_METHODS as unknown as [string, ...string[]]),
});

const verifyChallengeSchema = z.object({
  method: z.enum(VERIFICATION_METHODS as unknown as [string, ...string[]]),
  proofData: z.string().optional(),
});

/**
 * GET /api/v1/agents/:agentId/verification
 * Get verification status and badge for an agent
 */
verification.get('/', async (c) => {
  const agentId = c.req.param('agentId');

  if (!agentId) {
    return errors.validationError(c, 'Agent ID is required');
  }

  const validationResult = agentIdSchema.safeParse(agentId);
  if (!validationResult.success) {
    return errors.validationError(c, 'Invalid agent ID format');
  }

  const verificationService = createVerificationService(c.env.DB, {
    ethereumRpcUrl: c.env.SEPOLIA_RPC_URL,
  });

  const [verifications, badge] = await Promise.all([
    verificationService.getVerifications(agentId),
    verificationService.getBadge(agentId),
  ]);

  return c.json({
    success: true,
    data: {
      agentId,
      badge: {
        level: badge.badgeLevel,
        verifiedMethods: badge.verifiedMethods,
        verificationCount: badge.verificationCount,
        lastVerifiedAt: badge.lastVerifiedAt,
      },
      verifications: verifications.map((v) => ({
        method: v.method,
        status: v.status,
        verifiedAt: v.verifiedAt,
        expiresAt: v.expiresAt,
        error: v.error,
      })),
      availableMethods: VERIFICATION_METHODS,
    },
  });
});

/**
 * POST /api/v1/agents/:agentId/verification/challenge
 * Start a verification challenge for a specific method
 */
verification.post('/challenge', async (c) => {
  const agentId = c.req.param('agentId');

  if (!agentId) {
    return errors.validationError(c, 'Agent ID is required');
  }

  const validationResult = agentIdSchema.safeParse(agentId);
  if (!validationResult.success) {
    return errors.validationError(c, 'Invalid agent ID format');
  }

  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return errors.validationError(c, 'Invalid JSON body');
  }

  const parseResult = startChallengeSchema.safeParse(body);
  if (!parseResult.success) {
    return errors.validationError(c, parseResult.error.issues[0]?.message ?? 'Invalid request');
  }

  const { method } = parseResult.data;
  const [chainIdStr] = agentId.split(':');
  const chainId = Number.parseInt(chainIdStr ?? '11155111', 10);

  const verificationService = createVerificationService(c.env.DB, {
    ethereumRpcUrl: c.env.SEPOLIA_RPC_URL,
  });

  const challenge = await verificationService.startChallenge(
    agentId,
    chainId,
    method as VerificationMethod
  );

  // Generate instructions based on method
  let instructions: string;
  switch (method) {
    case 'dns':
      instructions = `Add a TXT record: _8004-verify.<your-domain> with value "${challenge.challengeCode}"`;
      break;
    case 'ens':
      instructions = `Set the "8004-agent" text record on your ENS name to "${agentId}"`;
      break;
    case 'github':
      instructions = `Create a public gist named "8004-verify.txt" containing "${challenge.challengeCode}"`;
      break;
    case 'twitter':
      instructions = `Tweet: "Verifying my 8004 agent ${agentId} with code ${challenge.challengeCode} @8004dev"`;
      break;
    default:
      instructions = 'Unknown verification method';
  }

  return c.json(
    {
      success: true,
      data: {
        challengeId: challenge.id,
        method,
        challengeCode: challenge.challengeCode,
        expiresAt: challenge.expiresAt,
        instructions,
        attemptsRemaining: challenge.maxAttempts - challenge.attempts,
      },
      message: 'Challenge created. Complete the verification steps and call /verify to confirm.',
    },
    201
  );
});

/**
 * POST /api/v1/agents/:agentId/verification/verify
 * Verify a pending challenge
 */
verification.post('/verify', async (c) => {
  const agentId = c.req.param('agentId');

  if (!agentId) {
    return errors.validationError(c, 'Agent ID is required');
  }

  const validationResult = agentIdSchema.safeParse(agentId);
  if (!validationResult.success) {
    return errors.validationError(c, 'Invalid agent ID format');
  }

  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return errors.validationError(c, 'Invalid JSON body');
  }

  const parseResult = verifyChallengeSchema.safeParse(body);
  if (!parseResult.success) {
    return errors.validationError(c, parseResult.error.issues[0]?.message ?? 'Invalid request');
  }

  const { method, proofData } = parseResult.data;

  const verificationService = createVerificationService(c.env.DB, {
    ethereumRpcUrl: c.env.SEPOLIA_RPC_URL,
  });

  // Check if there's a pending challenge
  const challenge = await verificationService.getChallenge(agentId, method as VerificationMethod);
  if (!challenge) {
    return errors.badRequest(c, 'No pending challenge found. Start a new challenge first.');
  }

  const result = await verificationService.verifyChallenge(
    agentId,
    method as VerificationMethod,
    proofData
  );

  if (result.success) {
    // Get updated badge
    const badge = await verificationService.getBadge(agentId);

    return c.json({
      success: true,
      data: {
        verified: true,
        method,
        badge: {
          level: badge.badgeLevel,
          verifiedMethods: badge.verifiedMethods,
          verificationCount: badge.verificationCount,
        },
      },
      message: `${method} verification successful!`,
    });
  }

  return c.json({
    success: true,
    data: {
      verified: false,
      method,
      error: result.error,
      attemptsRemaining: challenge.maxAttempts - challenge.attempts - 1,
    },
    message: 'Verification failed. Check the error and try again.',
  });
});

/**
 * GET /api/v1/agents/:agentId/verification/challenge
 * Get current challenge status for a specific method
 */
verification.get('/challenge', async (c) => {
  const agentId = c.req.param('agentId');
  const method = c.req.query('method');

  if (!agentId) {
    return errors.validationError(c, 'Agent ID is required');
  }

  if (!method || !VERIFICATION_METHODS.includes(method as VerificationMethod)) {
    return errors.validationError(c, `Invalid method. Must be one of: ${VERIFICATION_METHODS.join(', ')}`);
  }

  const verificationService = createVerificationService(c.env.DB);
  const challenge = await verificationService.getChallenge(agentId, method as VerificationMethod);

  if (!challenge) {
    return c.json({
      success: true,
      data: {
        hasChallenge: false,
        method,
      },
    });
  }

  return c.json({
    success: true,
    data: {
      hasChallenge: true,
      method,
      challengeCode: challenge.challengeCode,
      expiresAt: challenge.expiresAt,
      attemptsRemaining: challenge.maxAttempts - challenge.attempts,
    },
  });
});

export { verification };
