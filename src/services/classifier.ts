/**
 * OASF Classifier service with multi-provider support
 * Primary: Google Gemini Flash - Fast and economical
 * Fallback: Claude Haiku - Reliable backup
 * @module services/classifier
 */

import { buildClassificationPrompt } from '@/lib/oasf/prompt';
import { validateDomainSlug, validateSkillSlug } from '@/lib/oasf/taxonomy';
import type {
  AgentClassificationInput,
  ClassificationProvider,
  ClassificationResult,
  DomainClassification,
  SkillClassification,
} from '@/types';
import Anthropic from '@anthropic-ai/sdk';
import { GoogleGenerativeAI } from '@google/generative-ai';

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
 * Handles various response formats: pure JSON, markdown code blocks, or JSON embedded in text
 * @internal Exported for testing
 */
export function parseClassificationResponse(content: string): ClassificationResponse {
  let jsonStr = content;

  // 1. Check for markdown code blocks
  const codeBlockMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (codeBlockMatch?.[1]) {
    jsonStr = codeBlockMatch[1];
  } else {
    // 2. Extract JSON object from text (find first { to last })
    // This handles cases where the model adds explanatory text before/after JSON
    const jsonObjectMatch = content.match(/\{[\s\S]*\}/);
    if (jsonObjectMatch) {
      jsonStr = jsonObjectMatch[0];
    }
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
 * Default timeout for classification requests (30 seconds)
 */
const CLASSIFICATION_TIMEOUT_MS = 30_000;

/**
 * Process raw classification response into validated result
 */
function processClassificationResponse(
  content: string,
  model: string,
  provider: ClassificationProvider
): ClassificationResult {
  const parsed = parseClassificationResponse(content);

  // Transform to our types and validate slugs against taxonomy
  // Filter out any invalid slugs that the model may have invented
  const skills: SkillClassification[] = parsed.skills
    .filter((s) => {
      const isValid = validateSkillSlug(s.slug);
      if (!isValid) {
        console.warn(`[${provider}] Invalid skill slug from classifier: ${s.slug}`);
      }
      return isValid;
    })
    .map((s) => ({
      slug: s.slug,
      confidence: s.confidence,
      reasoning: s.reasoning,
    }));

  const domains: DomainClassification[] = parsed.domains
    .filter((d) => {
      const isValid = validateDomainSlug(d.slug);
      if (!isValid) {
        console.warn(`[${provider}] Invalid domain slug from classifier: ${d.slug}`);
      }
      return isValid;
    })
    .map((d) => ({
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
    provider,
  };
}

/**
 * Create Gemini classifier (Gemini 1.5 Flash)
 * @internal
 */
export function createGeminiClassifier(apiKey: string, model: string): ClassifierService {
  const genAI = new GoogleGenerativeAI(apiKey);

  return {
    async classify(agent: AgentClassificationInput): Promise<ClassificationResult> {
      const prompt = buildClassificationPrompt(agent);

      const geminiModel = genAI.getGenerativeModel({
        model,
        generationConfig: {
          responseMimeType: 'application/json',
          temperature: 0,
          maxOutputTokens: 1024,
        },
      });

      // Create abort controller for timeout
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), CLASSIFICATION_TIMEOUT_MS);

      try {
        const result = await geminiModel.generateContent(prompt);
        clearTimeout(timeoutId);

        const response = result.response;
        const content = response.text();

        if (!content) {
          throw new Error('No content in Gemini response');
        }

        return processClassificationResponse(content, model, 'gemini');
      } catch (error) {
        clearTimeout(timeoutId);
        throw error;
      }
    },

    async healthCheck(): Promise<boolean> {
      try {
        const geminiModel = genAI.getGenerativeModel({ model });
        const result = await geminiModel.generateContent('Reply with "ok"');
        return result.response.text().length > 0;
      } catch {
        return false;
      }
    },
  };
}

/**
 * Create Claude classifier
 * @internal
 */
export function createClaudeClassifier(apiKey: string, model: string): ClassifierService {
  const anthropic = new Anthropic({
    apiKey,
    timeout: CLASSIFICATION_TIMEOUT_MS,
  });

  return {
    async classify(agent: AgentClassificationInput): Promise<ClassificationResult> {
      const prompt = buildClassificationPrompt(agent);

      const message = await anthropic.messages.create({
        model,
        max_tokens: 1024,
        temperature: 0,
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

      return processClassificationResponse(textContent.text, model, 'claude');
    },

    async healthCheck(): Promise<boolean> {
      try {
        const message = await anthropic.messages.create({
          model,
          max_tokens: 10,
          messages: [{ role: 'user', content: 'Reply with "ok"' }],
        });
        return message.content.length > 0;
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
  const geminiClassifier = createGeminiClassifier(geminiApiKey, geminiModel);
  const claudeClassifier = createClaudeClassifier(claudeApiKey, claudeModel);

  return {
    async classify(agent: AgentClassificationInput): Promise<ClassificationResult> {
      try {
        // Try Gemini first (fast and economical)
        return await geminiClassifier.classify(agent);
      } catch (error) {
        // Fallback to Claude on any Gemini error
        console.warn('Gemini classification failed, falling back to Claude:', error);
        return await claudeClassifier.classify(agent);
      }
    },

    async healthCheck(): Promise<boolean> {
      // Service is healthy if at least one provider works
      const [geminiHealthy, claudeHealthy] = await Promise.all([
        geminiClassifier.healthCheck(),
        claudeClassifier.healthCheck(),
      ]);
      return geminiHealthy || claudeHealthy;
    },
  };
}
