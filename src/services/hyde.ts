/**
 * HyDE (Hypothetical Document Embeddings) Service
 * @module services/hyde
 *
 * Generates hypothetical agent descriptions from user queries
 * for improved semantic search accuracy.
 *
 * Instead of embedding the user's query directly, we generate
 * a hypothetical "ideal" agent description and embed that.
 *
 * Reference: https://arxiv.org/abs/2212.10496
 */

import { GoogleGenerativeAI } from '@google/generative-ai';
import type { Env } from '../types';

/**
 * HyDE service configuration
 */
export interface HyDEConfig {
  /** Google AI API key */
  googleApiKey: string;
  /** Model to use (default: gemini-2.0-flash) */
  model?: string;
  /** Enable caching of generated descriptions */
  enableCache?: boolean;
  /** Maximum cache size (default: 1000) */
  maxCacheSize?: number;
}

/**
 * HyDE generation result
 */
export interface HyDEResult {
  /** Original user query */
  originalQuery: string;
  /** Generated hypothetical agent description */
  hypotheticalDescription: string;
  /** Time taken to generate (ms) */
  generationTimeMs: number;
  /** Whether result was from cache */
  cached: boolean;
  /** Model used for generation */
  modelUsed: string;
}

/**
 * HyDE Service for query expansion
 */
export class HyDEService {
  private readonly genAI: GoogleGenerativeAI;
  private readonly modelName: string;
  private readonly cache: Map<string, string>;
  private readonly enableCache: boolean;
  private readonly maxCacheSize: number;

  constructor(config: HyDEConfig) {
    this.genAI = new GoogleGenerativeAI(config.googleApiKey);
    this.modelName = config.model ?? 'gemini-2.0-flash';
    this.cache = new Map();
    this.enableCache = config.enableCache ?? true;
    this.maxCacheSize = config.maxCacheSize ?? 1000;
  }

  /**
   * Generate a hypothetical agent description for a search query
   */
  async generateHypotheticalAgent(query: string): Promise<HyDEResult> {
    const startTime = Date.now();

    // Check cache first
    const cacheKey = query.toLowerCase().trim();
    if (this.enableCache && this.cache.has(cacheKey)) {
      return {
        originalQuery: query,
        hypotheticalDescription: this.cache.get(cacheKey)!,
        generationTimeMs: Date.now() - startTime,
        cached: true,
        modelUsed: this.modelName,
      };
    }

    // Skip HyDE for very short queries (likely just filters)
    if (query.trim().length < 5) {
      return {
        originalQuery: query,
        hypotheticalDescription: this.fallbackEnhancement(query),
        generationTimeMs: Date.now() - startTime,
        cached: false,
        modelUsed: 'fallback',
      };
    }

    const model = this.genAI.getGenerativeModel({ model: this.modelName });

    const prompt = this.buildPrompt(query);

    try {
      const result = await model.generateContent(prompt);
      const response = result.response;
      const text = response.text();

      // Extract the description from the response
      const description = this.parseResponse(text);

      // Cache the result
      if (this.enableCache) {
        this.cache.set(cacheKey, description);
        // Limit cache size using FIFO eviction
        if (this.cache.size > this.maxCacheSize) {
          const firstKey = this.cache.keys().next().value;
          if (firstKey) this.cache.delete(firstKey);
        }
      }

      return {
        originalQuery: query,
        hypotheticalDescription: description,
        generationTimeMs: Date.now() - startTime,
        cached: false,
        modelUsed: this.modelName,
      };
    } catch (error) {
      // Fallback: return enhanced query if LLM fails
      console.error('HyDE generation failed:', error);
      return {
        originalQuery: query,
        hypotheticalDescription: this.fallbackEnhancement(query),
        generationTimeMs: Date.now() - startTime,
        cached: false,
        modelUsed: 'fallback',
      };
    }
  }

  /**
   * Build the prompt for hypothetical agent generation
   */
  private buildPrompt(query: string): string {
    return `You are helping improve search for an AI agent registry (ERC-8004).

Given a user's search query, generate a detailed description of an IDEAL AI agent that would perfectly match what the user is looking for.

The description should include:
- A descriptive name for the agent
- What the agent does (capabilities)
- What skills it has (e.g., data analysis, code generation, natural language processing)
- What domains it operates in (e.g., finance, healthcare, technology)
- What protocols it supports (MCP for tool use, A2A for agent-to-agent communication)
- Example use cases

User query: "${query}"

Generate ONLY the hypothetical agent description, no explanations or preamble.
Be specific and detailed but concise (200-300 words max).
Write in a natural descriptive style, as if you're describing an actual agent profile.

Hypothetical Agent:`;
  }

  /**
   * Parse the LLM response to extract the description
   */
  private parseResponse(response: string): string {
    // Clean up the response
    let description = response.trim();

    // Remove any markdown formatting
    description = description.replace(/^#+\s*/gm, '');
    description = description.replace(/\*\*/g, '');
    description = description.replace(/\*/g, '');
    description = description.replace(/^[-•]\s*/gm, '');

    // Limit length to avoid embedding issues
    if (description.length > 2000) {
      description = description.substring(0, 2000);
    }

    return description;
  }

  /**
   * Fallback enhancement if LLM fails or query is too short
   */
  private fallbackEnhancement(query: string): string {
    // Simple query expansion with common agent-related terms
    const expansions = [
      query,
      `AI agent that ${query}`,
      `Agent with capabilities for ${query}`,
      `Automated assistant for ${query}`,
    ];
    return expansions.join('. ');
  }

  /**
   * Check if HyDE should be used for this query
   * Returns false for very short queries or obvious filter-only requests
   */
  shouldUseHyDE(query: string): boolean {
    const trimmed = query.trim();
    // Skip for very short queries
    if (trimmed.length < 5) return false;
    // Skip for queries that look like single words that are likely filter values
    if (/^[a-z0-9_-]+$/i.test(trimmed) && trimmed.length < 20) return false;
    return true;
  }

  /**
   * Clear the cache
   */
  clearCache(): void {
    this.cache.clear();
  }

  /**
   * Get cache statistics
   */
  getCacheStats(): { size: number; enabled: boolean; maxSize: number } {
    return {
      size: this.cache.size,
      enabled: this.enableCache,
      maxSize: this.maxCacheSize,
    };
  }
}

/**
 * Create a HyDE service instance from environment
 */
export function createHyDEService(env: Env): HyDEService | null {
  // Check if HyDE is explicitly disabled
  if (env.HYDE_ENABLED === 'false') {
    return null;
  }

  // Need Google AI API key for HyDE
  if (!env.GOOGLE_AI_API_KEY) {
    console.warn('HyDE disabled: GOOGLE_AI_API_KEY not configured');
    return null;
  }

  return new HyDEService({
    googleApiKey: env.GOOGLE_AI_API_KEY,
    model: env.HYDE_MODEL ?? 'gemini-2.0-flash',
    enableCache: true,
  });
}
