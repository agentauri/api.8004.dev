/**
 * Agent Complementarity Service
 * @module services/complementarity
 *
 * Finds agents that complement a given agent - agents that work well together
 * rather than agents that are substitutes (similar).
 *
 * Key concept:
 * - Similar agents share skills/domains (substitutes)
 * - Complementary agents have different skills/domains that together
 *   complete a capability set
 *
 * Examples:
 * - Code generator + Code reviewer
 * - Data fetcher + Data analyzer
 * - Translator + Content creator
 */

import type { Env } from '../types';
import { createQdrantSearchService } from './qdrant-search';

/**
 * Complementarity score breakdown
 */
export interface ComplementarityScore {
  /** Overall complementarity score (0-1) */
  overall: number;
  /** Skill complementarity score */
  skillScore: number;
  /** Domain overlap score (some overlap is good, too much means substitute) */
  domainScore: number;
  /** Protocol complementarity (MCP + A2A agents work well together) */
  protocolScore: number;
  /** Trust compatibility score */
  trustScore: number;
}

/**
 * Complementary agent result
 */
export interface ComplementaryAgent {
  /** Agent ID */
  agentId: string;
  /** Chain ID */
  chainId: number;
  /** Agent name */
  name: string;
  /** Agent description */
  description: string;
  /** Complementarity scores */
  complementarity: ComplementarityScore;
  /** Skills this agent adds */
  addedSkills: string[];
  /** Domains this agent adds */
  addedDomains: string[];
  /** Why this agent is complementary */
  reasons: string[];
}

/**
 * Complementarity analysis result
 */
export interface ComplementarityResult {
  /** Source agent ID */
  sourceAgentId: string;
  /** Complementary agents found */
  complementaryAgents: ComplementaryAgent[];
  /** Source agent's skills */
  sourceSkills: string[];
  /** Source agent's domains */
  sourceDomains: string[];
  /** Time taken to analyze (ms) */
  analysisTimeMs: number;
}

/**
 * Predefined skill complementarity pairs
 * Skills that work well together in workflows
 */
const COMPLEMENTARY_SKILL_PAIRS: Record<string, string[]> = {
  // Code workflow
  code_generation: ['code_review', 'testing', 'documentation_generation', 'debugging'],
  code_review: ['code_generation', 'testing', 'security_analysis'],
  testing: ['code_generation', 'code_review', 'debugging'],

  // Data workflow
  data_collection: ['data_analysis', 'data_visualization', 'data_cleaning'],
  data_analysis: ['data_visualization', 'report_generation', 'data_collection'],
  data_visualization: ['data_analysis', 'report_generation'],

  // Content workflow
  content_generation: ['translation', 'summarization', 'content_editing', 'fact_checking'],
  translation: ['content_generation', 'localization', 'summarization'],
  summarization: ['content_generation', 'translation', 'report_generation'],

  // Research workflow
  web_search: ['summarization', 'fact_checking', 'report_generation', 'data_analysis'],
  research: ['web_search', 'summarization', 'report_generation', 'citation'],
  fact_checking: ['research', 'web_search', 'content_editing'],

  // Communication workflow
  email_processing: ['scheduling', 'summarization', 'translation', 'sentiment_analysis'],
  scheduling: ['email_processing', 'calendar_management', 'notification'],

  // Security workflow
  security_analysis: ['code_review', 'vulnerability_scanning', 'penetration_testing'],
  vulnerability_scanning: ['security_analysis', 'code_review', 'monitoring'],

  // General AI
  natural_language_processing: ['sentiment_analysis', 'entity_extraction', 'classification'],
  image_generation: ['image_editing', 'image_analysis', 'content_generation'],
  speech_to_text: ['translation', 'summarization', 'sentiment_analysis'],
};

/**
 * Calculate skill complementarity score
 */
function calculateSkillComplementarity(
  sourceSkills: string[],
  targetSkills: string[]
): { score: number; addedSkills: string[] } {
  if (sourceSkills.length === 0 || targetSkills.length === 0) {
    return { score: 0.3, addedSkills: targetSkills };
  }

  // Find skills that target adds (not in source)
  const addedSkills = targetSkills.filter((s) => !sourceSkills.includes(s));

  // Check for known complementary pairs
  let pairScore = 0;
  for (const sourceSkill of sourceSkills) {
    const complementary = COMPLEMENTARY_SKILL_PAIRS[sourceSkill] ?? [];
    for (const targetSkill of targetSkills) {
      if (complementary.includes(targetSkill)) {
        pairScore += 0.3;
      }
    }
  }

  // Penalize too much overlap (substitutes, not complements)
  const overlapCount = targetSkills.filter((s) => sourceSkills.includes(s)).length;
  const overlapRatio = overlapCount / Math.max(sourceSkills.length, targetSkills.length);
  const overlapPenalty = overlapRatio > 0.7 ? 0.5 : overlapRatio > 0.5 ? 0.3 : 0;

  // Score: more added skills + known pairs - overlap penalty
  const addedRatio = addedSkills.length / targetSkills.length;
  const baseScore = addedRatio * 0.5 + Math.min(pairScore, 0.5);
  const score = Math.max(0, Math.min(1, baseScore - overlapPenalty));

  return { score, addedSkills };
}

