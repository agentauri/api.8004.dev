/**
 * Tests for score normalization utilities
 */

import { describe, expect, it } from 'vitest';
import { clampScore, isLegacyEASScore, normalizeEASScore, toStarRating } from '@/lib/utils/score';

describe('Score utilities', () => {
  describe('normalizeEASScore', () => {
    it('converts score 1 to 0', () => {
      expect(normalizeEASScore(1)).toBe(0);
    });

    it('converts score 2 to 25', () => {
      expect(normalizeEASScore(2)).toBe(25);
    });

    it('converts score 3 to 50', () => {
      expect(normalizeEASScore(3)).toBe(50);
    });

    it('converts score 4 to 75', () => {
      expect(normalizeEASScore(4)).toBe(75);
    });

    it('converts score 5 to 100', () => {
      expect(normalizeEASScore(5)).toBe(100);
    });

    it('throws error for score below 1', () => {
      expect(() => normalizeEASScore(0)).toThrow('Invalid EAS score: 0. Expected 1-5.');
    });

    it('throws error for score above 5', () => {
      expect(() => normalizeEASScore(6)).toThrow('Invalid EAS score: 6. Expected 1-5.');
    });

    it('throws error for negative score', () => {
      expect(() => normalizeEASScore(-1)).toThrow('Invalid EAS score: -1. Expected 1-5.');
    });

    it('rounds fractional scores correctly', () => {
      // While the function expects integers, verify it handles edge cases
      expect(() => normalizeEASScore(1.5)).not.toThrow();
      expect(normalizeEASScore(1.5)).toBe(13); // (1.5 - 1) * 25 = 12.5 -> 13 (rounded)
    });
  });

  describe('clampScore', () => {
    it('returns 0 for negative scores', () => {
      expect(clampScore(-10)).toBe(0);
      expect(clampScore(-1)).toBe(0);
    });

    it('returns 100 for scores above 100', () => {
      expect(clampScore(101)).toBe(100);
      expect(clampScore(150)).toBe(100);
    });

    it('returns the same value for scores in valid range', () => {
      expect(clampScore(0)).toBe(0);
      expect(clampScore(50)).toBe(50);
      expect(clampScore(100)).toBe(100);
    });

    it('rounds fractional scores', () => {
      expect(clampScore(50.4)).toBe(50);
      expect(clampScore(50.5)).toBe(51);
      expect(clampScore(50.6)).toBe(51);
    });
  });

  describe('toStarRating', () => {
    it('converts 0 to 1 star', () => {
      expect(toStarRating(0)).toBe(1);
    });

    it('converts 25 to 2 stars', () => {
      expect(toStarRating(25)).toBe(2);
    });

    it('converts 50 to 3 stars', () => {
      expect(toStarRating(50)).toBe(3);
    });

    it('converts 75 to 4 stars', () => {
      expect(toStarRating(75)).toBe(4);
    });

    it('converts 100 to 5 stars', () => {
      expect(toStarRating(100)).toBe(5);
    });

    it('rounds intermediate values correctly', () => {
      expect(toStarRating(12)).toBe(1); // 12/100*4+1 = 1.48 -> 1
      expect(toStarRating(13)).toBe(2); // 13/100*4+1 = 1.52 -> 2
      expect(toStarRating(37)).toBe(2); // 37/100*4+1 = 2.48 -> 2
      expect(toStarRating(38)).toBe(3); // 38/100*4+1 = 2.52 -> 3
      expect(toStarRating(62)).toBe(3); // 62/100*4+1 = 3.48 -> 3
      expect(toStarRating(63)).toBe(4); // 63/100*4+1 = 3.52 -> 4
      expect(toStarRating(87)).toBe(4); // 87/100*4+1 = 4.48 -> 4
      expect(toStarRating(88)).toBe(5); // 88/100*4+1 = 4.52 -> 5
    });
  });

  describe('isLegacyEASScore', () => {
    it('returns true for scores 1-5', () => {
      expect(isLegacyEASScore(1)).toBe(true);
      expect(isLegacyEASScore(2)).toBe(true);
      expect(isLegacyEASScore(3)).toBe(true);
      expect(isLegacyEASScore(4)).toBe(true);
      expect(isLegacyEASScore(5)).toBe(true);
    });

    it('returns false for score 0', () => {
      expect(isLegacyEASScore(0)).toBe(false);
    });

    it('returns false for score above 5', () => {
      expect(isLegacyEASScore(6)).toBe(false);
      expect(isLegacyEASScore(50)).toBe(false);
      expect(isLegacyEASScore(100)).toBe(false);
    });

    it('returns false for negative scores', () => {
      expect(isLegacyEASScore(-1)).toBe(false);
    });

    it('returns true for fractional values in 1-5 range', () => {
      expect(isLegacyEASScore(1.5)).toBe(true);
      expect(isLegacyEASScore(4.9)).toBe(true);
    });
  });

  describe('Integration: EAS score round-trip', () => {
    it('normalized EAS scores can be converted back to star ratings', () => {
      // EAS 1 -> 0 -> 1 star
      expect(toStarRating(normalizeEASScore(1))).toBe(1);
      // EAS 2 -> 25 -> 2 stars
      expect(toStarRating(normalizeEASScore(2))).toBe(2);
      // EAS 3 -> 50 -> 3 stars
      expect(toStarRating(normalizeEASScore(3))).toBe(3);
      // EAS 4 -> 75 -> 4 stars
      expect(toStarRating(normalizeEASScore(4))).toBe(4);
      // EAS 5 -> 100 -> 5 stars
      expect(toStarRating(normalizeEASScore(5))).toBe(5);
    });
  });
});
