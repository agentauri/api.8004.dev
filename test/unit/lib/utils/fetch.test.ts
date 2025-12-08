/**
 * Fetch utilities tests
 * @module test/unit/lib/utils/fetch
 */

import { DEFAULT_TIMEOUT_MS, FetchTimeoutError, fetchWithTimeout } from '@/lib/utils/fetch';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Mock fetch
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

describe('fetchWithTimeout', () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  it('returns response on successful fetch', async () => {
    const mockResponse = new Response('OK', { status: 200 });
    mockFetch.mockResolvedValue(mockResponse);

    const response = await fetchWithTimeout('https://example.com/api');

    expect(response.status).toBe(200);
    expect(mockFetch).toHaveBeenCalledWith('https://example.com/api', expect.any(Object));
  });

  it('passes options to fetch', async () => {
    const mockResponse = new Response('OK', { status: 200 });
    mockFetch.mockResolvedValue(mockResponse);

    const options = {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ test: true }),
    };

    await fetchWithTimeout('https://example.com/api', options);

    expect(mockFetch).toHaveBeenCalledWith(
      'https://example.com/api',
      expect.objectContaining({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ test: true }),
      })
    );
  });

  it('includes AbortSignal in fetch options', async () => {
    const mockResponse = new Response('OK', { status: 200 });
    mockFetch.mockResolvedValue(mockResponse);

    await fetchWithTimeout('https://example.com/api');

    expect(mockFetch).toHaveBeenCalledWith(
      'https://example.com/api',
      expect.objectContaining({
        signal: expect.any(AbortSignal),
      })
    );
  });

  it('has default timeout of 10 seconds', () => {
    expect(DEFAULT_TIMEOUT_MS).toBe(10000);
  });

  it('throws FetchTimeoutError when fetch is aborted', async () => {
    // Mock fetch to throw AbortError
    const abortError = new Error('The operation was aborted');
    abortError.name = 'AbortError';
    mockFetch.mockRejectedValue(abortError);

    await expect(fetchWithTimeout('https://example.com/api', {}, 100)).rejects.toThrow(
      FetchTimeoutError
    );
  });

  it('propagates non-abort fetch errors', async () => {
    mockFetch.mockRejectedValue(new Error('Network error'));

    await expect(fetchWithTimeout('https://example.com/api')).rejects.toThrow('Network error');
  });
});

describe('FetchTimeoutError', () => {
  it('has correct name', () => {
    const error = new FetchTimeoutError('https://example.com', 1000);
    expect(error.name).toBe('FetchTimeoutError');
  });

  it('has descriptive message', () => {
    const error = new FetchTimeoutError('https://example.com', 1000);
    expect(error.message).toBe('Request to https://example.com timed out after 1000ms');
  });

  it('is instance of Error', () => {
    const error = new FetchTimeoutError('https://example.com', 1000);
    expect(error).toBeInstanceOf(Error);
  });
});
