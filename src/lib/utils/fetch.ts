/**
 * Fetch utilities with timeout support
 * @module lib/utils/fetch
 */

/**
 * Default timeout for external calls (10 seconds)
 */
export const DEFAULT_TIMEOUT_MS = 10_000;

/**
 * Error class for SSRF protection
 */
export class SSRFProtectionError extends Error {
  constructor(url: string, reason: string) {
    super(`SSRF protection blocked request to ${url}: ${reason}`);
    this.name = 'SSRFProtectionError';
  }
}

/**
 * Private/internal IP ranges that should be blocked for SSRF protection
 * Covers both IPv4 and IPv6 private/reserved ranges
 */
const BLOCKED_IP_PATTERNS = [
  // IPv4 private/reserved ranges
  /^127\./, // 127.0.0.0/8 (localhost)
  /^10\./, // 10.0.0.0/8 (private)
  /^172\.(1[6-9]|2[0-9]|3[0-1])\./, // 172.16.0.0/12 (private)
  /^192\.168\./, // 192.168.0.0/16 (private)
  /^169\.254\./, // 169.254.0.0/16 (link-local)
  /^0\./, // 0.0.0.0/8
  /^224\./, // 224.0.0.0/4 (multicast)
  /^240\./, // 240.0.0.0/4 (reserved)
  // IPv6 private/reserved ranges
  /^::1$/i, // IPv6 localhost
  /^::$/i, // IPv6 zero address
  /^::ffff:/i, // IPv4-mapped IPv6 (e.g., ::ffff:127.0.0.1)
  /^fc00:/i, // IPv6 unique local (fc00::/7)
  /^fd[0-9a-f]{2}:/i, // IPv6 unique local (fd00::/8)
  /^fe80:/i, // IPv6 link-local
  /^ff[0-9a-f]{2}:/i, // IPv6 multicast (ff00::/8)
  /^\[::1\]$/i, // IPv6 localhost in bracket notation
  /^\[::ffff:/i, // IPv4-mapped IPv6 in bracket notation
  /^\[fc00:/i, // IPv6 unique local in bracket notation
  /^\[fd[0-9a-f]{2}:/i, // IPv6 unique local in bracket notation
  /^\[fe80:/i, // IPv6 link-local in bracket notation
];

/**
 * Blocked hostnames for SSRF protection
 */
const BLOCKED_HOSTNAMES = [
  'localhost',
  'localhost.localdomain',
  'metadata.google.internal',
  '169.254.169.254', // AWS/GCP metadata
  'metadata.google',
  'metadata',
];

/**
 * Validate URL for SSRF protection
 * @param url URL to validate
 * @throws SSRFProtectionError if URL is potentially dangerous
 */
export function validateUrlForSSRF(url: string): void {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new SSRFProtectionError(url, 'Invalid URL');
  }

  // Only allow HTTPS (block HTTP)
  if (parsed.protocol !== 'https:') {
    throw new SSRFProtectionError(url, 'Only HTTPS URLs are allowed');
  }

  // Block localhost and internal hostnames
  const hostname = parsed.hostname.toLowerCase();
  if (BLOCKED_HOSTNAMES.includes(hostname)) {
    throw new SSRFProtectionError(url, 'Blocked hostname');
  }

  // Block private/internal IP addresses
  for (const pattern of BLOCKED_IP_PATTERNS) {
    if (pattern.test(hostname)) {
      throw new SSRFProtectionError(url, 'Blocked IP range');
    }
  }

  // Block suspicious ports (only allow 443 for HTTPS or default)
  const port = parsed.port;
  if (port && port !== '443') {
    throw new SSRFProtectionError(url, 'Non-standard port not allowed');
  }
}

/**
 * Error class for fetch timeout
 */
export class FetchTimeoutError extends Error {
  constructor(url: string, timeoutMs: number) {
    super(`Request to ${url} timed out after ${timeoutMs}ms`);
    this.name = 'FetchTimeoutError';
  }
}

/**
 * Fetch with timeout using AbortController
 * @param url URL to fetch
 * @param options Fetch options
 * @param timeoutMs Timeout in milliseconds (default: 10000)
 * @returns Response from fetch
 * @throws FetchTimeoutError if request times out
 */
export async function fetchWithTimeout(
  url: string,
  options: RequestInit = {},
  timeoutMs: number = DEFAULT_TIMEOUT_MS
): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    });
    return response;
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new FetchTimeoutError(url, timeoutMs);
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}
