/**
 * Cross-Encoder Reranking Service
 * @module services/reranker
 *
 * Re-ranks search results using cross-encoder scoring for improved precision.
 * Uses LLM-based relevance scoring to compare query-document pairs.
 *
 * Reference: https://arxiv.org/abs/2010.08240
 */

import { GoogleGenerativeAI } from '@google/generative-ai';
import type { Env } from '../types';
import type { SearchResultItem } from '../types/search';

/**
 * Reranker configuration
 */
export interface RerankerConfig {
  /** Google AI API key */
  googleApiKey: string;
  /** Model to use for reranking (default: gemini-2.0-flash) */
  model?: string;
  /** Number of top results to rerank (default: 50) */
  topK?: number;
  /** Timeout in ms (default: 10000) */
  timeout?: number;
}

/**
 * Reranking result for a single item
 */
export interface RerankScore {
  /** Original item index */
  index: number;
  /** Relevance score from reranker (0-1) */
  score: number;
  /** Reasoning for the score (optional) */
  reasoning?: string;
}

/**
 * Reranking result
 */
export interface RerankResult {
  /** Reranked items in order of relevance */
  items: SearchResultItem[];
  /** Time taken to rerank (ms) */
  rerankTimeMs: number;
  /** Number of items reranked */
  itemsReranked: number;
  /** Model used for reranking */
  modelUsed: string;
}

/**
 * Cross-Encoder Reranker Service
 */
export class RerankerService {
  private readonly genAI: GoogleGenerativeAI;
  private readonly modelName: string;
  private readonly topK: number;
  private readonly timeout: number;

  constructor(config: RerankerConfig) {
    this.genAI = new GoogleGenerativeAI(config.googleApiKey);
    this.modelName = config.model ?? 'gemini-2.0-flash';
    this.topK = config.topK ?? 50;
    this.timeout = config.timeout ?? 10000;
  }

  /**
   * Rerank search results based on relevance to query
   */
  async rerank(query: string, items: SearchResultItem[]): Promise<RerankResult> {
    const startTime = Date.now();

    // Only rerank top K items
    const itemsToRerank = items.slice(0, this.topK);
    const remainingItems = items.slice(this.topK);

    // If we have few items, skip reranking
    if (itemsToRerank.length <= 3) {
      return {
        items,
        rerankTimeMs: Date.now() - startTime,
        itemsReranked: 0,
        modelUsed: 'skip',
      };
    }

    try {
      const scores = await this.scoreItems(query, itemsToRerank);

      // Sort by reranker score (descending)
      const reranked = scores
        .sort((a, b) => b.score - a.score)
        .map((s) => {
          const item = itemsToRerank[s.index];
          if (!item) return null;
          // Update score to be the reranker score
          return {
            ...item,
            score: s.score,
            rerankerScore: s.score,
            originalScore: item.score,
          };
        })
        .filter((item): item is SearchResultItem & { rerankerScore: number; originalScore: number } => item !== null);

      // Append remaining items at the end
      const result = [...reranked, ...remainingItems];

      return {
        items: result,
        rerankTimeMs: Date.now() - startTime,
        itemsReranked: itemsToRerank.length,
        modelUsed: this.modelName,
      };
    } catch (error) {
      console.error('Reranking failed:', error);
      // Return original order on error
      return {
        items,
        rerankTimeMs: Date.now() - startTime,
        itemsReranked: 0,
        modelUsed: 'error',
      };
    }
  }

  /**
   * Score items using LLM-based relevance assessment
   */
  private async scoreItems(query: string, items: SearchResultItem[]): Promise<RerankScore[]> {
    const model = this.genAI.getGenerativeModel({ model: this.modelName });

    // Build prompt for batch scoring
    const prompt = this.buildScoringPrompt(query, items);

    const result = await model.generateContent(prompt);
    const response = result.response;
    const text = response.text();

    return this.parseScores(text, items.length);
  }

  /**
   * Build prompt for relevance scoring
   */
  private buildScoringPrompt(query: string, items: SearchResultItem[]): string {
    const itemDescriptions = items
      .map((item, idx) => {
        const skills = item.metadata?.skills?.join(', ') || 'none';
        const domains = item.metadata?.domains?.join(', ') || 'none';
        return `[${idx}] "${item.name}": ${item.description?.substring(0, 200) || 'No description'}
Skills: ${skills}
Domains: ${domains}`;
      })
      .join('\n\n');

    return `You are a relevance scoring system for an AI agent registry.

USER QUERY: "${query}"

AGENTS TO SCORE:
${itemDescriptions}

For each agent, rate its relevance to the user's query on a scale of 0.0 to 1.0.
Consider:
- How well the agent's capabilities match the query intent
- Relevance of skills and domains
- Specificity of the match

Return ONLY a JSON array with scores, no explanation. Format:
[{"index": 0, "score": 0.95}, {"index": 1, "score": 0.72}, ...]

Include ALL ${items.length} agents in your response.`;
  }

  /**
   * Parse LLM response to extract scores
   */
  private parseScores(response: string, expectedCount: number): RerankScore[] {
    // Extract JSON array from response
    const jsonMatch = response.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      console.error('Failed to parse reranker response:', response);
      // Return default scores
      return Array.from({ length: expectedCount }, (_, i) => ({
        index: i,
        score: 0.5,
      }));
    }

    try {
      const parsed = JSON.parse(jsonMatch[0]) as Array<{ index: number; score: number }>;

      // Validate and normalize scores
      const scores: RerankScore[] = [];
      for (let i = 0; i < expectedCount; i++) {
        const found = parsed.find((p) => p.index === i);
        if (found) {
          scores.push({
            index: found.index,
            score: Math.max(0, Math.min(1, found.score)),
          });
        } else {
          // Default score for missing items
          scores.push({ index: i, score: 0.5 });
        }
      }

      return scores;
    } catch (error) {
      console.error('Failed to parse reranker JSON:', error);
      return Array.from({ length: expectedCount }, (_, i) => ({
        index: i,
        score: 0.5,
      }));
    }
  }

  /**
   * Get the number of items that will be reranked
   */
  getTopK(): number {
    return this.topK;
  }
}

/**
 * Create a reranker service instance from environment
 */
export function createRerankerService(env: Env): RerankerService | null {
  // Check if reranking is enabled
  if (env.RERANKER_ENABLED !== 'true') {
    return null;
  }

  // Need Google AI API key for reranking
  if (!env.GOOGLE_AI_API_KEY) {
    console.warn('Reranker disabled: GOOGLE_AI_API_KEY not configured');
    return null;
  }

  const topK = env.RERANKER_TOP_K ? Number.parseInt(env.RERANKER_TOP_K, 10) : 50;

  return new RerankerService({
    googleApiKey: env.GOOGLE_AI_API_KEY,
    model: env.RERANKER_MODEL ?? 'gemini-2.0-flash',
    topK,
  });
}
