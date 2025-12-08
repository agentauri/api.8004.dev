/**
 * OASF Taxonomy tests
 * @module test/unit/lib/oasf/taxonomy
 */

import {
  DOMAIN_TAXONOMY,
  OASF_VERSION,
  SKILL_TAXONOMY,
  getAllDomainSlugs,
  getAllSkillSlugs,
  getTaxonomy,
  validateDomainSlug,
  validateSkillSlug,
} from '@/lib/oasf/taxonomy';
import { describe, expect, it } from 'vitest';

describe('OASF constants', () => {
  it('has correct version', () => {
    expect(OASF_VERSION).toBe('0.8.0');
  });

  it('has skill taxonomy', () => {
    expect(SKILL_TAXONOMY).toBeDefined();
    expect(SKILL_TAXONOMY.length).toBeGreaterThan(0);
  });

  it('has domain taxonomy', () => {
    expect(DOMAIN_TAXONOMY).toBeDefined();
    expect(DOMAIN_TAXONOMY.length).toBeGreaterThan(0);
  });
});

describe('getAllSkillSlugs', () => {
  it('returns all skill slugs', () => {
    const slugs = getAllSkillSlugs();
    expect(slugs.length).toBeGreaterThan(0);

    // Check for parent categories
    expect(slugs).toContain('natural_language_processing');
    expect(slugs).toContain('code_generation');

    // Check for child categories
    expect(slugs).toContain('natural_language_processing/text_generation');
    expect(slugs).toContain('code_generation/debugging');
  });
});

describe('getAllDomainSlugs', () => {
  it('returns all domain slugs', () => {
    const slugs = getAllDomainSlugs();
    expect(slugs.length).toBeGreaterThan(0);

    // Check for parent categories
    expect(slugs).toContain('finance');
    expect(slugs).toContain('technology');

    // Check for child categories
    expect(slugs).toContain('finance/trading');
    expect(slugs).toContain('technology/software_development');
  });
});

describe('validateSkillSlug', () => {
  it('validates correct skill slugs', () => {
    expect(validateSkillSlug('natural_language_processing')).toBe(true);
    expect(validateSkillSlug('natural_language_processing/text_generation')).toBe(true);
    expect(validateSkillSlug('code_generation')).toBe(true);
    expect(validateSkillSlug('code_generation/debugging')).toBe(true);
  });

  it('rejects invalid skill slugs', () => {
    expect(validateSkillSlug('invalid')).toBe(false);
    expect(validateSkillSlug('natural_language_processing/invalid')).toBe(false);
    expect(validateSkillSlug('')).toBe(false);
  });
});

describe('validateDomainSlug', () => {
  it('validates correct domain slugs', () => {
    expect(validateDomainSlug('finance')).toBe(true);
    expect(validateDomainSlug('finance/trading')).toBe(true);
    expect(validateDomainSlug('technology')).toBe(true);
    expect(validateDomainSlug('technology/software_development')).toBe(true);
  });

  it('rejects invalid domain slugs', () => {
    expect(validateDomainSlug('invalid')).toBe(false);
    expect(validateDomainSlug('finance/invalid')).toBe(false);
    expect(validateDomainSlug('')).toBe(false);
  });
});

describe('getTaxonomy', () => {
  it('returns skills only when type is skill', () => {
    const result = getTaxonomy('skill');
    expect(result.version).toBe(OASF_VERSION);
    expect(result.skills).toBeDefined();
    expect(result.domains).toBeUndefined();
  });

  it('returns domains only when type is domain', () => {
    const result = getTaxonomy('domain');
    expect(result.version).toBe(OASF_VERSION);
    expect(result.skills).toBeUndefined();
    expect(result.domains).toBeDefined();
  });

  it('returns both when type is all', () => {
    const result = getTaxonomy('all');
    expect(result.version).toBe(OASF_VERSION);
    expect(result.skills).toBeDefined();
    expect(result.domains).toBeDefined();
  });
});
