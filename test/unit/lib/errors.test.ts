/**
 * Error handling tests
 * @module test/unit/lib/errors
 */

import { AppError, createErrorResponse, errors, handleError } from '@/lib/utils/errors';
import { Hono } from 'hono';
import { describe, expect, it, vi } from 'vitest';

describe('AppError', () => {
  it('creates error with correct properties', () => {
    const error = new AppError('NOT_FOUND', 404, 'Resource not found');
    expect(error.code).toBe('NOT_FOUND');
    expect(error.status).toBe(404);
    expect(error.message).toBe('Resource not found');
    expect(error.name).toBe('AppError');
  });
});

describe('createErrorResponse', () => {
  it('creates error response object', () => {
    const response = createErrorResponse('NOT_FOUND', 'Resource not found', 'req-123');
    expect(response.success).toBe(false);
    expect(response.error).toBe('Resource not found');
    expect(response.code).toBe('NOT_FOUND');
    expect(response.requestId).toBe('req-123');
    expect(response.timestamp).toBeDefined();
  });
});

describe('errors helpers', () => {
  it('notFound returns 404', async () => {
    const app = new Hono();
    app.get('/test', (c) => errors.notFound(c, 'Agent'));

    const res = await app.request('/test');
    expect(res.status).toBe(404);

    const body = await res.json();
    expect(body.code).toBe('NOT_FOUND');
    expect(body.error).toBe('Agent not found');
  });

  it('badRequest returns 400', async () => {
    const app = new Hono();
    app.get('/test', (c) => errors.badRequest(c, 'Invalid input'));

    const res = await app.request('/test');
    expect(res.status).toBe(400);

    const body = await res.json();
    expect(body.code).toBe('BAD_REQUEST');
  });

  it('validationError returns 400', async () => {
    const app = new Hono();
    app.get('/test', (c) => errors.validationError(c, 'Field required'));

    const res = await app.request('/test');
    expect(res.status).toBe(400);

    const body = await res.json();
    expect(body.code).toBe('VALIDATION_ERROR');
  });

  it('rateLimitExceeded returns 429', async () => {
    const app = new Hono();
    app.get('/test', (c) => errors.rateLimitExceeded(c));

    const res = await app.request('/test');
    expect(res.status).toBe(429);

    const body = await res.json();
    expect(body.code).toBe('RATE_LIMIT_EXCEEDED');
  });

  it('internalError returns 500', async () => {
    const app = new Hono();
    app.get('/test', (c) => errors.internalError(c));

    const res = await app.request('/test');
    expect(res.status).toBe(500);

    const body = await res.json();
    expect(body.code).toBe('INTERNAL_ERROR');
  });

  it('serviceUnavailable returns 503', async () => {
    const app = new Hono();
    app.get('/test', (c) => errors.serviceUnavailable(c, 'Search'));

    const res = await app.request('/test');
    expect(res.status).toBe(503);

    const body = await res.json();
    expect(body.code).toBe('SERVICE_UNAVAILABLE');
  });
});

describe('handleError', () => {
  it('handles AppError', async () => {
    const app = new Hono();
    app.onError(handleError);
    app.get('/test', () => {
      throw new AppError('NOT_FOUND', 404, 'Not found');
    });

    const res = await app.request('/test');
    expect(res.status).toBe(404);

    const body = await res.json();
    expect(body.code).toBe('NOT_FOUND');
  });

  it('handles ZodError', async () => {
    const app = new Hono();
    app.onError(handleError);
    app.get('/test', () => {
      const error = new Error('Validation failed');
      error.name = 'ZodError';
      (error as { errors?: Array<{ message: string }> }).errors = [{ message: 'Field required' }];
      throw error;
    });

    const res = await app.request('/test');
    expect(res.status).toBe(400);

    const body = await res.json();
    expect(body.code).toBe('VALIDATION_ERROR');
  });

  it('handles unknown errors', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const app = new Hono();
    app.onError(handleError);
    app.get('/test', () => {
      throw new Error('Unknown error');
    });

    const res = await app.request('/test');
    expect(res.status).toBe(500);

    const body = await res.json();
    expect(body.code).toBe('INTERNAL_ERROR');

    consoleSpy.mockRestore();
  });
});
