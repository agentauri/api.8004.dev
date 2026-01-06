/**
 * API Client for E2E Tests
 * HTTP client with retry logic for testing the 8004.dev API
 */

const API_BASE = process.env.API_BASE_URL || 'https://api.8004.dev/api/v1';
const API_KEY = process.env.API_KEY || '';
const MAX_RETRIES = 2;
const RETRY_DELAY = 1000;
const REQUEST_DELAY = 50; // Reduced - test-runner has its own delay

// Track last request time for rate limiting
let lastRequestTime = 0;

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  code?: string;
  meta?: {
    total?: number;
    hasMore?: boolean;
    nextCursor?: string;
    query?: string;
    byChain?: Record<string, number>;
    stats?: unknown;
    /** Search mode: 'vector' for semantic search, 'fallback' for SDK substring search */
    searchMode?: 'vector' | 'fallback';
  };
}

export interface Agent {
  id: string;
  chainId: number;
  tokenId: string;
  name: string;
  description?: string;
  image?: string;
  active?: boolean;
  hasMcp?: boolean;
  hasA2a?: boolean;
  x402Support?: boolean;
  searchScore?: number;
  /** Reasons why this agent matched the search query */
  matchReasons?: string[];
  oasf?: {
    skills?: Array<{ slug: string; confidence: number }>;
    domains?: Array<{ slug: string; confidence: number }>;
    confidence?: number;
  };
  reputationScore?: number;
  reputationCount?: number;
}

export interface FetchOptions {
  method?: 'GET' | 'POST';
  body?: unknown;
  headers?: Record<string, string>;
  skipAuth?: boolean;
}

/**
 * Sleep for a given duration
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Make an API request with retry logic
 */
export async function apiRequest<T>(
  path: string,
  options: FetchOptions = {}
): Promise<{ response: Response; json: ApiResponse<T>; duration: number }> {
  const { method = 'GET', body, headers = {}, skipAuth = false } = options;

  const url = path.startsWith('http') ? path : `${API_BASE}${path}`;

  const requestHeaders: Record<string, string> = {
    'Content-Type': 'application/json',
    ...headers,
  };

  if (!skipAuth && API_KEY) {
    requestHeaders['X-API-Key'] = API_KEY;
  }

  const fetchOptions: RequestInit = {
    method,
    headers: requestHeaders,
  };

  if (body) {
    fetchOptions.body = JSON.stringify(body);
  }

  let lastError: Error | null = null;

  // Rate limiting: ensure minimum delay between requests
  const now = Date.now();
  const timeSinceLastRequest = now - lastRequestTime;
  if (timeSinceLastRequest < REQUEST_DELAY) {
    await sleep(REQUEST_DELAY - timeSinceLastRequest);
  }
  lastRequestTime = Date.now();

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const start = Date.now();
      const response = await fetch(url, fetchOptions);
      const duration = Date.now() - start;

      const json = (await response.json()) as ApiResponse<T>;

      // If rate limited, wait and retry
      if (response.status === 429 && attempt < MAX_RETRIES) {
        await sleep(RETRY_DELAY * (attempt + 1));
        continue;
      }

      return { response, json, duration };
    } catch (error) {
      lastError = error as Error;
      if (attempt < MAX_RETRIES) {
        await sleep(RETRY_DELAY);
      }
    }
  }

  throw lastError || new Error('Request failed after retries');
}

/**
 * GET request helper
 */
export async function get<T = Agent[]>(
  path: string,
  params?: Record<string, string | number | boolean | undefined>
): Promise<{ response: Response; json: ApiResponse<T>; duration: number }> {
  let url = path;

  if (params) {
    const searchParams = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined) {
        searchParams.append(key, String(value));
      }
    }
    const queryString = searchParams.toString();
    if (queryString) {
      url = `${path}?${queryString}`;
    }
  }

  return apiRequest<T>(url, { method: 'GET' });
}

/**
 * POST request helper
 */
export async function post<T = Agent[]>(
  path: string,
  body: unknown
): Promise<{ response: Response; json: ApiResponse<T>; duration: number }> {
  return apiRequest<T>(path, { method: 'POST', body });
}

/**
 * Check if API key is configured
 */
export function hasApiKey(): boolean {
  return Boolean(API_KEY);
}

/**
 * Get the API base URL
 */
export function getApiBaseUrl(): string {
  return API_BASE;
}
