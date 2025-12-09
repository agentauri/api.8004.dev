/**
 * EAS (Ethereum Attestation Service) attestation indexer
 * @module services/eas-indexer
 */

import { getEasSyncState, updateEasSyncState } from '@/db/queries';
import type { NewFeedback } from '@/db/schema';
import { fetchWithTimeout } from '@/lib/utils/fetch';
import { decodeAbiParameters } from 'viem';
import { createReputationService } from './reputation';

/**
 * EAS GraphQL endpoints by chain
 */
const EAS_GRAPHQL_ENDPOINTS: Record<number, string> = {
  11155111: 'https://sepolia.easscan.org/graphql',
  84532: 'https://base-sepolia.easscan.org/graphql',
  80002: 'https://polygon-amoy.easscan.org/graphql',
};

/**
 * EAS schema UIDs for agent feedback attestations per chain
 *
 * Schema format: (string agentId, uint8 score, string[] tags, string context)
 *
 * To deploy the schema on each chain:
 * 1. Go to the respective easscan.org schema creation page
 * 2. Create schema with: string agentId, uint8 score, string[] tags, string context
 * 3. Set revocable: true, resolver: 0x0
 * 4. Update the UID below with the deployed schema UID
 *
 * @see https://sepolia.easscan.org/schema/create
 * @see https://base-sepolia.easscan.org/schema/create
 * @see https://polygon-amoy.easscan.org/schema/create
 */
const FEEDBACK_SCHEMA_UIDS: Record<number, string> = {
  11155111: '0x38a8d2b73c84f64eab779c8f5718d24646299f77c89ae4f5f8e17dbe04460fa8', // Ethereum Sepolia
  84532: '0x38a8d2b73c84f64eab779c8f5718d24646299f77c89ae4f5f8e17dbe04460fa8', // Base Sepolia
  80002: '0x38a8d2b73c84f64eab779c8f5718d24646299f77c89ae4f5f8e17dbe04460fa8', // Polygon Amoy
};

const PLACEHOLDER_SCHEMA_UID = '0x0000000000000000000000000000000000000000000000000000000000000000';

/**
 * ABI definition for feedback attestation schema
 */
const FEEDBACK_SCHEMA_ABI = [
  { name: 'agentId', type: 'string' },
  { name: 'score', type: 'uint8' },
  { name: 'tags', type: 'string[]' },
  { name: 'context', type: 'string' },
] as const;

/**
 * Validates that the EAS schema UID has been configured for a chain
 */
function validateSchemaConfig(chainId: number): void {
  const schemaUid = FEEDBACK_SCHEMA_UIDS[chainId];
  if (!schemaUid || schemaUid === PLACEHOLDER_SCHEMA_UID) {
    console.warn(
      `EAS Indexer: Chain ${chainId} using placeholder schema UID. No attestations will be matched. Deploy the feedback schema to EAS and update FEEDBACK_SCHEMA_UIDS before production use.`
    );
  }
}

/**
 * Get schema UID for a chain
 */
function getSchemaUid(chainId: number): string | null {
  const schemaUid = FEEDBACK_SCHEMA_UIDS[chainId];
  if (!schemaUid || schemaUid === PLACEHOLDER_SCHEMA_UID) {
    return null;
  }
  return schemaUid;
}

/**
 * Raw attestation from EAS GraphQL
 */
interface EASAttestation {
  id: string;
  attester: string;
  recipient: string;
  refUID: string;
  revocationTime: number;
  expirationTime: number;
  time: number;
  txid: string;
  data: string;
  schemaId: string;
}

/**
 * Decoded feedback attestation data
 */
interface FeedbackAttestationData {
  agentId: string;
  score: number;
  tags: string[];
  context?: string;
}

/**
 * EAS indexer service interface
 */
export interface EASIndexerService {
  /**
   * Sync attestations for a specific chain
   */
  syncChain(chainId: number): Promise<SyncResult>;

