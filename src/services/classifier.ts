/**
 * OASF Classifier service using Claude and Gemini APIs
 * @module services/classifier
 *
 * Primary provider: Google Gemini (fast and economical)
 * Fallback provider: Claude (reliable backup)
 */

import Anthropic from '@anthropic-ai/sdk';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { buildClassificationPrompt } from '@/lib/oasf/prompt';
import { validateDomainSlug, validateSkillSlug } from '@/lib/oasf/taxonomy';
import type {
  AgentClassificationInput,
  ClassificationResult,
  DomainClassification,
  SkillClassification,
} from '@/types';

/**
 * Classification result with provider info
 */
export interface ClassificationResultWithProvider extends ClassificationResult {
  /** Which provider was used for classification */
  provider?: 'gemini' | 'claude';
}

/**
 * Classifier service interface
 */
export interface ClassifierService {
  /**
   * Classify an agent according to OASF taxonomy
   */
  classify(agent: AgentClassificationInput): Promise<ClassificationResultWithProvider>;

  /**
   * Check if the classifier is available
   */
  healthCheck(): Promise<boolean>;
}

/**
 * Expected JSON response from LLM
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
 * Sanitize classification result by filtering out invalid OASF slugs
 *
 * LLMs may return slugs that don't exist in the taxonomy. This function
 * filters them out to ensure only valid slugs are stored in the database.
 *
 * @param skills - Raw skill classifications from LLM
 * @param domains - Raw domain classifications from LLM
 * @returns Sanitized classifications with only valid slugs
 * @internal Exported for testing
 */
export function sanitizeClassification(
  skills: SkillClassification[],
  domains: DomainClassification[]
): { skills: SkillClassification[]; domains: DomainClassification[]; invalidSlugs: string[] } {
  const invalidSlugs: string[] = [];

  // Filter skills - keep only valid OASF slugs
  const validSkills = skills.filter((s) => {
    const isValid = validateSkillSlug(s.slug);
    if (!isValid) {
      invalidSlugs.push(`skill:${s.slug}`);
    }
    return isValid;
  });

  // Filter domains - keep only valid OASF slugs
  const validDomains = domains.filter((d) => {
    const isValid = validateDomainSlug(d.slug);
    if (!isValid) {
      invalidSlugs.push(`domain:${d.slug}`);
    }
    return isValid;
  });

  // Log warning if any slugs were filtered
  if (invalidSlugs.length > 0) {
    console.warn(`Filtered invalid OASF slugs: ${invalidSlugs.join(', ')}`);
  }

  return { skills: validSkills, domains: validDomains, invalidSlugs };
}

/**
 * Default timeout for classification requests (30 seconds)
 */
const CLASSIFICATION_TIMEOUT_MS = 30_000;

/**
 * Create Claude classifier
 */
export function createClaudeClassifier(apiKey: string, model: string): ClassifierService {
  const anthropic = new Anthropic({
    apiKey,
    timeout: CLASSIFICATION_TIMEOUT_MS,
  });

  return {
    async classify(agent: AgentClassificationInput): Promise<ClassificationResultWithProvider> {
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
        throw new Error('No text content in Claude response');
      }

      const parsed = parseClassificationResponse(textContent.text);

      // Transform to our types
      const rawSkills: SkillClassification[] = parsed.skills.map((s) => ({
        slug: s.slug,
        confidence: s.confidence,
        reasoning: s.reasoning,
      }));

      const rawDomains: DomainClassification[] = parsed.domains.map((d) => ({
        slug: d.slug,
        confidence: d.confidence,
        reasoning: d.reasoning,
      }));

      // Sanitize - filter out invalid OASF slugs
      const { skills, domains } = sanitizeClassification(rawSkills, rawDomains);

      const confidence = calculateOverallConfidence(skills, domains);

      return {
        skills,
        domains,
        confidence,
        modelVersion: model,
        provider: 'claude',
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

/**
 * Create Gemini classifier
 */
export function createGeminiClassifier(apiKey: string, model: string): ClassifierService {
  const genAI = new GoogleGenerativeAI(apiKey);
  const geminiModel = genAI.getGenerativeModel({ model });

  return {
    async classify(agent: AgentClassificationInput): Promise<ClassificationResultWithProvider> {
      const prompt = buildClassificationPrompt(agent);

      const result = await geminiModel.generateContent(prompt);
      const response = result.response;
      const text = response.text();

      if (!text) {
        throw new Error('No content in Gemini response');
      }

      const parsed = parseClassificationResponse(text);

      // Transform to our types
      const rawSkills: SkillClassification[] = parsed.skills.map((s) => ({
        slug: s.slug,
        confidence: s.confidence,
        reasoning: s.reasoning,
      }));

      const rawDomains: DomainClassification[] = parsed.domains.map((d) => ({
        slug: d.slug,
        confidence: d.confidence,
        reasoning: d.reasoning,
      }));

      // Sanitize - filter out invalid OASF slugs
      const { skills, domains } = sanitizeClassification(rawSkills, rawDomains);

      const confidence = calculateOverallConfidence(skills, domains);

      return {
        skills,
        domains,
        confidence,
        modelVersion: model,
        provider: 'gemini',
      };
    },

    async healthCheck(): Promise<boolean> {
      try {
        const result = await geminiModel.generateContent('Reply with "ok"');
        const response = result.response;
        return response.text().length > 0;
      } catch {
        return false;
      }
    },
  };
}

/**
 * Create classifier service with Gemini as primary and Claude as fallback
 */
export function createClassifierService(
  geminiApiKey: string,
  geminiModel: string,
  claudeApiKey: string,
  claudeModel: string
): ClassifierService {
  const gemini = createGeminiClassifier(geminiApiKey, geminiModel);
  const claude = createClaudeClassifier(claudeApiKey, claudeModel);

  return {
    async classify(agent: AgentClassificationInput): Promise<ClassificationResultWithProvider> {
      // Try Gemini first
      try {
        return await gemini.classify(agent);
      } catch (geminiError) {
        console.warn(
          'Gemini classification failed, falling back to Claude:',
          geminiError instanceof Error ? geminiError.message : geminiError
        );

        // Fallback to Claude
        return await claude.classify(agent);
      }
    },

    async healthCheck(): Promise<boolean> {
      // Return true if at least one provider is healthy
      const [geminiHealthy, claudeHealthy] = await Promise.all([
        gemini.healthCheck(),
        claude.healthCheck(),
      ]);

      return geminiHealthy || claudeHealthy;
    },
  };
}
