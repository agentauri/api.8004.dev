/**
 * OASF Taxonomy type definitions
 * @module types/taxonomy
 */

/**
 * Taxonomy category (skill or domain)
 */
export interface TaxonomyCategory {
  /** Unique identifier */
  id: number;
  /** URL-friendly slug */
  slug: string;
  /** Display name */
  name: string;
  /** Category description */
  description?: string;
  /** Child categories */
  children?: TaxonomyCategory[];
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
