/**
 * PKCE Service tests
 * @module test/unit/oauth/pkce-service
 */

import {
  base64UrlDecode,
  base64UrlEncode,
  computeS256Challenge,
  generateCodeChallenge,
  generateCodeVerifier,
  isValidChallenge,
  isValidVerifier,
  validatePKCE,
} from '@/oauth/services/pkce-service';
import { describe, expect, it } from 'vitest';

describe('PKCE Service', () => {
  describe('isValidVerifier', () => {
    it('accepts valid verifier with exactly 43 characters', () => {
      // 43 characters from unreserved character set
      const verifier = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopq';
      expect(verifier.length).toBe(43);
      expect(isValidVerifier(verifier)).toBe(true);
    });

    it('accepts valid verifier with 128 characters', () => {
      const verifier = 'A'.repeat(128);
      expect(isValidVerifier(verifier)).toBe(true);
    });

    it('accepts valid verifier with special characters (- . _ ~)', () => {
      const verifier = 'abcdefghijklmnopqrstuvwxyz-._~ABCDEFGHIJKLMNO';
      expect(isValidVerifier(verifier)).toBe(true);
    });

    it('rejects verifier shorter than 43 characters', () => {
      const verifier = 'A'.repeat(42);
      expect(isValidVerifier(verifier)).toBe(false);
    });

    it('rejects verifier longer than 128 characters', () => {
      const verifier = 'A'.repeat(129);
      expect(isValidVerifier(verifier)).toBe(false);
    });

    it('rejects verifier with invalid characters', () => {
      // Contains invalid character '!' - 43 chars but invalid character
      const verifier = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmn!opq';
      expect(verifier.length).toBe(43);
      expect(isValidVerifier(verifier)).toBe(false);
    });

    it('rejects verifier with spaces', () => {
      // 43 chars but contains space
      const verifier = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ abcdefghijklmnop';
      expect(verifier.length).toBe(43);
      expect(isValidVerifier(verifier)).toBe(false);
    });

    it('rejects verifier with unicode characters', () => {
      // Contains non-ASCII characters
      const verifier = `${'A'.repeat(40)}é🎉`;
      expect(isValidVerifier(verifier)).toBe(false);
    });
  });

  describe('isValidChallenge', () => {
    it('accepts valid 43-character challenge', () => {
      // S256 challenge is always 43 characters (256 bits base64url encoded)
      const challenge = 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM';
      expect(challenge.length).toBe(43);
      expect(isValidChallenge(challenge)).toBe(true);
    });

    it('accepts challenge with base64url characters only', () => {
      const challenge = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghij-_12345';
      expect(isValidChallenge(challenge)).toBe(true);
    });

    it('rejects challenge not exactly 43 characters', () => {
      expect(isValidChallenge('A'.repeat(42))).toBe(false);
      expect(isValidChallenge('A'.repeat(44))).toBe(false);
    });

    it('rejects challenge with non-base64url characters', () => {
      const challenge = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghij+/123==';
      expect(isValidChallenge(challenge)).toBe(false);
    });
  });

  describe('generateCodeVerifier', () => {
    it('generates verifier of valid length', () => {
      const verifier = generateCodeVerifier();
      expect(verifier.length).toBeGreaterThanOrEqual(43);
      expect(verifier.length).toBeLessThanOrEqual(128);
    });

    it('generates verifier with valid characters', () => {
      const verifier = generateCodeVerifier();
      expect(isValidVerifier(verifier)).toBe(true);
    });

    it('generates unique verifiers', () => {
      const verifier1 = generateCodeVerifier();
      const verifier2 = generateCodeVerifier();
      expect(verifier1).not.toBe(verifier2);
    });
  });

  describe('computeS256Challenge', () => {
    it('computes correct S256 challenge for known input', async () => {
      // Known test vector from RFC 7636 Appendix B
      // Note: The RFC example uses 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk' as verifier
      const verifier = 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk';
      const expectedChallenge = 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM';

      const challenge = await computeS256Challenge(verifier);
      expect(challenge).toBe(expectedChallenge);
    });

    it('produces 43-character challenge', async () => {
      const verifier = generateCodeVerifier();
      const challenge = await computeS256Challenge(verifier);
      expect(challenge.length).toBe(43);
    });

    it('produces valid challenge format', async () => {
      const verifier = generateCodeVerifier();
      const challenge = await computeS256Challenge(verifier);
      expect(isValidChallenge(challenge)).toBe(true);
    });

    it('produces different challenges for different verifiers', async () => {
      const verifier1 = 'A'.repeat(43);
      const verifier2 = 'B'.repeat(43);

      const challenge1 = await computeS256Challenge(verifier1);
      const challenge2 = await computeS256Challenge(verifier2);

      expect(challenge1).not.toBe(challenge2);
    });
  });

  describe('generateCodeChallenge', () => {
    it('is an alias for computeS256Challenge', async () => {
      const verifier = generateCodeVerifier();
      const challenge1 = await computeS256Challenge(verifier);
      const challenge2 = await generateCodeChallenge(verifier);
      expect(challenge1).toBe(challenge2);
    });
  });

  describe('validatePKCE', () => {
    it('validates correct verifier-challenge pair', async () => {
      const verifier = generateCodeVerifier();
      const challenge = await computeS256Challenge(verifier);

      const result = await validatePKCE(verifier, challenge, 'S256');
      expect(result).toBe(true);
    });

    it('rejects plain method', async () => {
      const verifier = 'A'.repeat(43);
      const result = await validatePKCE(verifier, verifier, 'plain');
      expect(result).toBe(false);
    });

    it('rejects invalid method', async () => {
      const verifier = generateCodeVerifier();
      const challenge = await computeS256Challenge(verifier);

      const result = await validatePKCE(verifier, challenge, 'SHA256');
      expect(result).toBe(false);
    });

    it('rejects mismatched verifier-challenge pair', async () => {
      const verifier1 = generateCodeVerifier();
      const verifier2 = generateCodeVerifier();
      const challenge = await computeS256Challenge(verifier1);

      const result = await validatePKCE(verifier2, challenge, 'S256');
      expect(result).toBe(false);
    });

    it('rejects invalid verifier format', async () => {
      const invalidVerifier = 'too-short';
      const challenge = 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM';

      const result = await validatePKCE(invalidVerifier, challenge, 'S256');
      expect(result).toBe(false);
    });

    it('validates RFC 7636 Appendix B test vector', async () => {
      const verifier = 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk';
      const challenge = 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM';

      const result = await validatePKCE(verifier, challenge, 'S256');
      expect(result).toBe(true);
    });
  });

  describe('base64UrlEncode', () => {
    it('encodes bytes without padding', () => {
      const bytes = new Uint8Array([1, 2, 3, 4]);
      const encoded = base64UrlEncode(bytes);

      expect(encoded).not.toContain('=');
    });

    it('uses URL-safe characters', () => {
      // Use bytes that would produce + and / in standard base64
      const bytes = new Uint8Array([62, 63, 255, 254]);
      const encoded = base64UrlEncode(bytes);

      expect(encoded).not.toContain('+');
      expect(encoded).not.toContain('/');
    });

    it('encodes and decodes correctly', () => {
      const original = new Uint8Array([0, 127, 255, 128, 64, 32, 16, 8, 4, 2, 1]);
      const encoded = base64UrlEncode(original);
      const decoded = base64UrlDecode(encoded);

      expect(decoded).toEqual(original);
    });
  });

  describe('base64UrlDecode', () => {
    it('decodes valid base64url string', () => {
      const encoded = 'AQIDBA'; // [1, 2, 3, 4]
      const decoded = base64UrlDecode(encoded);

      expect(decoded).toEqual(new Uint8Array([1, 2, 3, 4]));
    });

    it('handles strings with - and _', () => {
      // Encode some bytes and verify roundtrip
      const bytes = new Uint8Array([251, 252, 253, 254, 255]);
      const encoded = base64UrlEncode(bytes);
      const decoded = base64UrlDecode(encoded);

      expect(decoded).toEqual(bytes);
    });

    it('adds padding if needed', () => {
      // String without padding that needs it
      const encoded = 'AA'; // Should decode to [0]
      const decoded = base64UrlDecode(encoded);
      expect(decoded.length).toBe(1);
    });
  });
});
