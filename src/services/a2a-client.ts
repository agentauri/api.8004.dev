/**
 * A2A AgentCard Client
 *
 * Fetches A2A AgentCards from agent endpoints to extract:
 * - inputModes: Supported input MIME types
 * - outputModes: Supported output MIME types
 * - skills: A2A skill definitions
 *
 * @see https://a2a-protocol.org/latest/specification/
 * @module services/a2a-client
 */

import { fetchWithTimeout } from '../lib/utils/fetch';

/**
 * A2A Skill from AgentCard
 */
export interface A2ASkill {
  /** Unique skill identifier */
  id: string;
  /** Human-readable skill name */
  name: string;
  /** Skill description */
  description?: string;
  /** Supported input MIME types for this skill */
  inputModes?: string[];
  /** Supported output MIME types for this skill */
  outputModes?: string[];
  /** Skill tags/keywords */
  tags?: string[];
  /** Example prompts */
  examples?: string[];
}

/**
 * A2A AgentCard structure
 * @see https://a2a-protocol.org/latest/specification/
 */
export interface A2AAgentCard {
  /** Agent name */
  name?: string;
  /** Agent description */
  description?: string;
  /** Agent URL */
  url?: string;
  /** Agent version */
  version?: string;
  /** Default input modes for all skills */
  defaultInputModes?: string[];
  /** Default output modes for all skills */
  defaultOutputModes?: string[];
  /** Agent skills/capabilities */
  skills?: A2ASkill[];
  /** Capabilities object (alternative structure) */
  capabilities?: {
    streaming?: boolean;
    pushNotifications?: boolean;
    stateTransitionHistory?: boolean;
  };
}

/**
 * Extracted IO modes from AgentCard
 */
export interface ExtractedIOModes {
  /** All unique input modes across skills */
  inputModes: string[];
  /** All unique output modes across skills */
  outputModes: string[];
  /** Skill names extracted */
  skillNames: string[];
  /** Whether fetch was successful */
  success: boolean;
  /** Error message if failed */
  error?: string;
}

/**
 * A2A Client configuration
 */
export interface A2AClientConfig {
  /** Request timeout in ms (default: 5000) */
  timeoutMs?: number;
  /** User agent string */
  userAgent?: string;
}

/**
 * Default timeout for A2A fetches (5 seconds)
 */
const DEFAULT_A2A_TIMEOUT_MS = 5_000;

/**
 * Blocked hostnames to prevent SSRF
 */
const BLOCKED_HOSTNAMES = [
  'localhost',
  '127.0.0.1',
  '0.0.0.0',
  '169.254.169.254',
  'metadata.google.internal',
  '100.100.100.200',
];

/**
 * Check if hostname is blocked (security)
 */
function isBlockedHostname(hostname: string): boolean {
  const lower = hostname.toLowerCase();

  if (BLOCKED_HOSTNAMES.includes(lower)) {
    return true;
  }

  // Block private IP ranges
  if (
    /^10\./.test(hostname) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(hostname) ||
    /^192\.168\./.test(hostname)
  ) {
    return true;
  }

  // Block .local and .internal domains
  if (lower.endsWith('.local') || lower.endsWith('.internal')) {
    return true;
  }

  return false;
}

/**
 * Validate A2A endpoint URL
 */
function isValidA2AEndpoint(url: string): boolean {
  try {
    const parsed = new URL(url);

    // Only allow HTTPS
    if (parsed.protocol !== 'https:') {
      return false;
    }

    // Check blocked hostnames
    if (isBlockedHostname(parsed.hostname)) {
      return false;
    }

    return true;
  } catch {
    return false;
  }
}

/**
 * Normalize A2A endpoint URL
 * Handles various formats:
 * - https://agent.example/.well-known/agent.json
 * - https://agent.example/.well-known/agent-card.json
 * - https://agent.example (will try common paths)
 */
function normalizeA2AEndpoint(endpoint: string): string[] {
  if (!endpoint) return [];

  // If it's already a full path to agent card, return as-is
  if (endpoint.includes('.well-known/agent')) {
    return isValidA2AEndpoint(endpoint) ? [endpoint] : [];
  }

  // Try common A2A paths
  const baseUrl = endpoint.endsWith('/') ? endpoint.slice(0, -1) : endpoint;
  const paths = [`${baseUrl}/.well-known/agent.json`, `${baseUrl}/.well-known/agent-card.json`];

  return paths.filter(isValidA2AEndpoint);
}

/**
 * Parse A2A AgentCard response
 */
