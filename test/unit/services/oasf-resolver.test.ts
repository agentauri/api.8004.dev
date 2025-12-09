/**
 * OASF resolver tests
 * @module test/unit/services/oasf-resolver
 */

import type { ParsedClassification } from '@/lib/utils/validation';
import {
  hasCreatorDefinedOasf,
  resolveClassification,
  toOASFClassification,
} from '@/services/oasf-resolver';
import type { IPFSMetadata } from '@/types/ipfs';
import { describe, expect, it } from 'vitest';

describe('hasCreatorDefinedOasf', () => {
  it('returns false for null metadata', () => {
    expect(hasCreatorDefinedOasf(null)).toBe(false);
  });

  it('returns false for metadata without oasfEndpoint', () => {
    const metadata: IPFSMetadata = {
      name: 'Test Agent',
    };
    expect(hasCreatorDefinedOasf(metadata)).toBe(false);
  });

  it('returns false for oasfEndpoint without skills or domains', () => {
    const metadata: IPFSMetadata = {
      name: 'Test Agent',
      oasfEndpoint: {
        url: 'https://oasf.example.com',
      },
    };
    expect(hasCreatorDefinedOasf(metadata)).toBe(false);
  });

  it('returns false for oasfEndpoint with empty skills and domains', () => {
    const metadata: IPFSMetadata = {
      name: 'Test Agent',
      oasfEndpoint: {
        url: 'https://oasf.example.com',
        skills: [],
        domains: [],
      },
    };
    expect(hasCreatorDefinedOasf(metadata)).toBe(false);
  });

  it('returns false for oasfEndpoint with invalid skills', () => {
    const metadata: IPFSMetadata = {
      name: 'Test Agent',
      oasfEndpoint: {
        url: 'https://oasf.example.com',
        skills: ['invalid_skill_slug'],
      },
    };
    expect(hasCreatorDefinedOasf(metadata)).toBe(false);
  });

  it('returns true for oasfEndpoint with valid skills', () => {
    const metadata: IPFSMetadata = {
      name: 'Test Agent',
      oasfEndpoint: {
        url: 'https://oasf.example.com',
        skills: ['natural_language_processing/text_generation'],
      },
    };
    expect(hasCreatorDefinedOasf(metadata)).toBe(true);
  });

  it('returns true for oasfEndpoint with valid domains', () => {
    const metadata: IPFSMetadata = {
      name: 'Test Agent',
      oasfEndpoint: {
        url: 'https://oasf.example.com',
        domains: ['technology/software_development'],
      },
    };
    expect(hasCreatorDefinedOasf(metadata)).toBe(true);
  });

  it('returns true for oasfEndpoint with both valid skills and domains', () => {
    const metadata: IPFSMetadata = {
      name: 'Test Agent',
      oasfEndpoint: {
        url: 'https://oasf.example.com',
        skills: ['natural_language_processing/text_generation'],
        domains: ['technology/software_development'],
      },
    };
    expect(hasCreatorDefinedOasf(metadata)).toBe(true);
  });

  it('returns true if at least one skill is valid', () => {
    const metadata: IPFSMetadata = {
      name: 'Test Agent',
      oasfEndpoint: {
        url: 'https://oasf.example.com',
        skills: ['invalid_skill', 'natural_language_processing/text_generation'],
      },
    };
    expect(hasCreatorDefinedOasf(metadata)).toBe(true);
  });
});

