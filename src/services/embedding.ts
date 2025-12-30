/**
 * Embedding service for generating vector embeddings
 * Supports Venice AI (primary) and OpenAI (fallback)
 * @module services/embedding
 */

/**
 * Embedding provider type
 */
export type EmbeddingProvider = 'venice' | 'openai';

/**
 * Embedding service configuration
 */
export interface EmbeddingConfig {
  /** Venice AI API key */
  veniceApiKey?: string;
  /** OpenAI API key (fallback) */
  openaiApiKey?: string;
  /** Model to use (default: text-embedding-bge-m3 for Venice) */
  model?: string;
  /** Vector dimensions (default: 1024) */
  dimensions?: number;
  /** Request timeout in ms */
  timeout?: number;
}

/**
 * Embedding request
 */
export interface EmbeddingRequest {
  /** Text to embed */
  input: string | string[];
  /** Optional model override */
  model?: string;
  /** Optional dimensions override */
  dimensions?: number;
}

/**
 * Embedding response
 */
export interface EmbeddingResponse {
  /** Generated embeddings */
  embeddings: number[][];
  /** Model used */
  model: string;
  /** Provider used */
  provider: EmbeddingProvider;
  /** Total tokens used */
  totalTokens?: number;
}

/**
 * Venice/OpenAI API response format
 */
interface OpenAIEmbeddingResponse {
  object: 'list';
  data: Array<{
    object: 'embedding';
    index: number;
    embedding: number[];
  }>;
  model: string;
  usage?: {
    prompt_tokens: number;
    total_tokens: number;
  };
}

/**
 * Default models by provider
 */
const DEFAULT_MODELS: Record<EmbeddingProvider, string> = {
  venice: 'text-embedding-bge-m3',
  openai: 'text-embedding-3-small',
};

/**
 * API endpoints by provider
 */
const API_ENDPOINTS: Record<EmbeddingProvider, string> = {
  venice: 'https://api.venice.ai/api/v1/embeddings',
  openai: 'https://api.openai.com/v1/embeddings',
};

/**
 * Embedding service class
 */
export class EmbeddingService {
  private readonly config: Required<EmbeddingConfig>;
  private readonly provider: EmbeddingProvider;

  constructor(config: EmbeddingConfig) {
    // Determine provider based on available keys
    if (config.veniceApiKey) {
      this.provider = 'venice';
    } else if (config.openaiApiKey) {
      this.provider = 'openai';
    } else {
      throw new Error('At least one API key (Venice or OpenAI) is required');
    }

    this.config = {
      veniceApiKey: config.veniceApiKey ?? '',
      openaiApiKey: config.openaiApiKey ?? '',
      model: config.model ?? DEFAULT_MODELS[this.provider],
      dimensions: config.dimensions ?? 1024,
      timeout: config.timeout ?? 30000,
    };
  }

  /**
   * Get the API key for the current provider
   */
  private getApiKey(): string {
    return this.provider === 'venice' ? this.config.veniceApiKey : this.config.openaiApiKey;
  }

