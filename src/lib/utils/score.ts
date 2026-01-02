/**
 * Score normalization utilities for reputation system
 * @module lib/utils/score
 */

/**
 * Normalize EAS score (1-5) to standard scale (0-100)
 * 1 -> 0, 2 -> 25, 3 -> 50, 4 -> 75, 5 -> 100
 *
 * @param score - EAS score in 1-5 range
 * @returns Normalized score in 0-100 range
 * @throws Error if score is outside 1-5 range
 */
export function normalizeEASScore(score: number): number {
  if (score < 1 || score > 5) {
    throw new Error(`Invalid EAS score: ${score}. Expected 1-5.`);
  }
  return Math.round((score - 1) * 25);
}

/**
 * Validate and clamp reputation score to 0-100 range
 *
 * @param score - Score to clamp
 * @returns Score clamped to 0-100 range
 */
export function clampScore(score: number): number {
  return Math.max(0, Math.min(100, Math.round(score)));
}

/**
 * Get display score (0-100) as 1-5 star rating
 *
 * @param score - Score in 0-100 range
 * @returns Star rating in 1-5 range
 */
export function toStarRating(score: number): number {
  return Math.round((score / 100) * 4) + 1;
}

/**
 * Check if a score represents a score from the EAS 1-5 scale
 * (used to identify legacy scores that need migration)
 *
 * @param score - Score to check
 * @returns True if score is in 1-5 range (legacy EAS scale)
 */
export function isLegacyEASScore(score: number): boolean {
  return score >= 1 && score <= 5;
}
