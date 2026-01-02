/**
 * Content hash utilities for selective re-embedding
 *
 * Two types of hashes:
 * 1. embedHash - Hash of fields that affect the embedding vector
 *    If this changes, we need to re-generate the embedding
 * 2. contentHash - Hash of all payload fields
 *    If this changes, we need to update Qdrant (but may not need re-embedding)
 */

import type { EmbedFields } from '@/lib/ai/formatting';

// Re-export EmbedFields for backward compatibility
export type { EmbedFields };

/**
 * All payload fields for content hash
 */
export interface ContentFields {
  agentId: string;
  name: string;
  description: string;
  active: boolean;
  hasMcp: boolean;
  hasA2a: boolean;
  skills: string[];
  domains: string[];
  reputation: number;
}

/**
 * Compute a simple hash using Web Crypto API (available in Workers)
 */
async function computeHash(text: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(text);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  // Return first 16 hex chars for shorter hash
  return hashArray
    .slice(0, 8)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Compute hash of fields that affect the embedding.
 * If this changes, we need to re-generate the embedding.
 */
export async function computeEmbedHash(fields: EmbedFields): Promise<string> {
  const text = [
    fields.name ?? '',
    fields.description ?? '',
    (fields.mcpTools ?? []).sort().join(','),
    (fields.mcpPrompts ?? []).sort().join(','),
    (fields.mcpResources ?? []).sort().join(','),
    (fields.a2aSkills ?? []).sort().join(','),
    (fields.inputModes ?? []).sort().join(','),
    (fields.outputModes ?? []).sort().join(','),
  ].join('|');

  return computeHash(text);
}

/**
 * Compute hash of all payload fields.
 * If this changes, we need to update Qdrant payload.
 */
export async function computeContentHash(fields: ContentFields): Promise<string> {
  const text = [
    fields.agentId,
    fields.name ?? '',
    fields.description ?? '',
    String(fields.active),
    String(fields.hasMcp),
    String(fields.hasA2a),
    (fields.skills ?? []).sort().join(','),
    (fields.domains ?? []).sort().join(','),
    String(fields.reputation ?? 0),
  ].join('|');

  return computeHash(text);
}

/**
 * Synchronous hash for use in scripts (not in Workers)
 * Uses a simple djb2 hash algorithm
 */
export function computeHashSync(text: string): string {
  let hash = 5381;
  for (let i = 0; i < text.length; i++) {
    hash = (hash * 33) ^ text.charCodeAt(i);
  }
  // Convert to hex and take 16 chars
  return (hash >>> 0).toString(16).padStart(8, '0');
}

/**
 * Sync version of computeEmbedHash
 */
export function computeEmbedHashSync(fields: EmbedFields): string {
  const text = [
    fields.name ?? '',
    fields.description ?? '',
    (fields.mcpTools ?? []).sort().join(','),
    (fields.mcpPrompts ?? []).sort().join(','),
    (fields.mcpResources ?? []).sort().join(','),
    (fields.a2aSkills ?? []).sort().join(','),
    (fields.inputModes ?? []).sort().join(','),
    (fields.outputModes ?? []).sort().join(','),
  ].join('|');

  return computeHashSync(text);
}

/**
 * Sync version of computeContentHash
 */
export function computeContentHashSync(fields: ContentFields): string {
  const text = [
    fields.agentId,
    fields.name ?? '',
    fields.description ?? '',
    String(fields.active),
    String(fields.hasMcp),
    String(fields.hasA2a),
    (fields.skills ?? []).sort().join(','),
    (fields.domains ?? []).sort().join(','),
    String(fields.reputation ?? 0),
  ].join('|');

  return computeHashSync(text);
}
