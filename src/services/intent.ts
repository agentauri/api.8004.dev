/**
 * Intent Templates Service
 *
 * Manages pre-defined workflow templates for multi-agent orchestration.
 * Each template defines a sequence of steps with required agent capabilities.
 *
 * Example workflow:
 * 1. Get template "data-analysis-pipeline"
 * 2. For each step, find agents matching requirements
 * 3. Validate I/O compatibility between adjacent steps
 * 4. Return matched agents per step
 *
 * @module services/intent
 */

import type { D1Database } from '@cloudflare/workers-types';
import type { Env } from '../types';
import { createQdrantSearchService } from './qdrant-search';

/**
 * Template step definition
 */
export interface TemplateStep {
  id: string;
  templateId: string;
  stepOrder: number;
  role: string;
  description: string | null;
  requiredSkills: string[];
  requiredInputModes: string[];
  requiredOutputModes: string[];
  optionalSkills: string[];
  minReputation: number;
  requireMcp: boolean;
  requireA2a: boolean;
}

/**
 * Intent template
 */
export interface IntentTemplate {
  id: string;
  name: string;
  description: string;
  category: string;
  isActive: boolean;
  isFeatured: boolean;
  usageCount: number;
  steps: TemplateStep[];
  createdAt: string;
  updatedAt: string;
}

/**
 * Matched agent for a step
 */
export interface MatchedAgent {
  agentId: string;
  chainId: number;
  name: string;
  description: string;
  matchScore: number; // 0-100
  matchedSkills: string[];
  missingSkills: string[];
  hasRequiredInputModes: boolean;
  hasRequiredOutputModes: boolean;
  meetsReputation: boolean;
  hasMcp: boolean;
  hasA2a: boolean;
}

/**
 * Step match result
 */
export interface StepMatchResult {
  step: TemplateStep;
  matchedAgents: MatchedAgent[];
  bestMatch: MatchedAgent | null;
  ioCompatibleWithPrevious: boolean;
  ioCompatibleWithNext: boolean;
}

/**
 * Template match result
 */
export interface TemplateMatchResult {
  template: IntentTemplate;
  steps: StepMatchResult[];
  isComplete: boolean; // All steps have at least one match
  canExecute: boolean; // All steps are I/O compatible
  totalAgentsMatched: number;
}

/**
 * Raw template row from D1
 */
interface TemplateRow {
  id: string;
  name: string;
  description: string;
  category: string;
  is_active: number;
  is_featured: number;
  usage_count: number;
  created_at: string;
  updated_at: string;
}

/**
 * Raw step row from D1
 */
interface StepRow {
  id: string;
  template_id: string;
  step_order: number;
  role: string;
  description: string | null;
  required_skills: string | null;
  required_input_modes: string | null;
  required_output_modes: string | null;
  optional_skills: string | null;
  min_reputation: number;
  require_mcp: number;
  require_a2a: number;
}

/**
 * Parse JSON array or return empty array
 */
function parseJsonArray(value: string | null): string[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    console.error('Failed to parse JSON array value:', { value, error });
    return [];
  }
}

/**
 * Intent Service
 */
export class IntentService {
  constructor(
    private readonly db: D1Database,
    private readonly env: Env
  ) {}

  /**
   * Get all templates
   */
  async getTemplates(
    options: { category?: string; featuredOnly?: boolean; activeOnly?: boolean } = {}
  ): Promise<IntentTemplate[]> {
    const { category, featuredOnly = false, activeOnly = true } = options;

    let query = 'SELECT * FROM intent_templates WHERE 1=1';
    const params: (string | number)[] = [];

    if (activeOnly) {
      query += ' AND is_active = 1';
    }
    if (featuredOnly) {
      query += ' AND is_featured = 1';
    }
    if (category) {
      query += ' AND category = ?';
      params.push(category);
    }

    query += ' ORDER BY is_featured DESC, usage_count DESC';

    const { results: templateRows } = await this.db
      .prepare(query)
      .bind(...params)
      .all<TemplateRow>();

    const templates: IntentTemplate[] = [];
    for (const row of templateRows) {
      const steps = await this.getStepsForTemplate(row.id);
      templates.push({
        id: row.id,
        name: row.name,
        description: row.description,
        category: row.category,
        isActive: row.is_active === 1,
        isFeatured: row.is_featured === 1,
        usageCount: row.usage_count,
        steps,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      });
    }

    return templates;
  }