describe('resolveClassification', () => {
  describe('priority: creator-defined > LLM > none', () => {
    it('returns none when no classification available', () => {
      const result = resolveClassification(null, undefined);

      expect(result.source).toBe('none');
      expect(result.skills).toEqual([]);
      expect(result.domains).toEqual([]);
      expect(result.confidence).toBe(0);
    });

    it('returns LLM classification when only DB classification exists', () => {
      const dbClassification: ParsedClassification = {
        skills: [{ slug: 'natural_language_processing/text_generation', confidence: 0.9 }],
        domains: [{ slug: 'technology/software_development', confidence: 0.85 }],
        confidence: 0.88,
        classifiedAt: '2024-01-01T00:00:00Z',
        modelVersion: 'claude-3-haiku-20240307',
      };

      const result = resolveClassification(null, dbClassification);

      expect(result.source).toBe('llm-classification');
      expect(result.skills).toEqual(dbClassification.skills);
      expect(result.domains).toEqual(dbClassification.domains);
      expect(result.confidence).toBe(0.88);
      expect(result.classifiedAt).toBe('2024-01-01T00:00:00Z');
      expect(result.modelVersion).toBe('claude-3-haiku-20240307');
    });

    it('returns LLM classification when IPFS has no valid OASF', () => {
      const metadata: IPFSMetadata = {
        name: 'Test Agent',
        oasfEndpoint: {
          url: 'https://oasf.example.com',
          skills: [], // Empty = no valid OASF
        },
      };

      const dbClassification: ParsedClassification = {
        skills: [{ slug: 'natural_language_processing/text_generation', confidence: 0.9 }],
        domains: [],
        confidence: 0.9,
        classifiedAt: '2024-01-01T00:00:00Z',
        modelVersion: 'claude-3-haiku-20240307',
      };

      const result = resolveClassification(metadata, dbClassification);

      expect(result.source).toBe('llm-classification');
    });

    it('returns creator-defined when IPFS has valid OASF (priority over LLM)', () => {
      const metadata: IPFSMetadata = {
        name: 'Test Agent',
        oasfEndpoint: {
          url: 'https://oasf.example.com',
          skills: ['natural_language_processing/text_generation'],
          domains: ['technology/software_development'],
          version: '0.8.0',
        },
      };

      const dbClassification: ParsedClassification = {
        skills: [{ slug: 'different/skill', confidence: 0.9 }],
        domains: [{ slug: 'different/domain', confidence: 0.9 }],
        confidence: 0.9,
        classifiedAt: '2024-01-01T00:00:00Z',
        modelVersion: 'claude-3-haiku-20240307',
      };

      const result = resolveClassification(metadata, dbClassification);

      expect(result.source).toBe('creator-defined');
      expect(result.skills).toEqual([
        { slug: 'natural_language_processing/text_generation', confidence: 1.0 },
      ]);
      expect(result.domains).toEqual([
        { slug: 'technology/software_development', confidence: 1.0 },
      ]);
      expect(result.confidence).toBe(1.0);
      expect(result.modelVersion).toBe('0.8.0');
    });

    it('returns creator-defined when only IPFS has valid OASF', () => {
      const metadata: IPFSMetadata = {
        name: 'Test Agent',
        oasfEndpoint: {
          url: 'https://oasf.example.com',
          skills: ['natural_language_processing/text_generation'],
        },
      };

      const result = resolveClassification(metadata, undefined);

      expect(result.source).toBe('creator-defined');
      expect(result.confidence).toBe(1.0);
    });
  });

  describe('skill/domain validation', () => {
    it('filters out invalid skills from IPFS', () => {
      const metadata: IPFSMetadata = {
        name: 'Test Agent',
        oasfEndpoint: {
          url: 'https://oasf.example.com',
          skills: [
            'natural_language_processing/text_generation', // Valid
            'invalid_skill_that_does_not_exist', // Invalid
            'code_generation/code_completion', // Valid
          ],
        },
      };

      const result = resolveClassification(metadata, undefined);

      expect(result.skills).toHaveLength(2);
      expect(result.skills.map((s) => s.slug)).toContain(
        'natural_language_processing/text_generation'
      );
      expect(result.skills.map((s) => s.slug)).toContain('code_generation/code_completion');
    });

    it('filters out invalid domains from IPFS', () => {
      const metadata: IPFSMetadata = {
        name: 'Test Agent',
        oasfEndpoint: {
          url: 'https://oasf.example.com',
          domains: [
            'technology/software_development', // Valid
            'invalid_domain', // Invalid
          ],
        },
      };

      const result = resolveClassification(metadata, undefined);

      expect(result.domains).toHaveLength(1);
      expect(result.domains[0].slug).toBe('technology/software_development');
    });

    it('returns none if all skills/domains are invalid', () => {
      const metadata: IPFSMetadata = {
        name: 'Test Agent',
        oasfEndpoint: {
          url: 'https://oasf.example.com',
          skills: ['invalid1', 'invalid2'],
          domains: ['invalid3'],
        },
      };

      const result = resolveClassification(metadata, undefined);

      expect(result.source).toBe('none');
    });
  });

  describe('confidence levels', () => {
    it('sets confidence to 1.0 for creator-defined', () => {
      const metadata: IPFSMetadata = {
        name: 'Test Agent',
        oasfEndpoint: {
          url: 'https://oasf.example.com',
          skills: ['natural_language_processing/text_generation'],
        },
      };

      const result = resolveClassification(metadata, undefined);

      expect(result.confidence).toBe(1.0);
      expect(result.skills[0].confidence).toBe(1.0);
    });

    it('preserves confidence from LLM classification', () => {
      const dbClassification: ParsedClassification = {
        skills: [{ slug: 'natural_language_processing/text_generation', confidence: 0.75 }],
        domains: [{ slug: 'technology/software_development', confidence: 0.82 }],
        confidence: 0.78,
        classifiedAt: '2024-01-01T00:00:00Z',
        modelVersion: 'claude-3-haiku-20240307',
      };

      const result = resolveClassification(null, dbClassification);

      expect(result.confidence).toBe(0.78);
      expect(result.skills[0].confidence).toBe(0.75);
      expect(result.domains[0].confidence).toBe(0.82);
    });
  });
});