  /**
   * Sync attestations for all supported chains
   */
  syncAll(): Promise<Map<number, SyncResult>>;
}

/**
 * Result of a sync operation
 */
export interface SyncResult {
  chainId: number;
  success: boolean;
  attestationsProcessed: number;
  newFeedbackCount: number;
  lastBlock: number;
  error?: string;
}

/**
 * GraphQL query for fetching attestations
 */
const ATTESTATIONS_QUERY = `
  query GetAttestations($schemaId: String!, $take: Int!, $skip: Int!, $timeAfter: Int) {
    attestations(
      where: {
        schemaId: { equals: $schemaId }
        revocationTime: { equals: 0 }
        time: { gt: $timeAfter }
      }
      take: $take
      skip: $skip
      orderBy: { time: asc }
    ) {
      id
      attester
      recipient
      refUID
      revocationTime
      expirationTime
      time
      txid
      data
      schemaId
    }
  }
`;

/**
 * Decode attestation data from hex using viem's ABI decoder
 *
 * The expected schema format is:
 * (string agentId, uint8 score, string[] tags, string context)
 *
 * @public Exported for testing
 */
export function decodeAttestationData(hexData: string): FeedbackAttestationData | null {
  try {
    // Ensure hex data has 0x prefix
    const normalizedData = hexData.startsWith('0x') ? hexData : `0x${hexData}`;

    // Minimum length check (at least some data should be present)
    if (normalizedData.length < 66) {
      // 0x + 64 chars minimum
      console.warn('Attestation data too short to decode:', normalizedData.substring(0, 20));
      return null;
    }

    const decoded = decodeAbiParameters(FEEDBACK_SCHEMA_ABI, normalizedData as `0x${string}`);

    const [agentId, score, tags, context] = decoded;

    // Validate score is in valid range (1-5)
    const scoreNum = Number(score);
    if (scoreNum < 1 || scoreNum > 5) {
      console.warn(`Invalid score value: ${scoreNum}. Expected 1-5.`);
      return null;
    }

    return {
      agentId,
      score: scoreNum,
      tags: [...tags],
      context: context || undefined,
    };
  } catch (error) {
    console.error('Failed to decode attestation data:', error);
    return null;
  }
}

/**
 * Fetch attestations from EAS GraphQL API
 */
async function fetchAttestations(
  endpoint: string,
  schemaId: string,
  take: number,
  skip: number,
  timeAfter: number
): Promise<EASAttestation[]> {
  const response = await fetchWithTimeout(
    endpoint,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        query: ATTESTATIONS_QUERY,
        variables: {
          schemaId,
          take,
          skip,
          timeAfter,
        },
      }),
    },
    30_000 // 30 second timeout for GraphQL queries
  );

  if (!response.ok) {
    throw new Error(`EAS GraphQL error: ${response.status} ${response.statusText}`);
  }

  const result = (await response.json()) as {
    data?: { attestations: EASAttestation[] };
    errors?: Array<{ message: string }>;
  };

  if (result.errors?.length) {
    const firstError = result.errors[0];
    throw new Error(`EAS GraphQL error: ${firstError?.message ?? 'Unknown error'}`);
  }

  return result.data?.attestations ?? [];
}

/**
 * Configuration options for EAS indexer (primarily for testing)
 */
export interface EASIndexerConfig {
  /**
   * Override schema UIDs (for testing)
   */
  schemaUids?: Record<number, string>;
}

/**
 * Create EAS indexer service
 */