  /**
   * Get a single template by ID
   */
  async getTemplate(templateId: string): Promise<IntentTemplate | null> {
    const row = await this.db
      .prepare('SELECT * FROM intent_templates WHERE id = ?')
      .bind(templateId)
      .first<TemplateRow>();

    if (!row) return null;

    const steps = await this.getStepsForTemplate(templateId);

    return {
      id: row.id,
      name: row.name,
      description: row.description,
      category: row.category,
      isActive: row.is_active === 1,
      isFeatured: row.is_featured === 1,
      usageCount: row.usage_count,
      steps,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  /**
   * Get steps for a template
   */
  private async getStepsForTemplate(templateId: string): Promise<TemplateStep[]> {
    const { results: stepRows } = await this.db
      .prepare(
        `SELECT * FROM intent_template_steps
         WHERE template_id = ?
         ORDER BY step_order`
      )
      .bind(templateId)
      .all<StepRow>();

    return stepRows.map((row) => ({
      id: row.id,
      templateId: row.template_id,
      stepOrder: row.step_order,
      role: row.role,
      description: row.description,
      requiredSkills: parseJsonArray(row.required_skills),
      requiredInputModes: parseJsonArray(row.required_input_modes),
      requiredOutputModes: parseJsonArray(row.required_output_modes),
      optionalSkills: parseJsonArray(row.optional_skills),
      minReputation: row.min_reputation,
      requireMcp: row.require_mcp === 1,
      requireA2a: row.require_a2a === 1,
    }));
  }

  /**
   * Match agents to a template
   */
  async matchTemplate(
    templateId: string,
    constraints: {
      chainIds?: number[];
      minReputation?: number;
      limit?: number;
    } = {}
  ): Promise<TemplateMatchResult | null> {
    const template = await this.getTemplate(templateId);
    if (!template) return null;

    const { chainIds, minReputation, limit = 5 } = constraints;
    const searchService = createQdrantSearchService(this.env);

    const stepResults: StepMatchResult[] = [];

    for (const step of template.steps) {
      // Build filters for this step
      const filters: Record<string, unknown> = {};

      if (chainIds && chainIds.length > 0) {
        filters.chainIds = chainIds;
      }

      if (step.requiredSkills.length > 0) {
        filters.skills = step.requiredSkills;
      }

      if (step.requireMcp) {
        filters.mcp = true;
      }

      if (step.requireA2a) {
        filters.a2a = true;
      }

      // Search for agents matching this step
      const searchResult = await searchService.search({
        limit: 50, // Get more candidates to filter
        filters,
      });

      // Score and filter candidates
      const matchedAgents: MatchedAgent[] = [];

      for (const result of searchResult.results) {
        const agentSkills = result.metadata?.skills ?? [];
        const agentInputModes = result.metadata?.inputModes ?? [];
        const agentOutputModes = result.metadata?.outputModes ?? [];
        const agentReputation = result.metadata?.reputation ?? 0;
        const hasMcp = result.metadata?.hasMcp ?? false;
        const hasA2a = result.metadata?.hasA2a ?? false;

        // Calculate skill match
        const matchedSkills = step.requiredSkills.filter((s) => agentSkills.includes(s));
        const missingSkills = step.requiredSkills.filter((s) => !agentSkills.includes(s));

        // Skip if missing required skills (unless no skills required)
        if (step.requiredSkills.length > 0 && matchedSkills.length === 0) {
          continue;
        }

        // Check I/O modes
        const hasRequiredInputModes =
          step.requiredInputModes.length === 0 ||
          step.requiredInputModes.some((m) => agentInputModes.includes(m));
        const hasRequiredOutputModes =
          step.requiredOutputModes.length === 0 ||
          step.requiredOutputModes.some((m) => agentOutputModes.includes(m));

        // Check reputation
        const effectiveMinRep = Math.max(step.minReputation, minReputation ?? 0);
        const meetsReputation = agentReputation >= effectiveMinRep;

        // Check protocol requirements
        if (step.requireMcp && !hasMcp) continue;
        if (step.requireA2a && !hasA2a) continue;

        // Calculate match score
        let score = 0;

        // Skill match contribution (40%)
        if (step.requiredSkills.length > 0) {
          score += (matchedSkills.length / step.requiredSkills.length) * 40;
        } else {
          score += 40; // Full score if no skills required
        }

        // I/O compatibility (30%)
        if (hasRequiredInputModes) score += 15;
        if (hasRequiredOutputModes) score += 15;

        // Reputation bonus (15%)
        if (meetsReputation) {
          score += Math.min(15, (agentReputation / 100) * 15);
        }

        // Protocol bonus (15%)
        if (hasMcp) score += 7.5;
        if (hasA2a) score += 7.5;

        matchedAgents.push({
          agentId: result.agentId,
          chainId: result.chainId,
          name: result.name,
          description: result.description,
          matchScore: Math.round(score),
          matchedSkills,
          missingSkills,
          hasRequiredInputModes,
          hasRequiredOutputModes,
          meetsReputation,
          hasMcp,
          hasA2a,
        });
      }

      // Sort by match score
      matchedAgents.sort((a, b) => b.matchScore - a.matchScore);

      // Limit results
      const topMatches = matchedAgents.slice(0, limit);

      stepResults.push({
        step,
        matchedAgents: topMatches,
        bestMatch: topMatches[0] ?? null,
        ioCompatibleWithPrevious: true, // Will check later
        ioCompatibleWithNext: true, // Will check later
      });
    }

    // Check I/O compatibility between adjacent steps
    for (let i = 0; i < stepResults.length - 1; i++) {
      const currentStep = stepResults[i];
      const nextStep = stepResults[i + 1];

      if (!currentStep || !nextStep) continue;

      // Check if current step's output matches next step's input
      const currentBest = currentStep.bestMatch;
      const nextBest = nextStep.bestMatch;

      if (currentBest && nextBest) {
        // For now, assume compatible if both have required modes
        // In production, we'd check actual mode overlap
        const ioCompatible = currentBest.hasRequiredOutputModes && nextBest.hasRequiredInputModes;

        currentStep.ioCompatibleWithNext = ioCompatible;
        nextStep.ioCompatibleWithPrevious = ioCompatible;
      }
    }

    // Calculate overall status
    const isComplete = stepResults.every((s) => s.matchedAgents.length > 0);
    const canExecute =
      isComplete && stepResults.every((s) => s.ioCompatibleWithPrevious && s.ioCompatibleWithNext);
    const totalAgentsMatched = stepResults.reduce((sum, s) => sum + s.matchedAgents.length, 0);

    // Increment usage count
    await this.db
      .prepare(
        `UPDATE intent_templates
         SET usage_count = usage_count + 1, updated_at = datetime('now')
         WHERE id = ?`
      )
      .bind(templateId)
      .run();

    return {
      template,
      steps: stepResults,
      isComplete,
      canExecute,
      totalAgentsMatched,
    };
  }

  /**
   * Get template categories
   */
  async getCategories(): Promise<Array<{ category: string; count: number }>> {
    const { results } = await this.db
      .prepare(
        `SELECT category, COUNT(*) as count
         FROM intent_templates
         WHERE is_active = 1
         GROUP BY category
         ORDER BY count DESC`
      )
      .all<{ category: string; count: number }>();

    return results;
  }

  /**
   * Create a new template
   */
  async createTemplate(
    template: Omit<IntentTemplate, 'createdAt' | 'updatedAt' | 'usageCount'>
  ): Promise<IntentTemplate> {
    const now = new Date().toISOString();

    await this.db
      .prepare(
        `INSERT INTO intent_templates (id, name, description, category, is_active, is_featured, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .bind(
        template.id,
        template.name,
        template.description,
        template.category,
        template.isActive ? 1 : 0,
        template.isFeatured ? 1 : 0,
        now,
        now
      )
      .run();

    // Insert steps
    for (const step of template.steps) {
      await this.db
        .prepare(
          `INSERT INTO intent_template_steps
           (id, template_id, step_order, role, description, required_skills, required_input_modes, required_output_modes, optional_skills, min_reputation, require_mcp, require_a2a)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .bind(
          step.id,
          template.id,
          step.stepOrder,
          step.role,
          step.description,
          JSON.stringify(step.requiredSkills),
          JSON.stringify(step.requiredInputModes),
          JSON.stringify(step.requiredOutputModes),
          JSON.stringify(step.optionalSkills),
          step.minReputation,
          step.requireMcp ? 1 : 0,
          step.requireA2a ? 1 : 0
        )
        .run();
    }

    return {
      ...template,
      usageCount: 0,
      createdAt: now,
      updatedAt: now,
    };
  }
}

/**
 * Create an intent service instance
 */
export function createIntentService(db: D1Database, env: Env): IntentService {
  return new IntentService(db, env);
}