  /**
   * Generate embeddings for input text
   */
  async embed(request: EmbeddingRequest): Promise<EmbeddingResponse> {
    const inputs = Array.isArray(request.input) ? request.input : [request.input];
    const model = request.model ?? this.config.model;
    const dimensions = request.dimensions ?? this.config.dimensions;

    // Validate inputs
    if (inputs.length === 0) {
      throw new Error('Input cannot be empty');
    }

    for (const input of inputs) {
      if (input.length === 0) {
        throw new Error('Input text cannot be empty');
      }
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.config.timeout);

    try {
      const response = await fetch(API_ENDPOINTS[this.provider], {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.getApiKey()}`,
        },
        body: JSON.stringify({
          input: inputs,
          model,
          dimensions,
          encoding_format: 'float',
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Embedding API error ${response.status}: ${errorText}`);
      }

      const data = (await response.json()) as OpenAIEmbeddingResponse;

      // Sort by index to ensure correct order
      const sortedData = [...data.data].sort((a, b) => a.index - b.index);

      return {
        embeddings: sortedData.map((d) => d.embedding),
        model: data.model,
        provider: this.provider,
        totalTokens: data.usage?.total_tokens,
      };
    } finally {
      clearTimeout(timeoutId);
    }
  }

  /**
   * Generate embedding for a single text
   */
  async embedSingle(text: string): Promise<number[]> {
    const response = await this.embed({ input: text });
    const embedding = response.embeddings[0];
    if (!embedding) {
      throw new Error('No embedding returned for input text');
    }
    return embedding;
  }

  /**
   * Generate embeddings for multiple texts in batches
   */
  async embedBatch(
    texts: string[],
    options?: { batchSize?: number; onProgress?: (completed: number, total: number) => void }
  ): Promise<number[][]> {
    const batchSize = options?.batchSize ?? 100;
    const results: number[][] = [];

    for (let i = 0; i < texts.length; i += batchSize) {
      const batch = texts.slice(i, i + batchSize);
      const response = await this.embed({ input: batch });
      results.push(...response.embeddings);

      if (options?.onProgress) {
        options.onProgress(Math.min(i + batchSize, texts.length), texts.length);
      }
    }

    return results;
  }

  /**
   * Get embedding for agent text (name + description)
   */
  async embedAgent(agent: { name: string; description: string }): Promise<number[]> {
    const text = formatAgentText(agent.name, agent.description);
    return this.embedSingle(text);
  }

  /**
   * Get embeddings for multiple agents
   */
  async embedAgents(
    agents: Array<{ id: string; name: string; description: string }>,
    options?: { onProgress?: (completed: number, total: number) => void }
  ): Promise<Map<string, number[]>> {
    const texts = agents.map((a) => formatAgentText(a.name, a.description));
    const embeddings = await this.embedBatch(texts, options);

    const result = new Map<string, number[]>();
    for (let i = 0; i < agents.length; i++) {
      const agent = agents[i];
      const embedding = embeddings[i];
      if (agent && embedding) {
        result.set(agent.id, embedding);
      }
    }

    return result;
  }

  /**
   * Get the provider being used
   */
  getProvider(): EmbeddingProvider {
    return this.provider;
  }

  /**
   * Get the model being used
   */
  getModel(): string {
    return this.config.model;
  }

  /**
   * Get the dimensions being used
   */
  getDimensions(): number {
    return this.config.dimensions;
  }
}

/**
 * Format agent name and description for embedding
 */
export function formatAgentText(name: string, description: string): string {
  // Combine name and description with clear separation
  // Truncate to stay within token limits (approx 8192 tokens = ~32KB)
  const combined = `${name}\n\n${description}`;
  const maxLength = 30000; // Leave some buffer for tokenization overhead

  if (combined.length > maxLength) {
    return combined.slice(0, maxLength);
  }

  return combined;
}

/**
 * Create embedding service from environment
 */
export function createEmbeddingService(env: {
  VENICE_API_KEY?: string;
  OPENAI_API_KEY?: string;
  EMBEDDING_MODEL?: string;
}): EmbeddingService {
  return new EmbeddingService({
    veniceApiKey: env.VENICE_API_KEY,
    openaiApiKey: env.OPENAI_API_KEY,
    model: env.EMBEDDING_MODEL,
  });
}

/**
 * Compute cosine similarity between two vectors
 */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) {
    throw new Error('Vectors must have the same length');
  }

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    const aVal = a[i] ?? 0;
    const bVal = b[i] ?? 0;
    dotProduct += aVal * bVal;
    normA += aVal * aVal;
    normB += bVal * bVal;
  }

  const magnitude = Math.sqrt(normA) * Math.sqrt(normB);
  if (magnitude === 0) {
    return 0;
  }

  return dotProduct / magnitude;
}
