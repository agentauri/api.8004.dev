/**
 * Graph API Key Manager
 * Handles key rotation and retry logic for The Graph API requests
 * @module lib/config/graph-key-manager
 */

/**
 * Key rotation strategy
 * - 'round-robin': Alternates between SDK and user key based on timestamp
 * - 'user-priority': User key first, SDK as fallback
 * - 'sdk-priority': SDK key first, user as fallback
 */
export type KeyRotationStrategy = 'round-robin' | 'user-priority' | 'sdk-priority';

/**
 * Configuration for GraphKeyManager
 */
export interface GraphKeyManagerConfig {
  /** SDK public key (DEFAULT_GRAPH_API_KEY) */
  sdkKey: string;
  /** User-provided key from env.GRAPH_API_KEY */
  userKey?: string;
  /** Rotation strategy (default: 'round-robin') */
  strategy?: KeyRotationStrategy;
}

/**
 * Result of key selection
 */
interface KeySelection {
  primary: string;
  fallback: string | null;
  source: 'sdk' | 'user';
}

/**
 * Check if an error is retryable (rate limit, auth, network issues)
 */
export function isGraphRetryableError(error: unknown): boolean {
  if (error instanceof Error) {
    const msg = error.message.toLowerCase();
    return (
      msg.includes('429') ||
      msg.includes('rate limit') ||
      msg.includes('quota') ||
      msg.includes('401') ||
      msg.includes('403') ||
      msg.includes('unauthorized') ||
      msg.includes('forbidden') ||
      msg.includes('timeout') ||
      msg.includes('econnreset') ||
      msg.includes('network') ||
      msg.includes('fetch failed') ||
      msg.includes('aborted')
    );
  }
  return false;
}

/**
 * Graph API Key Manager
 * Provides key selection and retry logic for The Graph API requests
 */
export class GraphKeyManager {
  private readonly sdkKey: string;
  private readonly userKey: string | null;
  private readonly strategy: KeyRotationStrategy;

  constructor(config: GraphKeyManagerConfig) {
    this.sdkKey = config.sdkKey;
    this.userKey = config.userKey || null;
    this.strategy = config.strategy || 'round-robin';
  }

  /**
   * Check if rotation is available (both keys present)
   */
  hasRotation(): boolean {
    return this.userKey !== null && this.userKey !== this.sdkKey;
  }

  /**
   * Select primary and fallback keys based on strategy
   */
  selectKeys(): KeySelection {
    // If no user key or same as SDK key, only use SDK
    if (!this.hasRotation()) {
      return {
        primary: this.sdkKey,
        fallback: null,
        source: 'sdk',
      };
    }

    let useUserFirst: boolean;

    switch (this.strategy) {
      case 'user-priority':
        useUserFirst = true;
        break;
      case 'sdk-priority':
        useUserFirst = false;
        break;
      default:
        // Stateless round-robin based on timestamp
        // Distributes load ~50/50 without persistent state
        useUserFirst = Date.now() % 2 === 0;
        break;
    }

    // userKey is guaranteed to be non-null here because hasRotation() returned true
    const userKey = this.userKey as string;

    if (useUserFirst) {
      return {
        primary: userKey,
        fallback: this.sdkKey,
        source: 'user',
      };
    } else {
      return {
        primary: this.sdkKey,
        fallback: userKey,
        source: 'sdk',
      };
    }
  }

  /**
   * Get the primary key based on current strategy
   */
  selectKey(): string {
    return this.selectKeys().primary;
  }

  /**
   * Get the fallback key (null if rotation not available)
   */
  getFallbackKey(): string | null {
    return this.selectKeys().fallback;
  }

  /**
   * Execute a function with automatic retry using fallback key
   * @param fn - Function that takes an API key and returns a promise
   * @returns Result of the function
   * @throws Last error if both keys fail
   */
  async executeWithRetry<T>(fn: (apiKey: string) => Promise<T>): Promise<T> {
    const { primary, fallback, source } = this.selectKeys();

    try {
      return await fn(primary);
    } catch (primaryError) {
      // If no fallback or error is not retryable, throw immediately
      if (!fallback || !isGraphRetryableError(primaryError)) {
        throw primaryError;
      }

      // Log retry attempt
      console.info(
        `[GraphKeyManager] Primary key (${source}) failed, retrying with fallback: ${
          primaryError instanceof Error ? primaryError.message : 'Unknown error'
        }`
      );

      try {
        return await fn(fallback);
      } catch (fallbackError) {
        // Log fallback failure
        console.error(
          `[GraphKeyManager] Fallback key also failed: ${
            fallbackError instanceof Error ? fallbackError.message : 'Unknown error'
          }`
        );
        // Throw the original error (more informative)
        throw primaryError;
      }
    }
  }
}

/**
 * Create a GraphKeyManager instance
 * @param config - Configuration object
 * @returns GraphKeyManager instance
 */
export function createGraphKeyManager(config: GraphKeyManagerConfig): GraphKeyManager {
  return new GraphKeyManager(config);
}