/**
 * Calculate domain complementarity score
 */
function calculateDomainComplementarity(
  sourceDomains: string[],
  targetDomains: string[]
): { score: number; addedDomains: string[] } {
  if (sourceDomains.length === 0 || targetDomains.length === 0) {
    return { score: 0.5, addedDomains: targetDomains };
  }

  // Some domain overlap is good (agents can communicate about same topics)
  // But too much overlap means they're substitutes
  const addedDomains = targetDomains.filter((d) => !sourceDomains.includes(d));
  const overlapCount = targetDomains.filter((d) => sourceDomains.includes(d)).length;

  // Ideal: ~30-50% overlap
  const overlapRatio = overlapCount / targetDomains.length;
  let score = 0;

  if (overlapRatio >= 0.3 && overlapRatio <= 0.5) {
    // Ideal overlap range
    score = 0.9;
  } else if (overlapRatio < 0.3) {
    // Too little overlap - might not work well together
    score = 0.5 + overlapRatio;
  } else if (overlapRatio > 0.7) {
    // Too much overlap - substitutes
    score = 0.3;
  } else {
    // Acceptable range
    score = 0.7;
  }

  return { score, addedDomains };
}

/**
 * Calculate protocol complementarity score
 */
function calculateProtocolComplementarity(
  sourceHasMcp: boolean,
  sourceHasA2a: boolean,
  targetHasMcp: boolean,
  targetHasA2a: boolean
): number {
  // Agents with different protocols complement each other
  // MCP agents can use tools, A2A agents can coordinate

  // If both have same protocols, lower score
  if (sourceHasMcp === targetHasMcp && sourceHasA2a === targetHasA2a) {
    return 0.5;
  }

  // If one has MCP and other has A2A (different capabilities)
  if (sourceHasMcp !== targetHasMcp && sourceHasA2a !== targetHasA2a) {
    return 0.9;
  }

  // If target adds a protocol source doesn't have
  if ((!sourceHasMcp && targetHasMcp) || (!sourceHasA2a && targetHasA2a)) {
    return 0.8;
  }

  return 0.6;
}

/**
 * Calculate trust compatibility score
 */
function calculateTrustCompatibility(sourceTrusts: string[], targetTrusts: string[]): number {
  // Agents with compatible trust models work better together
  if (sourceTrusts.length === 0 && targetTrusts.length === 0) {
    return 0.5; // Unknown compatibility
  }

  // Check for common trust models
  const commonTrusts = sourceTrusts.filter((t) => targetTrusts.includes(t));
  if (commonTrusts.length > 0) {
    return 0.9; // Compatible trust models
  }

  // If one has x402 and other doesn't, they can still work together
  const hasX402 = sourceTrusts.includes('x402') || targetTrusts.includes('x402');
  if (hasX402) {
    return 0.7;
  }

  return 0.5;
}

/**
 * Generate reasons why agents are complementary
 */
function generateReasons(
  sourceSkills: string[],
  addedSkills: string[],
  addedDomains: string[],
  scores: ComplementarityScore
): string[] {
  const reasons: string[] = [];

  // Check for known complementary pairs
  for (const sourceSkill of sourceSkills) {
    const complementary = COMPLEMENTARY_SKILL_PAIRS[sourceSkill] ?? [];
    for (const addedSkill of addedSkills) {
      if (complementary.includes(addedSkill)) {
        reasons.push(
          `${addedSkill.replace(/_/g, ' ')} complements ${sourceSkill.replace(/_/g, ' ')}`
        );
      }
    }
  }

  // Add domain reasons
  if (addedDomains.length > 0 && addedDomains.length <= 3) {
    reasons.push(`Adds expertise in ${addedDomains.slice(0, 3).join(', ')}`);
  } else if (addedDomains.length > 3) {
    reasons.push(`Adds expertise in ${addedDomains.length} new domains`);
  }

  // Add skill reasons
  if (addedSkills.length > 0 && addedSkills.length <= 3) {
    reasons.push(
      `Provides ${addedSkills
        .slice(0, 3)
        .map((s) => s.replace(/_/g, ' '))
        .join(', ')}`
    );
  } else if (addedSkills.length > 3) {
    reasons.push(`Provides ${addedSkills.length} additional capabilities`);
  }

  // Add protocol reasons
  if (scores.protocolScore > 0.7) {
    reasons.push('Compatible protocol capabilities');
  }

  return reasons.slice(0, 5); // Limit to 5 reasons
}

