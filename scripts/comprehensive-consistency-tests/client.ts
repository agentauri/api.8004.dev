/**
 * API Client for Comprehensive Consistency Tests
 * Calls both our API and external services (SDK, Search Service) for comparison
 */

import type { Agent, ApiResponse } from './types';

// Configuration
const API_BASE = process.env.API_BASE_URL || 'https://api.8004.dev/api/v1';
const API_KEY = process.env.API_KEY || '';
const REQUEST_DELAY = 300; // ms between requests to avoid rate limiting
const MAX_RETRIES = 3;
const RETRY_DELAY = 1000;

let lastRequestTime = 0;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function rateLimitedFetch(
  url: string,
  options: RequestInit = {}
): Promise<Response> {
  // Rate limiting
  const now = Date.now();
  const timeSinceLastRequest = now - lastRequestTime;
  if (timeSinceLastRequest < REQUEST_DELAY) {
    await sleep(REQUEST_DELAY - timeSinceLastRequest);
  }
  lastRequestTime = Date.now();

  // Retry logic
  let lastError: Error | null = null;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const response = await fetch(url, options);
      if (response.status === 429 && attempt < MAX_RETRIES) {
        console.log(`Rate limited, waiting ${RETRY_DELAY * (attempt + 1)}ms...`);
        await sleep(RETRY_DELAY * (attempt + 1));
        continue;
      }
      return response;
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
 * Call our API (GET /api/v1/agents)
 */
export async function callOurApiGet(
  params: Record<string, string | number | boolean | undefined>
): Promise<{ response: Response; data: ApiResponse<Agent[]>; duration: number }> {
  const searchParams = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null) {
      searchParams.append(key, String(value));
    }
  }

  const url = `${API_BASE}/agents?${searchParams.toString()}`;
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (API_KEY) {
    headers['X-API-Key'] = API_KEY;
  }

  const start = Date.now();
  const response = await rateLimitedFetch(url, { method: 'GET', headers });
  const duration = Date.now() - start;
  const data = (await response.json()) as ApiResponse<Agent[]>;

  return { response, data, duration };
}

/**
 * Call our API (POST /api/v1/search)
 */
export async function callOurApiSearch(
  body: Record<string, unknown>
): Promise<{ response: Response; data: ApiResponse<Agent[]>; duration: number }> {
  const url = `${API_BASE}/search`;
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (API_KEY) {
    headers['X-API-Key'] = API_KEY;
  }

  const start = Date.now();
  const response = await rateLimitedFetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
  const duration = Date.now() - start;
  const data = (await response.json()) as ApiResponse<Agent[]>;

  return { response, data, duration };
}

/**
 * Call our API with GET q= parameter (uses agents endpoint with search)
 */
export async function callOurApiWithQuery(
  query: string,
  params: Record<string, string | number | boolean | undefined> = {}
): Promise<{ response: Response; data: ApiResponse<Agent[]>; duration: number }> {
  return callOurApiGet({ q: query, ...params });
}

/**
 * Get single agent by ID
 */
export async function getAgentById(
  agentId: string
): Promise<{ response: Response; data: ApiResponse<Agent>; duration: number }> {
  const url = `${API_BASE}/agents/${agentId}`;
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (API_KEY) {
    headers['X-API-Key'] = API_KEY;
  }

  const start = Date.now();
  const response = await rateLimitedFetch(url, { method: 'GET', headers });
  const duration = Date.now() - start;
  const data = (await response.json()) as ApiResponse<Agent>;

  return { response, data, duration };
}

/**
 * Paginate through all results using cursor
 */
export async function paginateAllWithCursor(
  params: Record<string, string | number | boolean | undefined>,
  maxPages: number = 10
): Promise<{ agents: Agent[]; pages: number; totalFromMeta?: number }> {
  const allAgents: Agent[] = [];
  let cursor: string | undefined;
  let pages = 0;
  let totalFromMeta: number | undefined;

  while (pages < maxPages) {
    const { data } = await callOurApiGet({ ...params, cursor });
    if (!data.success || !data.data) break;

    allAgents.push(...data.data);
    pages++;
    if (pages === 1) {
      totalFromMeta = data.meta?.total;
    }

    if (!data.meta?.hasMore || !data.meta?.nextCursor) break;
    cursor = data.meta.nextCursor;
  }

  return { agents: allAgents, pages, totalFromMeta };
}

/**
 * Paginate through all results using offset
 */
export async function paginateAllWithOffset(
  params: Record<string, string | number | boolean | undefined>,
  maxPages: number = 10
): Promise<{ agents: Agent[]; pages: number; totalFromMeta?: number }> {
  const allAgents: Agent[] = [];
  const limit = Number(params.limit) || 20;
  let offset = 0;
  let pages = 0;
  let totalFromMeta: number | undefined;

  while (pages < maxPages) {
    const { data } = await callOurApiGet({ ...params, offset, limit });
    if (!data.success || !data.data || data.data.length === 0) break;

    allAgents.push(...data.data);
    pages++;
    if (pages === 1) {
      totalFromMeta = data.meta?.total;
    }

    if (!data.meta?.hasMore) break;
    offset += limit;
  }

  return { agents: allAgents, pages, totalFromMeta };
}

/**
 * Paginate through all results using page number
 */
export async function paginateAllWithPage(
  params: Record<string, string | number | boolean | undefined>,
  maxPages: number = 10
): Promise<{ agents: Agent[]; pages: number; totalFromMeta?: number }> {
  const allAgents: Agent[] = [];
  let page = 1;
  let pages = 0;
  let totalFromMeta: number | undefined;

  while (pages < maxPages) {
    const { data } = await callOurApiGet({ ...params, page });
    if (!data.success || !data.data || data.data.length === 0) break;

    allAgents.push(...data.data);
    pages++;
    if (pages === 1) {
      totalFromMeta = data.meta?.total;
    }

    if (!data.meta?.hasMore) break;
    page++;
  }

  return { agents: allAgents, pages, totalFromMeta };
}

/**
 * Check if API is available
 */
export async function healthCheck(): Promise<boolean> {
  try {
    const response = await rateLimitedFetch(`${API_BASE}/health`);
    const data = await response.json() as { status?: string; success?: boolean };
    return data.status === 'ok' || data.success === true;
  } catch {
    return false;
  }
}

export function hasApiKey(): boolean {
  return Boolean(API_KEY);
}

export function getApiBaseUrl(): string {
  return API_BASE;
}
