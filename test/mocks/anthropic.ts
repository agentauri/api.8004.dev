/**
 * Anthropic API mock
 * @module test/mocks/anthropic
 */

import { vi } from 'vitest';

/**
 * Mock classification response
 */
export const mockClassificationResponse = {
  skills: [
    {
      slug: 'natural_language_processing',
      confidence: 0.95,
      reasoning: 'Agent description indicates text generation capabilities',
    },
  ],
  domains: [
    {
      slug: 'technology',
      confidence: 0.9,
      reasoning: 'Agent operates in software development domain',
    },
  ],
};

/**
 * Create mock Anthropic client
 */
export function createMockAnthropicClient() {
  return {
    messages: {
      create: vi.fn().mockResolvedValue({
        content: [
          {
            type: 'text',
            text: JSON.stringify(mockClassificationResponse),
          },
        ],
      }),
    },
  };
}

/**
 * Mock the Anthropic module
 */
export function mockAnthropicModule() {
  vi.mock('@anthropic-ai/sdk', () => ({
    default: class MockAnthropic {
      messages = {
        create: vi.fn().mockResolvedValue({
          content: [
            {
              type: 'text',
              text: JSON.stringify(mockClassificationResponse),
            },
          ],
        }),
      };
    },
  }));
}
