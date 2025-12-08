/**
 * Classifier service tests
 * @module test/unit/services/classifier
 *
 * Note: Integration tests with the Anthropic API are covered in integration tests.
 * This file focuses on testing the pure functions that handle response parsing.
 */

import { calculateOverallConfidence, parseClassificationResponse } from '@/services/classifier';
import { describe, expect, it } from 'vitest';

describe('parseClassificationResponse', () => {
  it('parses plain JSON response', () => {
    const response = JSON.stringify({
      skills: [{ slug: 'skill1', confidence: 0.9 }],
      domains: [{ slug: 'domain1', confidence: 0.8 }],
    });

    const result = parseClassificationResponse(response);

    expect(result.skills).toHaveLength(1);
    expect(result.skills[0].slug).toBe('skill1');
    expect(result.skills[0].confidence).toBe(0.9);
    expect(result.domains).toHaveLength(1);
    expect(result.domains[0].slug).toBe('domain1');
    expect(result.domains[0].confidence).toBe(0.8);
  });

  it('parses JSON in markdown code blocks with json specifier', () => {
    const response = `\`\`\`json\n${JSON.stringify({
      skills: [{ slug: 'skill1', confidence: 0.9 }],
      domains: [{ slug: 'domain1', confidence: 0.8 }],
    })}\n\`\`\``;

    const result = parseClassificationResponse(response);

    expect(result.skills).toHaveLength(1);
    expect(result.domains).toHaveLength(1);
  });

  it('parses JSON in code blocks without json specifier', () => {
    const response = `\`\`\`\n${JSON.stringify({
      skills: [{ slug: 'skill1', confidence: 0.9 }],
      domains: [],
    })}\n\`\`\``;

    const result = parseClassificationResponse(response);

    expect(result.skills).toHaveLength(1);
    expect(result.domains).toHaveLength(0);
  });

  it('parses JSON with surrounding text', () => {
    const response = `Here is the classification:\n\`\`\`json\n${JSON.stringify({
      skills: [{ slug: 'skill1', confidence: 0.9 }],
      domains: [{ slug: 'domain1', confidence: 0.8 }],
    })}\n\`\`\`\nEnd of classification.`;

    const result = parseClassificationResponse(response);

    expect(result.skills).toHaveLength(1);
    expect(result.domains).toHaveLength(1);
  });

  it('throws on invalid JSON', () => {
    expect(() => parseClassificationResponse('not json')).toThrow(
      'Failed to parse classification response'
    );
  });

  it('throws on invalid JSON in code block', () => {
    expect(() => parseClassificationResponse('```json\nnot json\n```')).toThrow(
      'Failed to parse classification response'
    );
  });

  it('throws on invalid structure (missing skills)', () => {
    const response = JSON.stringify({ domains: [] });
    expect(() => parseClassificationResponse(response)).toThrow(
      'Invalid classification response structure'
    );
  });

  it('throws on invalid structure (missing domains)', () => {
    const response = JSON.stringify({ skills: [] });
    expect(() => parseClassificationResponse(response)).toThrow(
      'Invalid classification response structure'
    );
  });

  it('throws on invalid structure (skills not array)', () => {
    const response = JSON.stringify({ skills: 'not an array', domains: [] });
    expect(() => parseClassificationResponse(response)).toThrow(
      'Invalid classification response structure'
    );
  });

  it('throws on invalid structure (domains not array)', () => {
    const response = JSON.stringify({ skills: [], domains: 'not an array' });
    expect(() => parseClassificationResponse(response)).toThrow(
      'Invalid classification response structure'
    );
  });

  it('preserves reasoning when present', () => {
    const response = JSON.stringify({
      skills: [{ slug: 'skill1', confidence: 0.9, reasoning: 'Because of X' }],
      domains: [{ slug: 'domain1', confidence: 0.8, reasoning: 'Because of Y' }],
    });

    const result = parseClassificationResponse(response);

    expect(result.skills[0].reasoning).toBe('Because of X');
    expect(result.domains[0].reasoning).toBe('Because of Y');
  });

  it('handles empty arrays', () => {
    const response = JSON.stringify({ skills: [], domains: [] });

    const result = parseClassificationResponse(response);

    expect(result.skills).toHaveLength(0);
    expect(result.domains).toHaveLength(0);
  });

  it('handles multiple skills and domains', () => {
    const response = JSON.stringify({
      skills: [
        { slug: 'skill1', confidence: 0.9 },
        { slug: 'skill2', confidence: 0.8 },
        { slug: 'skill3', confidence: 0.7 },
      ],
      domains: [
        { slug: 'domain1', confidence: 0.85 },
        { slug: 'domain2', confidence: 0.75 },
      ],
    });

    const result = parseClassificationResponse(response);

    expect(result.skills).toHaveLength(3);
    expect(result.domains).toHaveLength(2);
  });
});

describe('calculateOverallConfidence', () => {
  it('calculates average confidence from skills and domains', () => {
    const skills = [
      { slug: 'skill1', confidence: 0.9 },
      { slug: 'skill2', confidence: 0.8 },
    ];
    const domains = [{ slug: 'domain1', confidence: 1.0 }];

    const result = calculateOverallConfidence(skills, domains);

    // (0.9 + 0.8 + 1.0) / 3 = 0.9
    expect(result).toBe(0.9);
  });

  it('returns 0 for empty arrays', () => {
    const result = calculateOverallConfidence([], []);
    expect(result).toBe(0);
  });

  it('handles skills only', () => {
    const skills = [{ slug: 'skill1', confidence: 0.5 }];
    const result = calculateOverallConfidence(skills, []);
    expect(result).toBe(0.5);
  });

  it('handles domains only', () => {
    const domains = [{ slug: 'domain1', confidence: 0.75 }];
    const result = calculateOverallConfidence([], domains);
    expect(result).toBe(0.75);
  });

  it('rounds to 2 decimal places', () => {
    const skills = [
      { slug: 'skill1', confidence: 0.333 },
      { slug: 'skill2', confidence: 0.333 },
      { slug: 'skill3', confidence: 0.333 },
    ];

    const result = calculateOverallConfidence(skills, []);

    // Average should be ~0.333, rounded to 0.33
    expect(result).toBe(0.33);
  });

  it('handles single item', () => {
    const skills = [{ slug: 'skill1', confidence: 0.95 }];
    const result = calculateOverallConfidence(skills, []);
    expect(result).toBe(0.95);
  });

  it('handles perfect confidence', () => {
    const skills = [{ slug: 'skill1', confidence: 1.0 }];
    const domains = [{ slug: 'domain1', confidence: 1.0 }];
    const result = calculateOverallConfidence(skills, domains);
    expect(result).toBe(1.0);
  });

  it('handles zero confidence', () => {
    const skills = [{ slug: 'skill1', confidence: 0 }];
    const domains = [{ slug: 'domain1', confidence: 0 }];
    const result = calculateOverallConfidence(skills, domains);
    expect(result).toBe(0);
  });

  it('handles mixed high and low confidence', () => {
    const skills = [
      { slug: 'skill1', confidence: 1.0 },
      { slug: 'skill2', confidence: 0.0 },
    ];
    const result = calculateOverallConfidence(skills, []);
    expect(result).toBe(0.5);
  });
});
