/**
 * Agent text formatting for embedding generation
 *
 * This is the SINGLE SOURCE OF TRUTH for all embedding text generation.
 * All sync workers and embedding services MUST use this function.
 *
 * Based on search-service specification:
 * - name + description + tags + capabilities + IO modes + selected metadata
 *
 * @module lib/ai/formatting
 * @see https://github.com/agent0lab/search-service/blob/search-marco/HowItWorks.md
 */

/**
 * Embedding format version - increment when format changes
 * This allows tracking which agents need re-embedding after format updates
 */
export const EMBEDDING_FORMAT_VERSION = '1.0.0';

/**
 * Maximum text length for embedding (30KB buffer for tokenization)
 */
export const MAX_EMBEDDING_TEXT_LENGTH = 30000;

/**
 * Fields used for embedding text generation
 * These are the fields that influence semantic search quality
 */
export interface EmbedFields {
  /** Agent name */
  name: string;
  /** Agent description */
  description: string;
  /** MCP tool names */
  mcpTools?: string[];
  /** MCP prompt names */
  mcpPrompts?: string[];
  /** MCP resource names */
  mcpResources?: string[];
  /** A2A skill names */
  a2aSkills?: string[];
  /** Input modes (e.g., 'text', 'image', 'audio') */
  inputModes?: string[];
  /** Output modes (e.g., 'text', 'json', 'image') */
  outputModes?: string[];
}

/**
 * Format agent data into text for embedding generation
 *
 * This function creates a consistent, deterministic text representation
 * of an agent that can be used for semantic search. The output format:
 *
 * ```
 * <name>
 *
 * <description>
 *
 * MCP Tools: tool1, tool2, tool3
 *
 * MCP Prompts: prompt1, prompt2
 *
 * MCP Resources: resource1, resource2
 *
 * A2A Skills: skill1, skill2, skill3
 *
 * Input modes: text, image
 *
 * Output modes: text, json
 * ```
 *
 * @param fields - The agent fields to format
 * @returns Formatted text for embedding, truncated to MAX_EMBEDDING_TEXT_LENGTH
 *
 * @example
 * ```typescript
 * const text = formatAgentText({
 *   name: 'DeFi Assistant',
 *   description: 'A helpful agent for DeFi operations',
 *   mcpTools: ['swap', 'bridge', 'stake'],
 *   a2aSkills: ['token_analysis'],
 * });
 * ```
 */
export function formatAgentText(fields: EmbedFields): string {
  const {
    name,
    description,
    mcpTools,
    mcpPrompts,
    mcpResources,
    a2aSkills,
    inputModes,
    outputModes,
  } = fields;

  // Build parts array, filtering out empty sections
  // Order is fixed for consistent hashing and embedding
  const parts: string[] = [name, description];

  // Add MCP tools if present
  if (mcpTools && mcpTools.length > 0) {
    const uniqueTools = [...new Set(mcpTools)].sort();
    parts.push(`MCP Tools: ${uniqueTools.join(', ')}`);
  }

  // Add MCP prompts if present
  if (mcpPrompts && mcpPrompts.length > 0) {
    const uniquePrompts = [...new Set(mcpPrompts)].sort();
    parts.push(`MCP Prompts: ${uniquePrompts.join(', ')}`);
  }

  // Add MCP resources if present
  if (mcpResources && mcpResources.length > 0) {
    const uniqueResources = [...new Set(mcpResources)].sort();
    parts.push(`MCP Resources: ${uniqueResources.join(', ')}`);
  }

  // Add A2A skills if present
  if (a2aSkills && a2aSkills.length > 0) {
    const uniqueSkills = [...new Set(a2aSkills)].sort();
    parts.push(`A2A Skills: ${uniqueSkills.join(', ')}`);
  }

  // Add input modes if present
  if (inputModes && inputModes.length > 0) {
    const uniqueInputModes = [...new Set(inputModes)].sort();
    parts.push(`Input modes: ${uniqueInputModes.join(', ')}`);
  }

  // Add output modes if present
  if (outputModes && outputModes.length > 0) {
    const uniqueOutputModes = [...new Set(outputModes)].sort();
    parts.push(`Output modes: ${uniqueOutputModes.join(', ')}`);
  }

  // Join with double newlines and truncate
  const text = parts.filter(Boolean).join('\n\n');

  if (text.length > MAX_EMBEDDING_TEXT_LENGTH) {
    return text.slice(0, MAX_EMBEDDING_TEXT_LENGTH);
  }

  return text;
}

/**
 * Legacy function signature for backward compatibility
 * @deprecated Use formatAgentText(fields) instead
 */
export function formatAgentTextLegacy(
  name: string,
  description: string,
  mcpTools?: string[],
  a2aSkills?: string[],
  inputModes?: string[],
  outputModes?: string[]
): string {
  return formatAgentText({
    name,
    description,
    mcpTools,
    a2aSkills,
    inputModes,
    outputModes,
  });
}
