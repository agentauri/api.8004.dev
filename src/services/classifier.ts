/**
 * OASF Classifier service using Claude API
 * @module services/classifier
 */

import { buildClassificationPrompt } from '@/lib/oasf/prompt';
import type {
  AgentClassificationInput,
  ClassificationResult,
  DomainClassification,
  SkillClassification,
} from '@/types';
import Anthropic from '@anthropic-ai/sdk';

/**
 * Classifier service interface
 */
export interface ClassifierService {
  /**
   * Classify an agent according to OASF taxonomy
   */
  classify(agent: AgentClassificationInput): Promise<ClassificationResult>;

  /**
   * Check if the classifier is available
   */
  healthCheck(): Promise<boolean>;
}

/**
 * Expected JSON response from Claude
 */
interface ClassificationResponse {
  skills: Array<{
    slug: string;
    confidence: number;
    reasoning?: string;
  }>;
  domains: Array<{
    slug: string;
    confidence: number;
    reasoning?: string;
  }>;
}

/**
 * Parse and validate classification response
 * @internal Exported for testing
 */
export function parseClassificationResponse(content: string): ClassificationResponse {
  // Extract JSON from response (handle markdown code blocks)
  let jsonStr = content;

  // Check for markdown code blocks
  const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (jsonMatch?.[1]) {
    jsonStr = jsonMatch[1];
  }

  try {
    const parsed = JSON.parse(jsonStr.trim()) as ClassificationResponse;

    // Validate structure
    if (!Array.isArray(parsed.skills) || !Array.isArray(parsed.domains)) {
      throw new Error('Invalid classification response structure');
    }

    return parsed;
  } catch (error) {
    throw new Error(`Failed to parse classification response: ${error}`);
  }
}

/**
 * Calculate overall confidence from skill and domain confidences
 * @internal Exported for testing
 */
export function calculateOverallConfidence(
  skills: SkillClassification[],
  domains: DomainClassification[]
): number {
  const allConfidences = [...skills.map((s) => s.confidence), ...domains.map((d) => d.confidence)];

  if (allConfidences.length === 0) return 0;

  const sum = allConfidences.reduce((a, b) => a + b, 0);
  return Math.round((sum / allConfidences.length) * 100) / 100;
}

/**
 * Create classifier service
 */
export function createClassifierService(apiKey: string, model: string): ClassifierService {
  const anthropic = new Anthropic({ apiKey });

  return {
    async classify(agent: AgentClassificationInput): Promise<ClassificationResult> {
      const prompt = buildClassificationPrompt(agent);

      const message = await anthropic.messages.create({
        model,
        max_tokens: 1024,
        messages: [
          {
            role: 'user',
            content: prompt,
          },
        ],
      });

      // Extract text content
      const textContent = message.content.find((c) => c.type === 'text');
      if (!textContent || textContent.type !== 'text') {
        throw new Error('No text content in classification response');
      }

      const parsed = parseClassificationResponse(textContent.text);

      // Transform to our types
      const skills: SkillClassification[] = parsed.skills.map((s) => ({
        slug: s.slug,
        confidence: s.confidence,
        reasoning: s.reasoning,
      }));

      const domains: DomainClassification[] = parsed.domains.map((d) => ({
        slug: d.slug,
        confidence: d.confidence,
        reasoning: d.reasoning,
      }));

      const confidence = calculateOverallConfidence(skills, domains);

      return {
        skills,
        domains,
        confidence,
        modelVersion: model,
      };
    },

    async healthCheck(): Promise<boolean> {
      try {
        // Simple test message to verify API connectivity
        const message = await anthropic.messages.create({
          model,
          max_tokens: 10,
          messages: [
            {
              role: 'user',
              content: 'Reply with "ok"',
            },
          ],
        });

        return message.content.length > 0;
      } catch {
        return false;
      }
    },
  };
}
