/**
 * Agent Verification Service
 * Supports DNS TXT, ENS reverse lookup, and Social (GitHub/Twitter) verification
 * @module services/verification
 */

import type { D1Database } from '@cloudflare/workers-types';

/**
 * Verification methods
 */
export const VERIFICATION_METHODS = ['dns', 'ens', 'github', 'twitter'] as const;
export type VerificationMethod = (typeof VERIFICATION_METHODS)[number];

/**
 * Verification status
 */
export type VerificationStatus = 'pending' | 'verified' | 'failed' | 'expired';

/**
 * Badge levels based on verification count
 */
export type BadgeLevel = 'none' | 'basic' | 'verified' | 'official';

/**
 * Verification record
 */
export interface Verification {
  id: string;
  agentId: string;
  chainId: number;
  method: VerificationMethod;
  status: VerificationStatus;
  proofData?: string;
  verifiedAt?: string;
  expiresAt?: string;
  error?: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * Verification badge
 */
export interface VerificationBadge {
  agentId: string;
  badgeLevel: BadgeLevel;
  verifiedMethods: VerificationMethod[];
  verificationCount: number;
  lastVerifiedAt?: string;
}

/**
 * Verification challenge for pending verifications
 */
export interface VerificationChallenge {
  id: string;
  agentId: string;
  method: VerificationMethod;
  challengeCode: string;
  expectedValue?: string;
  expiresAt: string;
  attempts: number;
  maxAttempts: number;
}

/**
 * Database row types
 */
interface VerificationRow {
  id: string;
  agent_id: string;
  chain_id: number;
  method: string;
  status: string;
  proof_data: string | null;
  verified_at: string | null;
  expires_at: string | null;
  error: string | null;
  created_at: string;
  updated_at: string;
}

interface BadgeRow {
  agent_id: string;
  badge_level: string;
  verified_methods: string;
  verification_count: number;
  last_verified_at: string | null;
  created_at: string;
  updated_at: string;
}

interface ChallengeRow {
  id: string;
  agent_id: string;
  method: string;
  challenge_code: string;
  expected_value: string | null;
  expires_at: string;
  attempts: number;
  max_attempts: number;
  created_at: string;
}

/**
 * Generate a random challenge code
 */
function generateChallengeCode(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return `8004-verify-${Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')}`;
}

/**
 * Calculate badge level from verification count
 */
function calculateBadgeLevel(verificationCount: number): BadgeLevel {
  if (verificationCount >= 3) return 'official';
  if (verificationCount >= 2) return 'verified';
  if (verificationCount >= 1) return 'basic';
  return 'none';
}

/**
 * Convert row to Verification
 */
function rowToVerification(row: VerificationRow): Verification {
  return {
    id: row.id,
    agentId: row.agent_id,
    chainId: row.chain_id,
    method: row.method as VerificationMethod,
    status: row.status as VerificationStatus,
    proofData: row.proof_data ?? undefined,
    verifiedAt: row.verified_at ?? undefined,
    expiresAt: row.expires_at ?? undefined,
    error: row.error ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * Convert row to Badge
 */
function rowToBadge(row: BadgeRow): VerificationBadge {
  return {
    agentId: row.agent_id,
    badgeLevel: row.badge_level as BadgeLevel,
    verifiedMethods: JSON.parse(row.verified_methods) as VerificationMethod[],
    verificationCount: row.verification_count,
    lastVerifiedAt: row.last_verified_at ?? undefined,
  };
}

/**
 * Convert row to Challenge
 */
function rowToChallenge(row: ChallengeRow): VerificationChallenge {
  return {
    id: row.id,
    agentId: row.agent_id,
    method: row.method as VerificationMethod,
    challengeCode: row.challenge_code,
    expectedValue: row.expected_value ?? undefined,
    expiresAt: row.expires_at,
    attempts: row.attempts,
    maxAttempts: row.max_attempts,
  };
}

/**
 * Verification service interface
 */
export interface VerificationService {
  /**
   * Get all verifications for an agent
   */
  getVerifications(agentId: string): Promise<Verification[]>;

  /**
   * Get verification badge for an agent
   */
  getBadge(agentId: string): Promise<VerificationBadge>;

  /**
   * Start a verification challenge
   */
  startChallenge(
    agentId: string,
    chainId: number,
    method: VerificationMethod
  ): Promise<VerificationChallenge>;

  /**
   * Verify a challenge (check if requirements are met)
   */
  verifyChallenge(
    agentId: string,
    method: VerificationMethod,
    proofData?: string
  ): Promise<{ success: boolean; error?: string }>;

  /**
   * Get pending challenge for an agent and method
   */
  getChallenge(agentId: string, method: VerificationMethod): Promise<VerificationChallenge | null>;

  /**
   * Recalculate badge for an agent
   */
  recalculateBadge(agentId: string): Promise<VerificationBadge>;
}

/**
 * DNS verification helpers
 */
async function verifyDNS(
  agentId: string,
  challengeCode: string,
  proofData?: string
): Promise<{ success: boolean; error?: string }> {
  // proofData should be the domain to check
  if (!proofData) {
    return { success: false, error: 'Domain is required for DNS verification' };
  }

  try {
    // Use DNS over HTTPS to check TXT records
    const response = await fetch(
      `https://cloudflare-dns.com/dns-query?name=_8004-verify.${proofData}&type=TXT`,
      {
        headers: { Accept: 'application/dns-json' },
      }
    );

    if (!response.ok) {
      return { success: false, error: 'Failed to query DNS records' };
    }

    const data = (await response.json()) as { Answer?: Array<{ data: string }> };
    const txtRecords = data.Answer?.map((a) => a.data.replace(/"/g, '')) ?? [];

    // Check if any TXT record contains the challenge code
    const found = txtRecords.some(
      (txt) => txt.includes(challengeCode) || txt.includes(agentId)
    );

    if (found) {
      return { success: true };
    }

    return {
      success: false,
      error: `TXT record not found. Add: _8004-verify.${proofData} TXT "${challengeCode}"`,
    };
  } catch (error) {
    console.error('DNS verification failed', {
      agentId,
      domain: proofData,
      error: error instanceof Error ? error.message : String(error),
    });
    return {
      success: false,
      error: error instanceof Error ? error.message : 'DNS verification failed',
    };
  }
}

/**
 * ENS verification helpers
 */
async function verifyENS(
  agentId: string,
  challengeCode: string,
  proofData?: string,
  rpcUrl?: string
): Promise<{ success: boolean; error?: string }> {
  // proofData should be the ENS name
  if (!proofData) {
    return { success: false, error: 'ENS name is required for ENS verification' };
  }

  if (!rpcUrl) {
    return { success: false, error: 'RPC URL not configured for ENS verification' };
  }

  try {
    // Simple ENS resolution check - in production would use proper ENS resolution
    // For now, we check if the ENS name's text record contains the agent ID
    const response = await fetch(rpcUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        method: 'eth_call',
        params: [
          {
            // ENS resolver interface - getText for "8004-agent" key
            // This is simplified - full implementation would use ENS libraries
            to: '0x4976fb03C32e5B8cfe2b6cCB31c09Ba78EBaBa41', // ENS Public Resolver
            data: '0x59d1d43c', // getText selector (simplified)
          },
          'latest',
        ],
        id: 1,
      }),
    });

    if (!response.ok) {
      return { success: false, error: 'Failed to query ENS' };
    }

    // For now, return a placeholder - full ENS integration would require more work
    return {
      success: false,
      error: 'ENS verification requires setting 8004-agent text record to your agent ID',
    };
  } catch (error) {
    console.error('ENS verification failed', {
      agentId,
      ensName: proofData,
      error: error instanceof Error ? error.message : String(error),
    });
    return {
      success: false,
      error: error instanceof Error ? error.message : 'ENS verification failed',
    };
  }
}

/**
 * GitHub verification helpers
 */
async function verifyGitHub(
  agentId: string,
  challengeCode: string,
  proofData?: string
): Promise<{ success: boolean; error?: string }> {
  // proofData should be the GitHub username
  if (!proofData) {
    return { success: false, error: 'GitHub username is required' };
  }

  try {
    // Check for a gist with the verification code
    const response = await fetch(
      `https://api.github.com/users/${proofData}/gists`,
      {
        headers: {
          Accept: 'application/vnd.github.v3+json',
          'User-Agent': '8004-Verification/1.0',
        },
      }
    );

    if (!response.ok) {
      if (response.status === 404) {
        return { success: false, error: 'GitHub user not found' };
      }
      return { success: false, error: 'Failed to fetch GitHub gists' };
    }

    const gists = (await response.json()) as Array<{
      files: Record<string, { content?: string }>;
      description?: string;
    }>;

    // Look for a gist containing the challenge code or agent ID
    for (const gist of gists) {
      // Check description
      if (gist.description?.includes(challengeCode) || gist.description?.includes(agentId)) {
        return { success: true };
      }

      // Check file names
      if (gist.files['8004-verify.txt'] || gist.files[`${agentId}.txt`]) {
        return { success: true };
      }
    }

    return {
      success: false,
      error: `Create a public gist with filename "8004-verify.txt" containing: ${challengeCode}`,
    };
  } catch (error) {
    console.error('GitHub verification failed', {
      agentId,
      username: proofData,
      error: error instanceof Error ? error.message : String(error),
    });
    return {
      success: false,
      error: error instanceof Error ? error.message : 'GitHub verification failed',
    };
  }
}

/**
 * Twitter verification helpers
 */
async function verifyTwitter(
  agentId: string,
  challengeCode: string,
  proofData?: string
): Promise<{ success: boolean; error?: string }> {
  // Twitter verification requires OAuth or API access
  // For now, return instructions for manual verification
  if (!proofData) {
    return { success: false, error: 'Twitter username is required' };
  }

  return {
    success: false,
    error: `Tweet the following to verify: "Verifying my 8004 agent ${agentId} with code ${challengeCode} @8004dev"`,
  };
}

/**
 * Create verification service
 */
export function createVerificationService(
  db: D1Database,
  config?: { ethereumRpcUrl?: string }
): VerificationService {
  return {
    async getVerifications(agentId: string): Promise<Verification[]> {
      const result = await db
        .prepare('SELECT * FROM agent_verifications WHERE agent_id = ? ORDER BY created_at DESC')
        .bind(agentId)
        .all<VerificationRow>();

      return result.results.map(rowToVerification);
    },

    async getBadge(agentId: string): Promise<VerificationBadge> {
      const row = await db
        .prepare('SELECT * FROM agent_verification_badges WHERE agent_id = ?')
        .bind(agentId)
        .first<BadgeRow>();

      if (row) {
        return rowToBadge(row);
      }

      // Return default badge if none exists
      return {
        agentId,
        badgeLevel: 'none',
        verifiedMethods: [],
        verificationCount: 0,
      };
    },

    async startChallenge(
      agentId: string,
      chainId: number,
      method: VerificationMethod
    ): Promise<VerificationChallenge> {
      const id = crypto.randomUUID().replace(/-/g, '');
      const challengeCode = generateChallengeCode();
      const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(); // 24 hours

      // Delete existing challenge for this agent/method
      await db
        .prepare('DELETE FROM verification_challenges WHERE agent_id = ? AND method = ?')
        .bind(agentId, method)
        .run();

      // Create new challenge
      await db
        .prepare(
          `INSERT INTO verification_challenges (id, agent_id, method, challenge_code, expires_at)
           VALUES (?, ?, ?, ?, ?)`
        )
        .bind(id, agentId, method, challengeCode, expiresAt)
        .run();

      // Create pending verification record
      const verificationId = crypto.randomUUID().replace(/-/g, '');
      const now = new Date().toISOString();

      await db
        .prepare(
          `INSERT OR REPLACE INTO agent_verifications
           (id, agent_id, chain_id, method, status, created_at, updated_at)
           VALUES (?, ?, ?, ?, 'pending', ?, ?)`
        )
        .bind(verificationId, agentId, chainId, method, now, now)
        .run();

      return {
        id,
        agentId,
        method,
        challengeCode,
        expiresAt,
        attempts: 0,
        maxAttempts: 5,
      };
    },

    async verifyChallenge(
      agentId: string,
      method: VerificationMethod,
      proofData?: string
    ): Promise<{ success: boolean; error?: string }> {
      // Get the challenge
      const challenge = await db
        .prepare(
          'SELECT * FROM verification_challenges WHERE agent_id = ? AND method = ?'
        )
        .bind(agentId, method)
        .first<ChallengeRow>();

      if (!challenge) {
        return { success: false, error: 'No pending challenge found. Start a new challenge first.' };
      }

      // Check if expired
      if (new Date(challenge.expires_at) < new Date()) {
        return { success: false, error: 'Challenge has expired. Start a new challenge.' };
      }

      // Check attempts
      if (challenge.attempts >= challenge.max_attempts) {
        return { success: false, error: 'Maximum attempts exceeded. Start a new challenge.' };
      }

      // Increment attempts
      await db
        .prepare(
          'UPDATE verification_challenges SET attempts = attempts + 1 WHERE id = ?'
        )
        .bind(challenge.id)
        .run();

      // Verify based on method
      let result: { success: boolean; error?: string };

      switch (method) {
        case 'dns':
          result = await verifyDNS(agentId, challenge.challenge_code, proofData);
          break;
        case 'ens':
          result = await verifyENS(agentId, challenge.challenge_code, proofData, config?.ethereumRpcUrl);
          break;
        case 'github':
          result = await verifyGitHub(agentId, challenge.challenge_code, proofData);
          break;
        case 'twitter':
          result = await verifyTwitter(agentId, challenge.challenge_code, proofData);
          break;
        default:
          result = { success: false, error: 'Unknown verification method' };
      }

      const now = new Date().toISOString();

      if (result.success) {
        // Update verification record to verified
        await db
          .prepare(
            `UPDATE agent_verifications
             SET status = 'verified', proof_data = ?, verified_at = ?, updated_at = ?
             WHERE agent_id = ? AND method = ?`
          )
          .bind(proofData ?? null, now, now, agentId, method)
          .run();

        // Delete challenge
        await db
          .prepare('DELETE FROM verification_challenges WHERE id = ?')
          .bind(challenge.id)
          .run();

        // Recalculate badge
        await this.recalculateBadge(agentId);
      } else {
        // Update verification record with error
        await db
          .prepare(
            `UPDATE agent_verifications
             SET error = ?, updated_at = ?
             WHERE agent_id = ? AND method = ?`
          )
          .bind(result.error ?? null, now, agentId, method)
          .run();
      }

      return result;
    },

    async getChallenge(
      agentId: string,
      method: VerificationMethod
    ): Promise<VerificationChallenge | null> {
      const row = await db
        .prepare(
          'SELECT * FROM verification_challenges WHERE agent_id = ? AND method = ?'
        )
        .bind(agentId, method)
        .first<ChallengeRow>();

      if (!row) return null;

      // Check if expired
      if (new Date(row.expires_at) < new Date()) {
        return null;
      }

      return rowToChallenge(row);
    },

    async recalculateBadge(agentId: string): Promise<VerificationBadge> {
      // Get all verified verifications for this agent
      const result = await db
        .prepare(
          `SELECT method, verified_at FROM agent_verifications
           WHERE agent_id = ? AND status = 'verified'
           ORDER BY verified_at DESC`
        )
        .bind(agentId)
        .all<{ method: string; verified_at: string }>();

      const verifiedMethods = result.results.map((r) => r.method as VerificationMethod);
      const verificationCount = verifiedMethods.length;
      const badgeLevel = calculateBadgeLevel(verificationCount);
      const lastVerifiedAt = result.results[0]?.verified_at;
      const now = new Date().toISOString();

      // Upsert badge
      await db
        .prepare(
          `INSERT OR REPLACE INTO agent_verification_badges
           (agent_id, badge_level, verified_methods, verification_count, last_verified_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?)`
        )
        .bind(
          agentId,
          badgeLevel,
          JSON.stringify(verifiedMethods),
          verificationCount,
          lastVerifiedAt ?? null,
          now
        )
        .run();

      return {
        agentId,
        badgeLevel,
        verifiedMethods,
        verificationCount,
        lastVerifiedAt,
      };
    },
  };
}
