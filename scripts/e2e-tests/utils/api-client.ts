/**
 * API Client for E2E Tests
 * HTTP client with retry logic for testing the 8004.dev API
 */

// Read at request time to allow run-tests.ts to set environment variables
const getApiBase = () => process.env.API_BASE_URL || 'https://api.8004.dev/api/v1';
const getApiKey = () => process.env.API_KEY || '';
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

  const url = path.startsWith('http') ? path : `${getApiBase()}${path}`;

  const requestHeaders: Record<string, string> = {
    'Content-Type': 'application/json',
    ...headers,
  };

  if (!skipAuth && getApiKey()) {
    requestHeaders['X-API-Key'] = getApiKey();
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
  return Boolean(getApiKey());
}

/**
 * Get the API base URL
 */
export function getApiBaseUrl(): string {
  return getApiBase();
}

// ============================================================================
// Batch Request Helpers - Run multiple requests in parallel
// ============================================================================

export interface BatchRequest {
  path: string;
  params?: Record<string, string | number | boolean | undefined>;
}

export interface BatchPostRequest {
  path: string;
  body: unknown;
}

/**
 * Execute multiple GET requests in parallel
 * Useful for pagination tests and comparing different filter results
 *
 * @example
 * const [page1, page2, page3] = await batchGet([
 *   { path: '/agents', params: { page: 1, limit: 5 } },
 *   { path: '/agents', params: { page: 2, limit: 5 } },
 *   { path: '/agents', params: { page: 3, limit: 5 } },
 * ]);
 */
export async function batchGet<T = Agent[]>(
  requests: BatchRequest[]
): Promise<Array<{ response: Response; json: ApiResponse<T>; duration: number }>> {
  return Promise.all(requests.map(({ path, params }) => get<T>(path, params)));
}

/**
 * Execute multiple POST requests in parallel
 * Useful for search comparisons and filter testing
 *
 * @example
 * const [search1, search2] = await batchPost([
 *   { path: '/search', body: { query: 'AI', limit: 5 } },
 *   { path: '/search', body: { query: 'crypto', limit: 5 } },
 * ]);
 */
export async function batchPost<T = Agent[]>(
  requests: BatchPostRequest[]
): Promise<Array<{ response: Response; json: ApiResponse<T>; duration: number }>> {
  return Promise.all(requests.map(({ path, body }) => post<T>(path, body)));
}

/**
 * Execute mixed GET and POST requests in parallel
 *
 * @example
 * const results = await batchMixed([
 *   { type: 'get', path: '/agents', params: { limit: 5 } },
 *   { type: 'post', path: '/search', body: { query: 'AI' } },
 * ]);
 */
export async function batchMixed<T = Agent[]>(
  requests: Array<
    | { type: 'get'; path: string; params?: Record<string, string | number | boolean | undefined> }
    | { type: 'post'; path: string; body: unknown }
  >
): Promise<Array<{ response: Response; json: ApiResponse<T>; duration: number }>> {
  return Promise.all(
    requests.map((req) => {
      if (req.type === 'get') {
        return get<T>(req.path, req.params);
      }
      return post<T>(req.path, req.body);
    })
  );
}