function parseAgentCard(data: unknown): A2AAgentCard | null {
  if (!data || typeof data !== 'object') {
    return null;
  }

  const obj = data as Record<string, unknown>;

  // Basic validation - should have at least name or skills
  if (!obj.name && !obj.skills) {
    return null;
  }

  return {
    name: typeof obj.name === 'string' ? obj.name : undefined,
    description: typeof obj.description === 'string' ? obj.description : undefined,
    url: typeof obj.url === 'string' ? obj.url : undefined,
    version: typeof obj.version === 'string' ? obj.version : undefined,
    defaultInputModes: Array.isArray(obj.defaultInputModes)
      ? obj.defaultInputModes.filter((m): m is string => typeof m === 'string')
      : undefined,
    defaultOutputModes: Array.isArray(obj.defaultOutputModes)
      ? obj.defaultOutputModes.filter((m): m is string => typeof m === 'string')
      : undefined,
    skills: Array.isArray(obj.skills)
      ? obj.skills
          .filter((s): s is Record<string, unknown> => s && typeof s === 'object')
          .map((s) => ({
            id: typeof s.id === 'string' ? s.id : '',
            name: typeof s.name === 'string' ? s.name : '',
            description: typeof s.description === 'string' ? s.description : undefined,
            inputModes: Array.isArray(s.inputModes)
              ? s.inputModes.filter((m): m is string => typeof m === 'string')
              : undefined,
            outputModes: Array.isArray(s.outputModes)
              ? s.outputModes.filter((m): m is string => typeof m === 'string')
              : undefined,
            tags: Array.isArray(s.tags)
              ? s.tags.filter((t): t is string => typeof t === 'string')
              : undefined,
            examples: Array.isArray(s.examples)
              ? s.examples.filter((e): e is string => typeof e === 'string')
              : undefined,
          }))
      : undefined,
    capabilities:
      obj.capabilities && typeof obj.capabilities === 'object'
        ? (obj.capabilities as A2AAgentCard['capabilities'])
        : undefined,
  };
}

/**
 * Extract IO modes from AgentCard
 */
// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: IO mode extraction iterates over multiple nested arrays
function extractIOModes(card: A2AAgentCard): ExtractedIOModes {
  const inputModes = new Set<string>();
  const outputModes = new Set<string>();
  const skillNames: string[] = [];

  // Add default modes
  if (card.defaultInputModes) {
    for (const mode of card.defaultInputModes) {
      inputModes.add(mode);
    }
  }
  if (card.defaultOutputModes) {
    for (const mode of card.defaultOutputModes) {
      outputModes.add(mode);
    }
  }

  // Extract from skills
  if (card.skills) {
    for (const skill of card.skills) {
      // Collect skill names
      if (skill.name) {
        skillNames.push(skill.name);
      } else if (skill.id) {
        skillNames.push(skill.id);
      }

      // Collect input modes
      if (skill.inputModes) {
        for (const mode of skill.inputModes) {
          inputModes.add(mode);
        }
      }

      // Collect output modes
      if (skill.outputModes) {
        for (const mode of skill.outputModes) {
          outputModes.add(mode);
        }
      }
    }
  }

  return {
    inputModes: [...inputModes].sort(),
    outputModes: [...outputModes].sort(),
    skillNames,
    success: true,
  };
}

/**
 * A2A Client for fetching AgentCards
 */
export interface A2AClient {
  /**
   * Fetch AgentCard and extract IO modes
   * @param a2aEndpoint - The A2A endpoint URL from registration file
   * @param agentId - Agent ID for logging
   * @returns Extracted IO modes or empty result on failure
   */
  fetchIOModes(a2aEndpoint: string, agentId: string): Promise<ExtractedIOModes>;

  /**
   * Fetch full AgentCard
   * @param a2aEndpoint - The A2A endpoint URL
   * @returns AgentCard or null on failure
   */
  fetchAgentCard(a2aEndpoint: string): Promise<A2AAgentCard | null>;
}

/**
 * Create A2A client instance
 */
export function createA2AClient(config: A2AClientConfig = {}): A2AClient {
  const timeoutMs = config.timeoutMs ?? DEFAULT_A2A_TIMEOUT_MS;
  const userAgent = config.userAgent ?? '8004-backend/1.0';

  return {
    // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: A2A fetch handles multiple URL attempts and error cases
    async fetchIOModes(a2aEndpoint: string, agentId: string): Promise<ExtractedIOModes> {
      const emptyResult: ExtractedIOModes = {
        inputModes: [],
        outputModes: [],
        skillNames: [],
        success: false,
      };

      if (!a2aEndpoint) {
        return { ...emptyResult, error: 'No A2A endpoint provided' };
      }

      const urls = normalizeA2AEndpoint(a2aEndpoint);
      if (urls.length === 0) {
        return { ...emptyResult, error: 'Invalid or blocked A2A endpoint' };
      }

      // Try each possible URL
      for (const url of urls) {
        try {
          const response = await fetchWithTimeout(
            url,
            {
              headers: {
                Accept: 'application/json',
                'User-Agent': userAgent,
              },
            },
            timeoutMs
          );

          if (!response.ok) {
            continue; // Try next URL
          }

          const data = await response.json();
          const card = parseAgentCard(data);

          if (card) {
            const result = extractIOModes(card);
            if (result.inputModes.length > 0 || result.outputModes.length > 0) {
              return result;
            }
          }
        } catch (error) {
          // Log but continue to try other URLs
          console.warn(
            `A2A fetch failed for ${agentId} at ${url}:`,
            error instanceof Error ? error.message : error
          );
        }
      }

      return { ...emptyResult, error: 'Failed to fetch from all A2A endpoints' };
    },

    async fetchAgentCard(a2aEndpoint: string): Promise<A2AAgentCard | null> {
      const urls = normalizeA2AEndpoint(a2aEndpoint);

      for (const url of urls) {
        try {
          const response = await fetchWithTimeout(
            url,
            {
              headers: {
                Accept: 'application/json',
                'User-Agent': userAgent,
              },
            },
            timeoutMs
          );

          if (!response.ok) continue;

          const data = await response.json();
          const card = parseAgentCard(data);
          if (card) return card;
        } catch {
          // Try next URL
        }
      }

      return null;
    },
  };
}
