/**
 * PKCE (Proof Key for Code Exchange) service
 * Implements RFC 7636 with S256 method only (per MCP specification)
 * @module oauth/services/pkce-service
 */

/**
 * Validate PKCE code verifier against code challenge
 * Only S256 method is supported (plain is rejected per MCP spec)
 *
 * @param verifier - The code_verifier from the token request
 * @param challenge - The code_challenge from the authorization request
 * @param method - The code_challenge_method (must be 'S256')
 * @returns True if verification succeeds
 */
export async function validatePKCE(
  verifier: string,
  challenge: string,
  method: string
): Promise<boolean> {
  // Only S256 is supported per MCP specification
  if (method !== 'S256') {
    return false;
  }

  // Validate verifier format (RFC 7636: 43-128 characters, unreserved URI characters)
  if (!isValidVerifier(verifier)) {
    return false;
  }

  // Calculate S256 challenge from verifier
  const computed = await computeS256Challenge(verifier);
  return computed === challenge;
}

/**
 * Compute S256 code challenge from verifier
 * S256: BASE64URL(SHA256(code_verifier))
 *
 * @param verifier - The code verifier string
 * @returns The S256 challenge
 */
export async function computeS256Challenge(verifier: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(verifier);
  const hash = await crypto.subtle.digest('SHA-256', data);
  return base64UrlEncode(new Uint8Array(hash));
}

/**
 * Generate a secure code verifier for testing purposes
 * RFC 7636: 43-128 characters from unreserved URI character set
 *
 * @returns A random code verifier
 */
export function generateCodeVerifier(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return base64UrlEncode(bytes);
}

/**
 * Generate a code challenge from a verifier
 *
 * @param verifier - The code verifier
 * @returns The S256 challenge
 */
export async function generateCodeChallenge(verifier: string): Promise<string> {
  return computeS256Challenge(verifier);
}

/**
 * Validate code verifier format per RFC 7636
 * Must be 43-128 characters from: [A-Z] / [a-z] / [0-9] / "-" / "." / "_" / "~"
 *
 * @param verifier - The code verifier to validate
 * @returns True if valid
 */
export function isValidVerifier(verifier: string): boolean {
  if (verifier.length < 43 || verifier.length > 128) {
    return false;
  }

  // RFC 7636 unreserved characters
  const pattern = /^[A-Za-z0-9\-._~]+$/;
  return pattern.test(verifier);
}

/**
 * Validate code challenge format
 * Must be a valid base64url string
 *
 * @param challenge - The code challenge to validate
 * @returns True if valid
 */
export function isValidChallenge(challenge: string): boolean {
  // S256 challenge is 43 characters (256 bits base64url encoded)
  if (challenge.length !== 43) {
    return false;
  }

  // Base64url characters only
  const pattern = /^[A-Za-z0-9\-_]+$/;
  return pattern.test(challenge);
}

/**
 * Base64url encode bytes (RFC 4648)
 * No padding, URL-safe characters
 *
 * @param bytes - Bytes to encode
 * @returns Base64url encoded string
 */
export function base64UrlEncode(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

/**
 * Base64url decode to bytes (RFC 4648)
 *
 * @param str - Base64url string to decode
 * @returns Decoded bytes
 */
export function base64UrlDecode(str: string): Uint8Array {
  // Add padding if needed
  const padded = str + '='.repeat((4 - (str.length % 4)) % 4);
  const binary = atob(padded.replace(/-/g, '+').replace(/_/g, '/'));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}
