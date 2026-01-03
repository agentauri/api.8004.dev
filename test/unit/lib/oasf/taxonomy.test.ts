/**
 * OASF Taxonomy tests
 * @module test/unit/lib/oasf/taxonomy
 */

import { describe, expect, it } from 'vitest';
import {
  DOMAIN_TAXONOMY,
  getAllDomainSlugs,
  getAllSkillSlugs,
  getTaxonomy,
  OASF_VERSION,
  SKILL_TAXONOMY,
  validateDomainSlug,
  validateSkillSlug,
} from '@/lib/oasf/taxonomy';

describe('OASF constants', () => {
  it('has correct version', () => {
    expect(OASF_VERSION).toBe('1.0.0');
  });

  it('has skill taxonomy with 15 categories', () => {
    expect(SKILL_TAXONOMY).toBeDefined();
    expect(SKILL_TAXONOMY.length).toBe(15);
  });

  it('has domain taxonomy with 24 categories', () => {
    expect(DOMAIN_TAXONOMY).toBeDefined();
    expect(DOMAIN_TAXONOMY.length).toBe(24);
  });
});

describe('getAllSkillSlugs', () => {
  it('returns all 15 skill slugs (flat structure)', () => {
    const slugs = getAllSkillSlugs();
    expect(slugs.length).toBe(15);

    // Check for expected flat categories
    expect(slugs).toContain('natural_language_processing');
    expect(slugs).toContain('images_computer_vision');
    expect(slugs).toContain('audio');
    expect(slugs).toContain('tool_interaction');
    expect(slugs).toContain('advanced_reasoning_planning');
    expect(slugs).toContain('agent_orchestration');
  });

  it('does not contain hierarchical slugs', () => {
    const slugs = getAllSkillSlugs();
    const hasHierarchy = slugs.some((s) => s.includes('/'));
    expect(hasHierarchy).toBe(false);
  });
});

describe('getAllDomainSlugs', () => {
  it('returns all 24 domain slugs (flat structure)', () => {
    const slugs = getAllDomainSlugs();
    expect(slugs.length).toBe(24);

    // Check for expected flat categories
    expect(slugs).toContain('technology');
    expect(slugs).toContain('finance_business');
    expect(slugs).toContain('healthcare');
    expect(slugs).toContain('education');
    expect(slugs).toContain('media_entertainment');
  });

  it('does not contain hierarchical slugs', () => {
    const slugs = getAllDomainSlugs();
    const hasHierarchy = slugs.some((s) => s.includes('/'));
    expect(hasHierarchy).toBe(false);
  });
});

describe('validateSkillSlug', () => {
  it('validates correct skill slugs', () => {
    expect(validateSkillSlug('natural_language_processing')).toBe(true);
    expect(validateSkillSlug('tool_interaction')).toBe(true);
    expect(validateSkillSlug('advanced_reasoning_planning')).toBe(true);
    expect(validateSkillSlug('agent_orchestration')).toBe(true);
  });

  it('rejects invalid skill slugs', () => {
    expect(validateSkillSlug('invalid')).toBe(false);
    expect(validateSkillSlug('natural_language_processing/text_generation')).toBe(false);
    expect(validateSkillSlug('')).toBe(false);
    expect(validateSkillSlug('reasoning')).toBe(false); // Old slug
  });
});

describe('validateDomainSlug', () => {
  it('validates correct domain slugs', () => {
    expect(validateDomainSlug('technology')).toBe(true);
    expect(validateDomainSlug('finance_business')).toBe(true);
    expect(validateDomainSlug('healthcare')).toBe(true);
    expect(validateDomainSlug('media_entertainment')).toBe(true);
  });

  it('rejects invalid domain slugs', () => {
    expect(validateDomainSlug('invalid')).toBe(false);
    expect(validateDomainSlug('technology/software_development')).toBe(false);
    expect(validateDomainSlug('')).toBe(false);
    expect(validateDomainSlug('finance')).toBe(false); // Old slug
    expect(validateDomainSlug('business')).toBe(false); // Old slug
  });
});

describe('getTaxonomy', () => {
  it('returns skills only when type is skill', () => {
    const result = getTaxonomy('skill');
    expect(result.version).toBe(OASF_VERSION);
    expect(result.skills).toBeDefined();
    expect(result.skills?.length).toBe(15);
    expect(result.domains).toBeUndefined();
  });

  it('returns domains only when type is domain', () => {
    const result = getTaxonomy('domain');
    expect(result.version).toBe(OASF_VERSION);
    expect(result.skills).toBeUndefined();
    expect(result.domains).toBeDefined();
    expect(result.domains?.length).toBe(24);
  });

  it('returns both when type is all', () => {
    const result = getTaxonomy('all');
    expect(result.version).toBe(OASF_VERSION);
    expect(result.skills).toBeDefined();
    expect(result.domains).toBeDefined();
  });
});