/**
 * Find complementary agents for a given agent
 */
export async function findComplementaryAgents(
  env: Env,
  sourceAgentId: string,
  limit = 10
): Promise<ComplementarityResult> {
  const startTime = Date.now();

  // Get source agent from Qdrant
  const searchService = createQdrantSearchService(env);

  // Parse source agent ID
  const [chainIdStr, _tokenId] = sourceAgentId.split(':');
  const chainId = Number.parseInt(chainIdStr ?? '0', 10);

  // Search for agents with complementary skills
  // First, get the source agent's details
  const sourceResult = await searchService.search({
    limit: 1,
    filters: {
      chainIds: [chainId],
    },
  });

  // Find source agent in results or use empty defaults
  let sourceSkills: string[] = [];
  let sourceDomains: string[] = [];
  let sourceHasMcp = false;
  let sourceHasA2a = false;
  const sourceTrusts: string[] = [];

  // Get source agent details from the search
  const sourceAgent = sourceResult.results.find((r) => r.agentId === sourceAgentId);
  if (sourceAgent?.metadata) {
    sourceSkills = sourceAgent.metadata.skills ?? [];
    sourceDomains = sourceAgent.metadata.domains ?? [];
    sourceHasMcp = sourceAgent.metadata.hasMcp ?? false;
    sourceHasA2a = sourceAgent.metadata.hasA2a ?? false;
    // Get trusts from metadata if available
  }

  // Get candidate agents (exclude source)
  const candidateResult = await searchService.search({
    limit: 100, // Get more candidates to filter
  });

  const candidates = candidateResult.results.filter((r) => r.agentId !== sourceAgentId);

  // Score each candidate for complementarity
  const scoredCandidates: ComplementaryAgent[] = [];

  for (const candidate of candidates) {
    const targetSkills = candidate.metadata?.skills ?? [];
    const targetDomains = candidate.metadata?.domains ?? [];
    const targetHasMcp = candidate.metadata?.hasMcp ?? false;
    const targetHasA2a = candidate.metadata?.hasA2a ?? false;
    const targetTrusts: string[] = []; // TODO: get from metadata

    // Calculate complementarity scores
    const { score: skillScore, addedSkills } = calculateSkillComplementarity(
      sourceSkills,
      targetSkills
    );
    const { score: domainScore, addedDomains } = calculateDomainComplementarity(
      sourceDomains,
      targetDomains
    );
    const protocolScore = calculateProtocolComplementarity(
      sourceHasMcp,
      sourceHasA2a,
      targetHasMcp,
      targetHasA2a
    );
    const trustScore = calculateTrustCompatibility(sourceTrusts, targetTrusts);

    // Calculate overall score (weighted average)
    const overall = skillScore * 0.4 + domainScore * 0.25 + protocolScore * 0.2 + trustScore * 0.15;

    const scores: ComplementarityScore = {
      overall,
      skillScore,
      domainScore,
      protocolScore,
      trustScore,
    };

    // Generate reasons
    const reasons = generateReasons(sourceSkills, addedSkills, addedDomains, scores);

    // Only include if complementarity is significant
    if (overall >= 0.4) {
      scoredCandidates.push({
        agentId: candidate.agentId,
        chainId: candidate.chainId,
        name: candidate.name,
        description: candidate.description,
        complementarity: scores,
        addedSkills,
        addedDomains,
        reasons,
      });
    }
  }

  // Sort by overall complementarity score
  scoredCandidates.sort((a, b) => b.complementarity.overall - a.complementarity.overall);

  return {
    sourceAgentId,
    complementaryAgents: scoredCandidates.slice(0, limit),
    sourceSkills,
    sourceDomains,
    analysisTimeMs: Date.now() - startTime,
  };
}

/**
 * I/O Compatible Agent result
 */
