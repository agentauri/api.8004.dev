/**
 * Structured JSON Logger for Cloudflare Workers
 *
 * Provides consistent logging format with contextual information:
 * - timestamp: ISO 8601 format
 * - level: debug, info, warn, error
 * - requestId: Request correlation ID
 * - operation: Current operation name
 * - duration: Operation duration in milliseconds
 *
 * @example
 * ```typescript
 * const logger = createLogger(c.get('requestId'));
 * logger.info('Processing request', { endpoint: '/agents', method: 'GET' });
 *
 * // With timing
 * const result = await logger.time('fetchAgents', async () => {
 *   return await sdk.getAgents();
 * });
 * ```
 *
 * @module lib/logger/logger
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LogContext {
  requestId?: string;
  operation?: string;
  duration?: number;
  [key: string]: unknown;
}

export interface LogEntry extends LogContext {
  timestamp: string;
  level: LogLevel;
  message: string;
}

/**
 * Structured logger instance
 */
export class Logger {
  constructor(private readonly context: LogContext = {}) {}

  /**
   * Log a message at the specified level
   */
  private log(level: LogLevel, message: string, data?: Record<string, unknown>): void {
    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      ...this.context,
      ...data,
    };

    // Remove undefined values for cleaner output
    const cleanEntry = Object.fromEntries(Object.entries(entry).filter(([, v]) => v !== undefined));

    // Use appropriate console method (intentional - this IS the logger)
    const output = JSON.stringify(cleanEntry);
    if (level === 'error') {
      console.error(output);
    } else if (level === 'warn') {
      console.warn(output);
    } else {
      // biome-ignore lint/suspicious/noConsole: Logger must use console for output
      console.log(output);
    }
  }

  /**
   * Log at debug level
   */
  debug(message: string, data?: Record<string, unknown>): void {
    this.log('debug', message, data);
  }

  /**
   * Log at info level
   */
  info(message: string, data?: Record<string, unknown>): void {
    this.log('info', message, data);
  }

  /**
   * Log at warn level
   */
  warn(message: string, data?: Record<string, unknown>): void {
    this.log('warn', message, data);
  }

  /**
   * Log at error level
   */
  error(message: string, data?: Record<string, unknown>): void {
    this.log('error', message, data);
  }

  /**
   * Log an error object with stack trace
   */
  logError(message: string, error: unknown, data?: Record<string, unknown>): void {
    const errorInfo: Record<string, unknown> = {
      ...data,
    };

    if (error instanceof Error) {
      errorInfo.errorName = error.name;
      errorInfo.errorMessage = error.message;
      if (error.stack) {
        errorInfo.errorStack = error.stack.split('\n').slice(0, 5);
      }
    } else {
      errorInfo.errorRaw = String(error);
    }

    this.log('error', message, errorInfo);
  }

  /**
   * Create a child logger with additional context
   */
  child(context: LogContext): Logger {
    return new Logger({ ...this.context, ...context });
  }

  /**
   * Execute a function and log its duration
   */
  async time<T>(operation: string, fn: () => Promise<T>): Promise<T> {
    const start = Date.now();
    const childLogger = this.child({ operation });

    try {
      const result = await fn();
      const duration = Date.now() - start;
      childLogger.info(`${operation} completed`, { duration, success: true });
      return result;
    } catch (error) {
      const duration = Date.now() - start;
      childLogger.logError(`${operation} failed`, error, { duration, success: false });
      throw error;
    }
  }

  /**
   * Synchronous version of time() for non-async operations
   */
  timeSync<T>(operation: string, fn: () => T): T {
    const start = Date.now();
    const childLogger = this.child({ operation });

    try {
      const result = fn();
      const duration = Date.now() - start;
      childLogger.info(`${operation} completed`, { duration, success: true });
      return result;
    } catch (error) {
      const duration = Date.now() - start;
      childLogger.logError(`${operation} failed`, error, { duration, success: false });
      throw error;
    }
  }
}

/**
 * Create a logger instance
 * @param requestId - Optional request ID for correlation
 */
export function createLogger(requestId?: string): Logger {
  return new Logger(requestId ? { requestId } : {});
}

/**
 * Global logger instance for use outside request context
 */
export const globalLogger = new Logger({ context: 'global' });
