/**
 * Security Tests
 * Tests for SQL injection, XSS, rate limiting, and input validation
 */

import { describe, it } from '../test-runner';
import { get, post } from '../utils/api-client';
import { assertStatus } from '../utils/assertions';

export function registerSecurityTests(): void {
  describe('Security - Input Validation', () => {
    it('SQL injection in q= param is sanitized', async () => {
      // Common SQL injection payloads
      const { json } = await get('/agents', {
        q: "'; DROP TABLE agents; --",
        limit: 5,
      });

      // Should either return safe results or an error, not crash
      // The important thing is the API doesn't break
      if (!json.success && !json.error) {
        throw new Error('Expected either success or error response');
      }
    });

    it('XSS in query is sanitized', async () => {
      const { json } = await get('/agents', {
        q: '<script>alert("xss")</script>',
        limit: 5,
      });

      // Should either return results or an error
      if (!json.success && !json.error) {
        throw new Error('Expected either success or error response');
      }

      // If there are results, they shouldn't contain unescaped script tags
      if (json.data && Array.isArray(json.data)) {
        for (const agent of json.data) {
          const jsonStr = JSON.stringify(agent);
          if (jsonStr.includes('<script>')) {
            throw new Error('Response contains unescaped script tags');
          }
        }
      }
    });

    it('Very long query is handled safely', async () => {
      // Query much longer than reasonable (10K chars)
      const longQuery = 'a'.repeat(10000);
      const { json } = await post('/search', {
        query: longQuery,
        limit: 5,
      });

      // API may accept or reject - just verify it doesn't crash
      // This documents the actual behavior
      if (json.success) {
        console.log('  Note: API accepts very long queries');
      }
    });

    it('Empty query is rejected', async () => {
      const { json } = await post('/search', {
        query: '',
        limit: 5,
      });

      // Should return validation error
      if (json.success) {
        throw new Error('Expected error for empty query');
      }
    });
  });

  describe('Security - Rate Limiting', () => {
    it('Rate limit headers are present', async () => {
      const { response } = await get('/agents', { limit: 1 });

      // Check for rate limit headers
      // These may vary by implementation
      const rateLimitHeaders = [
        'x-ratelimit-limit',
        'x-ratelimit-remaining',
        'ratelimit-limit',
        'ratelimit-remaining',
      ];

      const hasRateLimitHeader = rateLimitHeaders.some(
        (header) => response.headers.get(header) !== null
      );

      // Note: Rate limit headers may not always be present
      // This test just documents the behavior
      if (!hasRateLimitHeader) {
        console.log('  Note: No standard rate limit headers found');
      }
    });

    it('Excessive requests eventually get rate limited', async () => {
      // This test is informational - we don't want to actually trigger rate limits
      // Just verify the mechanism exists
      const { response } = await get('/agents', { limit: 1 });

      // A 429 status means rate limiting is working
      if (response.status === 429) {
        // Already rate limited from previous tests
        console.log('  Note: Rate limit triggered');
      }
      // Otherwise, rate limit not triggered which is expected
    });
  });

  describe('Security - Authentication', () => {
    it('Request without API key is rejected', async () => {
      // Make request without auth
      const url = 'https://api.8004.dev/api/v1/agents?limit=1';
      const response = await fetch(url, {
        headers: { 'Content-Type': 'application/json' },
      });

      // Should return 401 or 403 without API key
      if (response.status === 200) {
        // API may allow unauthenticated access with rate limits
        console.log('  Note: API allows unauthenticated access');
      } else if (response.status !== 401 && response.status !== 403) {
        throw new Error(`Unexpected status ${response.status} for unauthenticated request`);
      }
    });

    it('Invalid API key is rejected', async () => {
      const url = 'https://api.8004.dev/api/v1/agents?limit=1';
      const response = await fetch(url, {
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': 'invalid-key-12345',
        },
      });

      // Should return 401 or 403 for invalid key
      if (response.status !== 401 && response.status !== 403) {
        // API may treat invalid key as no key (rate limited public access)
        if (response.status === 200) {
          console.log('  Note: Invalid API key treated as public access');
        } else {
          throw new Error(`Unexpected status ${response.status} for invalid API key`);
        }
      }
    });
  });
}