describe('toOASFClassification', () => {
  it('returns undefined for source=none', () => {
    const resolved = {
      skills: [],
      domains: [],
      confidence: 0,
      source: 'none' as const,
    };

    expect(toOASFClassification(resolved)).toBeUndefined();
  });

  it('converts creator-defined to OASFClassification', () => {
    const resolved = {
      skills: [{ slug: 'natural_language_processing/text_generation', confidence: 1.0 }],
      domains: [{ slug: 'technology/software_development', confidence: 1.0 }],
      confidence: 1.0,
      source: 'creator-defined' as const,
      classifiedAt: '2024-01-01T00:00:00Z',
      modelVersion: '0.8.0',
    };

    const result = toOASFClassification(resolved);

    expect(result).toEqual({
      skills: resolved.skills,
      domains: resolved.domains,
      confidence: 1.0,
      classifiedAt: '2024-01-01T00:00:00Z',
      modelVersion: '0.8.0',
      source: 'creator-defined',
    });
  });

  it('converts llm-classification to OASFClassification', () => {
    const resolved = {
      skills: [{ slug: 'natural_language_processing/text_generation', confidence: 0.9 }],
      domains: [],
      confidence: 0.9,
      source: 'llm-classification' as const,
      classifiedAt: '2024-01-01T00:00:00Z',
      modelVersion: 'claude-3-haiku-20240307',
    };

    const result = toOASFClassification(resolved);

    expect(result?.source).toBe('llm-classification');
    expect(result?.confidence).toBe(0.9);
  });

  it('generates classifiedAt if not provided', () => {
    const resolved = {
      skills: [{ slug: 'natural_language_processing/text_generation', confidence: 1.0 }],
      domains: [],
      confidence: 1.0,
      source: 'creator-defined' as const,
    };

    const result = toOASFClassification(resolved);

    expect(result?.classifiedAt).toBeDefined();
    expect(new Date(result?.classifiedAt ?? '').getTime()).toBeLessThanOrEqual(Date.now());
  });

  it('uses OASF_VERSION if modelVersion not provided', () => {
    const resolved = {
      skills: [{ slug: 'natural_language_processing/text_generation', confidence: 1.0 }],
      domains: [],
      confidence: 1.0,
      source: 'creator-defined' as const,
    };

    const result = toOASFClassification(resolved);

    expect(result?.modelVersion).toBeDefined();
    expect(result?.modelVersion.length).toBeGreaterThan(0);
  });
});
