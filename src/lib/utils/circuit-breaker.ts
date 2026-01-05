/**
 * Circuit Breaker Pattern for Cloudflare Workers
 *
 * Provides resilience for external service calls by preventing
 * cascading failures when services are down or slow.
 *
 * @example
 * ```typescript
 * const result = await circuitBreakers.qdrant.execute(
 *   () => qdrantClient.search(query)
 * );
 * ```
 */

export type CircuitState = 'closed' | 'open' | 'half-open';

export interface CircuitBreakerConfig {
	/** Number of failures before opening the circuit */
	failureThreshold: number;
	/** Time in ms before attempting to close the circuit */
	recoveryTimeout: number;
	/** Number of successful requests needed in half-open state to close */
	halfOpenRequests: number;
	/** Optional name for logging */
	name?: string;
}

export class CircuitOpenError extends Error {
	constructor(
		public readonly circuitName: string,
		public readonly openedAt: number
	) {
		super(`Circuit breaker "${circuitName}" is open`);
		this.name = 'CircuitOpenError';
	}
}

export class CircuitBreaker {
	private state: CircuitState = 'closed';
	private failures = 0;
	private lastFailure = 0;
	private halfOpenSuccesses = 0;

	constructor(
		private readonly name: string,
		private readonly config: CircuitBreakerConfig
	) {}

	/**
	 * Execute a function with circuit breaker protection
	 */
	async execute<T>(fn: () => Promise<T>): Promise<T> {
		// Check if circuit should transition from open to half-open
		if (this.state === 'open') {
			const timeSinceFailure = Date.now() - this.lastFailure;
			if (timeSinceFailure >= this.config.recoveryTimeout) {
				this.state = 'half-open';
				this.halfOpenSuccesses = 0;
				console.log(`[CircuitBreaker:${this.name}] Transitioning to half-open`);
			} else {
				throw new CircuitOpenError(this.name, this.lastFailure);
			}
		}

		try {
			const result = await fn();
			this.onSuccess();
			return result;
		} catch (error) {
			this.onFailure();
			throw error;
		}
	}

	/**
	 * Execute with a fallback when circuit is open
	 */
	async executeWithFallback<T>(fn: () => Promise<T>, fallback: () => Promise<T>): Promise<T> {
		try {
			return await this.execute(fn);
		} catch (error) {
			if (error instanceof CircuitOpenError) {
				console.log(`[CircuitBreaker:${this.name}] Using fallback due to open circuit`);
				return fallback();
			}
			throw error;
		}
	}

	private onSuccess(): void {
		if (this.state === 'half-open') {
			this.halfOpenSuccesses++;
			if (this.halfOpenSuccesses >= this.config.halfOpenRequests) {
				this.state = 'closed';
				this.failures = 0;
				console.log(`[CircuitBreaker:${this.name}] Circuit closed after recovery`);
			}
		} else if (this.state === 'closed') {
			// Reset failures on success in closed state
			this.failures = 0;
		}
	}

	private onFailure(): void {
		this.failures++;
		this.lastFailure = Date.now();

		if (this.state === 'half-open') {
			// Any failure in half-open state opens the circuit again
			this.state = 'open';
			console.log(`[CircuitBreaker:${this.name}] Circuit re-opened after half-open failure`);
		} else if (this.failures >= this.config.failureThreshold) {
			this.state = 'open';
			console.log(
				`[CircuitBreaker:${this.name}] Circuit opened after ${this.failures} failures`
			);
		}
	}

	/**
	 * Get current circuit state and metrics
	 */
	getStatus(): {
		state: CircuitState;
		failures: number;
		lastFailure: number;
		halfOpenSuccesses: number;
	} {
		return {
			state: this.state,
			failures: this.failures,
			lastFailure: this.lastFailure,
			halfOpenSuccesses: this.halfOpenSuccesses,
		};
	}

	/**
	 * Manually reset the circuit breaker
	 */
	reset(): void {
		this.state = 'closed';
		this.failures = 0;
		this.lastFailure = 0;
		this.halfOpenSuccesses = 0;
		console.log(`[CircuitBreaker:${this.name}] Circuit manually reset`);
	}

	/**
	 * Check if a request would be allowed without executing
	 */
	isAllowed(): boolean {
		if (this.state === 'closed') return true;
		if (this.state === 'half-open') return true;
		// Open state - check if recovery timeout has passed
		return Date.now() - this.lastFailure >= this.config.recoveryTimeout;
	}
}

/**
 * Pre-configured circuit breakers for external services
 */
export const circuitBreakers = {
	/** Qdrant vector search - primary data source */
	qdrant: new CircuitBreaker('qdrant', {
		failureThreshold: 5,
		recoveryTimeout: 30_000, // 30 seconds
		halfOpenRequests: 2,
	}),

	/** Venice AI embeddings service */
	embedding: new CircuitBreaker('embedding', {
		failureThreshold: 3,
		recoveryTimeout: 60_000, // 60 seconds
		halfOpenRequests: 1,
	}),

	/** The Graph subgraph API */
	theGraph: new CircuitBreaker('theGraph', {
		failureThreshold: 5,
		recoveryTimeout: 30_000, // 30 seconds
		halfOpenRequests: 2,
	}),

	/** Gemini/Claude classifier API */
	classifier: new CircuitBreaker('classifier', {
		failureThreshold: 3,
		recoveryTimeout: 60_000, // 60 seconds
		halfOpenRequests: 1,
	}),
};

/**
 * Get all circuit breaker statuses for health checks
 */
export function getAllCircuitStatus(): Record<
	string,
	{
		state: CircuitState;
		failures: number;
		lastFailure: number;
	}
> {
	const status: Record<string, { state: CircuitState; failures: number; lastFailure: number }> =
		{};

	for (const [name, breaker] of Object.entries(circuitBreakers)) {
		const s = breaker.getStatus();
		status[name] = {
			state: s.state,
			failures: s.failures,
			lastFailure: s.lastFailure,
		};
	}

	return status;
}
