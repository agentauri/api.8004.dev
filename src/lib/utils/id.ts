/**
 * ID generation utilities
 * @module lib/utils/id
 */

/**
 * Generate a unique ID using crypto.randomUUID
 * Returns a 32-character hex string (UUID without dashes)
 */
export function generateId(): string {
  return crypto.randomUUID().replace(/-/g, '');
}

/**
 * Generate a short ID (16 characters)
 */
export function generateShortId(): string {
  return generateId().substring(0, 16);
}