export function createEASIndexerService(
  db: D1Database,
  config?: EASIndexerConfig
): EASIndexerService {
  const reputationService = createReputationService(db);

  // Allow overriding schema UIDs for testing
  const getConfiguredSchemaUid = (chainId: number): string | null => {
    if (config?.schemaUids?.[chainId]) {
      const overrideUid = config.schemaUids[chainId];
      // Return null if override is placeholder UID
      if (overrideUid === PLACEHOLDER_SCHEMA_UID) {
        return null;
      }
      return overrideUid;
    }
    return getSchemaUid(chainId);
  };

  return {
    // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: EAS sync requires sequential processing with multiple conditions
    async syncChain(chainId: number): Promise<SyncResult> {
      const endpoint = EAS_GRAPHQL_ENDPOINTS[chainId];
      if (!endpoint) {
        return {
          chainId,
          success: false,
          attestationsProcessed: 0,
          newFeedbackCount: 0,
          lastBlock: 0,
          error: `Unsupported chain: ${chainId}`,
        };
      }

      try {
        // Warn if schema UID is not configured
        validateSchemaConfig(chainId);

        // Get schema UID for this chain
        const schemaUid = getConfiguredSchemaUid(chainId);
        if (!schemaUid) {
          return {
            chainId,
            success: true, // Not an error, just no schema configured
            attestationsProcessed: 0,
            newFeedbackCount: 0,
            lastBlock: 0,
          };
        }

        // Get last sync state
        const syncState = await getEasSyncState(db, chainId);
        const lastTimestamp = syncState?.last_timestamp
          ? Math.floor(new Date(syncState.last_timestamp).getTime() / 1000)
          : 0;

        let attestationsProcessed = 0;
        let newFeedbackCount = 0;
        let latestTimestamp = lastTimestamp;
        let hasMore = true;
        let skip = 0;
        const take = 100;

        while (hasMore) {
          const attestations = await fetchAttestations(
            endpoint,
            schemaUid,
            take,
            skip,
            lastTimestamp
          );

          if (attestations.length === 0) {
            hasMore = false;
            break;
          }

          for (const attestation of attestations) {
            attestationsProcessed++;

            // Update latest timestamp
            if (attestation.time > latestTimestamp) {
              latestTimestamp = attestation.time;
            }

            // Check if already processed
            const exists = await reputationService.feedbackExists(attestation.id);
            if (exists) {
              continue;
            }

            // Decode attestation data
            const decoded = decodeAttestationData(attestation.data);
            if (!decoded) {
              console.warn(`Failed to decode attestation ${attestation.id}`);
              continue;
            }

            // Create feedback entry
            const feedback: NewFeedback = {
              agent_id: decoded.agentId,
              chain_id: chainId,
              score: decoded.score,
              tags: JSON.stringify(decoded.tags),
              context: decoded.context,
              feedback_uri: `https://easscan.org/attestation/view/${attestation.id}`,
              submitter: attestation.attester,
              eas_uid: attestation.id,
              submitted_at: new Date(attestation.time * 1000).toISOString(),
            };

            await reputationService.addFeedback(feedback);
            newFeedbackCount++;
          }

          skip += attestations.length;
          hasMore = attestations.length === take;
        }

        // Update sync state
        await updateEasSyncState(
          db,
          chainId,
          0, // We track by timestamp, not block
          latestTimestamp > 0 ? new Date(latestTimestamp * 1000).toISOString() : null,
          newFeedbackCount,
          null
        );

        return {
          chainId,
          success: true,
          attestationsProcessed,
          newFeedbackCount,
          lastBlock: 0,
        };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        console.error(`Failed to sync chain ${chainId}:`, errorMessage);

        // Update sync state with error
        await updateEasSyncState(db, chainId, 0, null, 0, errorMessage);

        return {
          chainId,
          success: false,
          attestationsProcessed: 0,
          newFeedbackCount: 0,
          lastBlock: 0,
          error: errorMessage,
        };
      }
    },

    async syncAll(): Promise<Map<number, SyncResult>> {
      const results = new Map<number, SyncResult>();
      const chainIds = Object.keys(EAS_GRAPHQL_ENDPOINTS).map(Number);

      for (const chainId of chainIds) {
        const result = await this.syncChain(chainId);
        results.set(chainId, result);
      }

      return results;
    },
  };
}
