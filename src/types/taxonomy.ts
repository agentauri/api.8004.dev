/**
 * OASF Taxonomy type definitions
 * @module types/taxonomy
 * @see https://github.com/agntcy/oasf
 */

/**
 * Taxonomy category (skill or domain)
 * Note: OASF uses a flat structure with no hierarchies
 */
export interface TaxonomyCategory {
  /** Unique identifier */
  id: number;
  /** URL-friendly slug (exact match required, no hierarchies) */
  slug: string;
  /** Display name */
  name: string;
  /** Category description */
  description?: string;
}

/**
 * Taxonomy type filter
 */
export type TaxonomyType = 'skill' | 'domain' | 'all';

/**
 * Taxonomy data structure
 */
export interface TaxonomyData {
  /** OASF version */
  version: string;
  /** Skill categories */
  skills?: TaxonomyCategory[];
  /** Domain categories */
  domains?: TaxonomyCategory[];
}

/**
 * Taxonomy API response
 */
export interface TaxonomyResponse {
  success: true;
  data: TaxonomyData;
}
