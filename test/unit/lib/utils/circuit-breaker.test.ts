/**
 * Circuit Breaker tests
 * @module test/unit/lib/utils/circuit-breaker
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  CircuitBreaker,
  CircuitOpenError,
  circuitBreakers,
  getAllCircuitStatus,
} from '@/lib/utils/circuit-breaker';

describe('CircuitBreaker', () => {
  describe('basic functionality', () => {
    it('starts in closed state', () => {
      const breaker = new CircuitBreaker('test', {
        failureThreshold: 3,
        recoveryTimeout: 1000,
        halfOpenRequests: 1,
      });

      const status = breaker.getStatus();
      expect(status.state).toBe('closed');
      expect(status.failures).toBe(0);
    });

    it('executes function successfully in closed state', async () => {
      const breaker = new CircuitBreaker('test', {
        failureThreshold: 3,
        recoveryTimeout: 1000,
        halfOpenRequests: 1,
      });

      const result = await breaker.execute(() => Promise.resolve('success'));
      expect(result).toBe('success');
    });

    it('resets failure count on success', async () => {
      const breaker = new CircuitBreaker('test', {
        failureThreshold: 3,
        recoveryTimeout: 1000,
        halfOpenRequests: 1,
      });

      // Cause 2 failures
      await expect(breaker.execute(() => Promise.reject(new Error('fail 1')))).rejects.toThrow();
      await expect(breaker.execute(() => Promise.reject(new Error('fail 2')))).rejects.toThrow();

      expect(breaker.getStatus().failures).toBe(2);

      // Success should reset count
      await breaker.execute(() => Promise.resolve('success'));
      expect(breaker.getStatus().failures).toBe(0);
    });
  });

  describe('circuit opening', () => {
    it('opens circuit after reaching failure threshold', async () => {
      const breaker = new CircuitBreaker('test', {
        failureThreshold: 3,
        recoveryTimeout: 1000,
        halfOpenRequests: 1,
      });

      // Cause 3 failures to reach threshold
      for (let i = 0; i < 3; i++) {
        await expect(
          breaker.execute(() => Promise.reject(new Error(`fail ${i}`)))
        ).rejects.toThrow();
      }

      expect(breaker.getStatus().state).toBe('open');
    });

    it('throws CircuitOpenError when circuit is open', async () => {
      const breaker = new CircuitBreaker('test', {
        failureThreshold: 1,
        recoveryTimeout: 10000, // Long timeout so it stays open
        halfOpenRequests: 1,
      });

      // Open the circuit
      await expect(breaker.execute(() => Promise.reject(new Error('fail')))).rejects.toThrow();
      expect(breaker.getStatus().state).toBe('open');

      // Next call should throw CircuitOpenError
      await expect(breaker.execute(() => Promise.resolve('success'))).rejects.toThrow(
        CircuitOpenError
      );
    });

    it('CircuitOpenError includes circuit name', async () => {
      const breaker = new CircuitBreaker('my-test-circuit', {
        failureThreshold: 1,
        recoveryTimeout: 10000,
        halfOpenRequests: 1,
      });

      await expect(breaker.execute(() => Promise.reject(new Error('fail')))).rejects.toThrow();

      try {
        await breaker.execute(() => Promise.resolve('success'));
      } catch (error) {
        expect(error).toBeInstanceOf(CircuitOpenError);
        expect((error as CircuitOpenError).circuitName).toBe('my-test-circuit');
      }
    });
  });

  describe('circuit recovery', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('transitions to half-open after recovery timeout', async () => {
      const breaker = new CircuitBreaker('test', {
        failureThreshold: 1,
        recoveryTimeout: 1000,
        halfOpenRequests: 1,
      });

      // Open the circuit
      await expect(breaker.execute(() => Promise.reject(new Error('fail')))).rejects.toThrow();
      expect(breaker.getStatus().state).toBe('open');

      // Advance time past recovery timeout
      vi.advanceTimersByTime(1100);

      // Next call should transition to half-open and execute
      const result = await breaker.execute(() => Promise.resolve('recovered'));
      expect(result).toBe('recovered');
      expect(breaker.getStatus().state).toBe('closed');
    });

    it('re-opens circuit on failure in half-open state', async () => {
      const breaker = new CircuitBreaker('test', {
        failureThreshold: 1,
        recoveryTimeout: 1000,
        halfOpenRequests: 2,
      });

      // Open the circuit
      await expect(breaker.execute(() => Promise.reject(new Error('fail')))).rejects.toThrow();
      expect(breaker.getStatus().state).toBe('open');

      // Advance time past recovery timeout
      vi.advanceTimersByTime(1100);

      // First call in half-open succeeds
      await breaker.execute(() => Promise.resolve('ok'));
      expect(breaker.getStatus().state).toBe('half-open');

      // Second call fails - should re-open
      await expect(
        breaker.execute(() => Promise.reject(new Error('fail again')))
      ).rejects.toThrow();
      expect(breaker.getStatus().state).toBe('open');
    });

    it('closes circuit after enough successes in half-open', async () => {
      const breaker = new CircuitBreaker('test', {
        failureThreshold: 1,
        recoveryTimeout: 1000,
        halfOpenRequests: 2,
      });

      // Open the circuit
      await expect(breaker.execute(() => Promise.reject(new Error('fail')))).rejects.toThrow();
      expect(breaker.getStatus().state).toBe('open');

      // Advance time past recovery timeout
      vi.advanceTimersByTime(1100);

      // Two successful calls in half-open
      await breaker.execute(() => Promise.resolve('ok1'));
      expect(breaker.getStatus().state).toBe('half-open');

      await breaker.execute(() => Promise.resolve('ok2'));
      expect(breaker.getStatus().state).toBe('closed');
    });
  });

  describe('executeWithFallback', () => {
    it('uses fallback when circuit is open', async () => {
      const breaker = new CircuitBreaker('test', {
        failureThreshold: 1,
        recoveryTimeout: 10000,
        halfOpenRequests: 1,
      });

      // Open the circuit
      await expect(breaker.execute(() => Promise.reject(new Error('fail')))).rejects.toThrow();

      // Execute with fallback
      const result = await breaker.executeWithFallback(
        () => Promise.resolve('primary'),
        () => Promise.resolve('fallback')
      );

      expect(result).toBe('fallback');
    });

    it('rethrows non-circuit errors', async () => {
      const breaker = new CircuitBreaker('test', {
        failureThreshold: 5,
        recoveryTimeout: 1000,
        halfOpenRequests: 1,
      });

      await expect(
        breaker.executeWithFallback(
          () => Promise.reject(new Error('custom error')),
          () => Promise.resolve('fallback')
        )
      ).rejects.toThrow('custom error');
    });
  });

  describe('utility methods', () => {
    it('isAllowed returns false when circuit is open', async () => {
      const breaker = new CircuitBreaker('test', {
        failureThreshold: 1,
        recoveryTimeout: 10000,
        halfOpenRequests: 1,
      });

      expect(breaker.isAllowed()).toBe(true);

      // Open the circuit
      await expect(breaker.execute(() => Promise.reject(new Error('fail')))).rejects.toThrow();

      expect(breaker.isAllowed()).toBe(false);
    });

    it('reset manually closes the circuit', async () => {
      const breaker = new CircuitBreaker('test', {
        failureThreshold: 1,
        recoveryTimeout: 10000,
        halfOpenRequests: 1,
      });

      // Open the circuit
      await expect(breaker.execute(() => Promise.reject(new Error('fail')))).rejects.toThrow();
      expect(breaker.getStatus().state).toBe('open');

      // Manual reset
      breaker.reset();
      expect(breaker.getStatus().state).toBe('closed');
      expect(breaker.getStatus().failures).toBe(0);
    });
  });
});

describe('Pre-configured circuit breakers', () => {
  it('has qdrant circuit breaker', () => {
    expect(circuitBreakers.qdrant).toBeInstanceOf(CircuitBreaker);
  });

  it('has embedding circuit breaker', () => {
    expect(circuitBreakers.embedding).toBeInstanceOf(CircuitBreaker);
  });

  it('has theGraph circuit breaker', () => {
    expect(circuitBreakers.theGraph).toBeInstanceOf(CircuitBreaker);
  });

  it('has classifier circuit breaker', () => {
    expect(circuitBreakers.classifier).toBeInstanceOf(CircuitBreaker);
  });
});

describe('getAllCircuitStatus', () => {
  it('returns status for all circuit breakers', () => {
    const status = getAllCircuitStatus();

    expect(status).toHaveProperty('qdrant');
    expect(status).toHaveProperty('embedding');
    expect(status).toHaveProperty('theGraph');
    expect(status).toHaveProperty('classifier');

    // Each should have required fields
    for (const name of Object.keys(status)) {
      expect(status[name]).toHaveProperty('state');
      expect(status[name]).toHaveProperty('failures');
      expect(status[name]).toHaveProperty('lastFailure');
    }
  });
});