export interface IOCompatibleAgent {
  /** Agent ID */
  agentId: string;
  /** Chain ID */
  chainId: number;
  /** Agent name */
  name: string;
  /** Agent description */
  description: string;
  /** Compatibility score (0-100) */
  score: number;
  /** Matching I/O modes */
  matchedModes: string[];
  /** Direction of compatibility */
  direction: 'upstream' | 'downstream';
}

/**
 * I/O Compatibility result
 */
export interface IOCompatibilityResult {
  /** Source agent ID */
  sourceAgentId: string;
  /** Source agent input modes */
  sourceInputModes: string[];
  /** Source agent output modes */
  sourceOutputModes: string[];
  /** Agents that can send data to source (their output matches source's input) */
  upstream: IOCompatibleAgent[];
  /** Agents that can receive data from source (their input matches source's output) */
  downstream: IOCompatibleAgent[];
  /** Analysis time in ms */
  analysisTimeMs: number;
}

/**
 * Calculate I/O mode overlap score
 */
function calculateIOScore(
  sourceModes: string[],
  targetModes: string[]
): { score: number; matchedModes: string[] } {
  if (sourceModes.length === 0 || targetModes.length === 0) {
    return { score: 0, matchedModes: [] };
  }

  const matchedModes = sourceModes.filter((m) => targetModes.includes(m));

  if (matchedModes.length === 0) {
    return { score: 0, matchedModes: [] };
  }

  // Score based on how much overlap there is
  const sourceRatio = matchedModes.length / sourceModes.length;
  const targetRatio = matchedModes.length / targetModes.length;

  // Use geometric mean for balanced scoring
  const score = Math.round(Math.sqrt(sourceRatio * targetRatio) * 100);

  return { score, matchedModes };
}

/**
 * Find I/O compatible agents for a given agent
 *
 * Upstream: Agents whose output_modes match source's input_modes
 *           (these agents can send data TO the source agent)
 *
 * Downstream: Agents whose input_modes match source's output_modes
 *             (these agents can receive data FROM the source agent)
 */
export async function findIOCompatibleAgents(
  env: Env,
  sourceAgentId: string,
  limit = 10
): Promise<IOCompatibilityResult> {
  const startTime = Date.now();

  const searchService = createQdrantSearchService(env);

  // Get all agents to analyze (we need to check their I/O modes)
  const allResult = await searchService.search({
    limit: 500, // Get a good sample
  });

  // Find source agent
  const sourceAgent = allResult.results.find((r) => r.agentId === sourceAgentId);
  const sourceInputModes = sourceAgent?.metadata?.inputModes ?? [];
  const sourceOutputModes = sourceAgent?.metadata?.outputModes ?? [];

  // If source has no I/O modes defined, return empty results
  if (sourceInputModes.length === 0 && sourceOutputModes.length === 0) {
    return {
      sourceAgentId,
      sourceInputModes,
      sourceOutputModes,
      upstream: [],
      downstream: [],
      analysisTimeMs: Date.now() - startTime,
    };
  }

  const upstream: IOCompatibleAgent[] = [];
  const downstream: IOCompatibleAgent[] = [];

  for (const agent of allResult.results) {
    if (agent.agentId === sourceAgentId) continue;

    const agentInputModes = agent.metadata?.inputModes ?? [];
    const agentOutputModes = agent.metadata?.outputModes ?? [];

    // Check upstream compatibility (agent's output → source's input)
    if (sourceInputModes.length > 0 && agentOutputModes.length > 0) {
      const { score, matchedModes } = calculateIOScore(sourceInputModes, agentOutputModes);
      if (score > 0) {
        upstream.push({
          agentId: agent.agentId,
          chainId: agent.chainId,
          name: agent.name,
          description: agent.description,
          score,
          matchedModes,
          direction: 'upstream',
        });
      }
    }

    // Check downstream compatibility (source's output → agent's input)
    if (sourceOutputModes.length > 0 && agentInputModes.length > 0) {
      const { score, matchedModes } = calculateIOScore(sourceOutputModes, agentInputModes);
      if (score > 0) {
        downstream.push({
          agentId: agent.agentId,
          chainId: agent.chainId,
          name: agent.name,
          description: agent.description,
          score,
          matchedModes,
          direction: 'downstream',
        });
      }
    }
  }

  // Sort by score descending
  upstream.sort((a, b) => b.score - a.score);
  downstream.sort((a, b) => b.score - a.score);

  return {
    sourceAgentId,
    sourceInputModes,
    sourceOutputModes,
    upstream: upstream.slice(0, limit),
    downstream: downstream.slice(0, limit),
    analysisTimeMs: Date.now() - startTime,
  };
}
