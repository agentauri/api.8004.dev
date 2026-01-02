/**
 * Agent Team Composition Service
 * @module services/compose
 *
 * Helps users build a team of complementary agents for a given task.
 * Uses LLM to analyze task requirements and match with available agents.
 *
 * Key features:
 * - Task requirement analysis
 * - Skill gap detection
 * - Team optimization for coverage and complementarity
 * - Role assignment for each agent
 */

import type { Env } from '../types';
import type { AgentPayload } from '../lib/qdrant/types';
import { createQdrantSearchService } from './qdrant-search';

/**
 * Skill requirement with priority
 */
export interface SkillRequirement {
  /** Skill slug */
  skill: string;
  /** Priority: required, preferred, optional */
  priority: 'required' | 'preferred' | 'optional';
  /** Why this skill is needed */
  reason: string;
}

/**
 * Domain requirement
 */
export interface DomainRequirement {
  /** Domain slug */
  domain: string;
  /** Priority: required, preferred, optional */
  priority: 'required' | 'preferred' | 'optional';
}

/**
 * Task analysis result
 */
export interface TaskAnalysis {
  /** Original task description */
  task: string;
  /** Identified required skills */
  requiredSkills: SkillRequirement[];
  /** Identified required domains */
  requiredDomains: DomainRequirement[];
  /** Suggested team size */
  suggestedTeamSize: number;
  /** Key workflow steps */
  workflowSteps: string[];
  /** Analysis time in ms */
  analysisTimeMs: number;
}

/**
 * Agent role in the team
 */
export interface TeamMember {
  /** Agent ID */
  agentId: string;
  /** Chain ID */
  chainId: number;
  /** Agent name */
  name: string;
  /** Agent description */
  description: string;
  /** Assigned role in the team */
  role: string;
  /** Skills this agent contributes */
  contributedSkills: string[];
  /** Domains this agent covers */
  contributedDomains: string[];
  /** Fitness score for this role (0-1) */
  fitnessScore: number;
  /** Has MCP endpoint */
  hasMcp: boolean;
  /** Has A2A endpoint */
  hasA2a: boolean;
}

/**
 * Team composition result
 */
export interface TeamComposition {
  /** Task analysis */
  analysis: TaskAnalysis;
  /** Team members with roles */
  team: TeamMember[];
  /** Overall team fitness score (0-1) */
  teamFitnessScore: number;
  /** Skills covered by the team */
  coveredSkills: string[];
  /** Skills not covered (gaps) */
  skillGaps: string[];
  /** Domains covered by the team */
  coveredDomains: string[];
  /** Total composition time in ms */
  compositionTimeMs: number;
}

/**
 * Compose request parameters
 */
export interface ComposeRequest {
  /** Task or goal description */
  task: string;
  /** Preferred team size (1-10) */
  teamSize?: number;
  /** Required skills to include */
  requiredSkills?: string[];
  /** Required domains to include */
  requiredDomains?: string[];
  /** Minimum agent reputation score */
  minReputation?: number;
  /** Require MCP-enabled agents */
  requireMcp?: boolean;
  /** Require A2A-enabled agents */
  requireA2a?: boolean;
  /** Chain ID filter */
  chainIds?: number[];
}

/**
 * Predefined skill clusters for common workflows
 * Used when LLM analysis is not available
 */
const SKILL_CLUSTERS: Record<string, string[]> = {
  // Development workflow
  development: [
    'code_generation',
    'code_review',
    'testing',
    'debugging',
    'documentation_generation',
  ],
  // Data pipeline
  data_pipeline: ['data_collection', 'data_cleaning', 'data_analysis', 'data_visualization'],
  // Content creation
  content_creation: [
    'content_generation',
    'translation',
    'summarization',
    'content_editing',
    'image_generation',
  ],
  // Research workflow
  research: ['web_search', 'research', 'summarization', 'fact_checking', 'report_generation'],
  // Customer support
  customer_support: [
    'natural_language_processing',
    'sentiment_analysis',
    'email_processing',
    'ticket_routing',
  ],
  // Security audit
  security: [
    'security_analysis',
    'code_review',
    'vulnerability_scanning',
    'penetration_testing',
    'monitoring',
  ],
};

/**
 * Analyze task to extract skill requirements
 * Uses keyword matching as fallback when LLM is not available
 */
function analyzeTaskKeywords(task: string): {
  skills: SkillRequirement[];
  domains: DomainRequirement[];
  teamSize: number;
} {
  const taskLower = task.toLowerCase();
  const skills: SkillRequirement[] = [];
  const domains: DomainRequirement[] = [];

  // Check for workflow cluster matches
  for (const [cluster, clusterSkills] of Object.entries(SKILL_CLUSTERS)) {
    if (
      taskLower.includes(cluster) ||
      taskLower.includes(cluster.replace('_', ' '))
    ) {
      for (const skill of clusterSkills.slice(0, 3)) {
        skills.push({
          skill,
          priority: 'required',
          reason: `Part of ${cluster} workflow`,
        });
      }
    }
  }

  // Keyword to skill mappings
  const keywordSkillMap: Record<string, string[]> = {
    code: ['code_generation', 'code_review'],
    coding: ['code_generation', 'code_review'],
    programming: ['code_generation', 'code_review'],
    develop: ['code_generation', 'testing'],
    test: ['testing', 'debugging'],
    debug: ['debugging', 'testing'],
    data: ['data_analysis', 'data_visualization'],
    analyze: ['data_analysis', 'research'],
    research: ['research', 'web_search', 'summarization'],
    search: ['web_search', 'research'],
    write: ['content_generation', 'documentation_generation'],
    content: ['content_generation', 'content_editing'],
    translate: ['translation'],
    summarize: ['summarization'],
    email: ['email_processing'],
    schedule: ['scheduling', 'calendar_management'],
    security: ['security_analysis', 'vulnerability_scanning'],
    image: ['image_generation', 'image_analysis'],
    document: ['documentation_generation', 'summarization'],
    report: ['report_generation', 'data_visualization'],
    chat: ['natural_language_processing', 'conversation'],
    answer: ['question_answering', 'research'],
    automate: ['workflow_automation', 'task_automation'],
    monitor: ['monitoring', 'alerting'],
  };

  for (const [keyword, keywordSkills] of Object.entries(keywordSkillMap)) {
    if (taskLower.includes(keyword)) {
      for (const skill of keywordSkills) {
        if (!skills.find((s) => s.skill === skill)) {
          skills.push({
            skill,
            priority: 'preferred',
            reason: `Keyword "${keyword}" detected in task`,
          });
        }
      }
    }
  }

  // Keyword to domain mappings
  const keywordDomainMap: Record<string, string[]> = {
    finance: ['finance', 'banking'],
    money: ['finance', 'payment'],
    health: ['healthcare', 'medical'],
    medical: ['healthcare', 'medical'],
    legal: ['legal', 'compliance'],
    education: ['education', 'training'],
    marketing: ['marketing', 'advertising'],
    sales: ['sales', 'crm'],
    hr: ['human_resources', 'recruitment'],
    tech: ['technology', 'software'],
    software: ['technology', 'software'],
    ecommerce: ['ecommerce', 'retail'],
    travel: ['travel', 'hospitality'],
    real: ['real_estate'],
    crypto: ['cryptocurrency', 'blockchain'],
    blockchain: ['cryptocurrency', 'blockchain'],
  };

  for (const [keyword, keywordDomains] of Object.entries(keywordDomainMap)) {
    if (taskLower.includes(keyword)) {
      for (const domain of keywordDomains) {
        if (!domains.find((d) => d.domain === domain)) {
          domains.push({
            domain,
            priority: 'preferred',
          });
        }
      }
    }
  }

  // Estimate team size based on task complexity
  const words = task.split(/\s+/).length;
  const hasMultiple = taskLower.includes('and') || taskLower.includes(',');
  let teamSize = 2;
  if (words > 30 || hasMultiple) teamSize = 3;
  if (skills.length > 5) teamSize = 4;
  if (skills.length > 8) teamSize = 5;

  return { skills, domains, teamSize };
}

/**
 * Calculate agent fitness for a role
 */
function calculateAgentFitness(
  agentSkills: string[],
  agentDomains: string[],
  requiredSkills: string[],
  requiredDomains: string[]
): { score: number; matchedSkills: string[]; matchedDomains: string[] } {
  const matchedSkills = agentSkills.filter((s) => requiredSkills.includes(s));
  const matchedDomains = agentDomains.filter((d) => requiredDomains.includes(d));

  const skillScore =
    requiredSkills.length > 0 ? matchedSkills.length / requiredSkills.length : 0;
  const domainScore =
    requiredDomains.length > 0 ? matchedDomains.length / requiredDomains.length : 0;

  // Weight skills more heavily than domains
  const score = skillScore * 0.7 + domainScore * 0.3;

  return { score, matchedSkills, matchedDomains };
}

/**
 * Assign role based on agent's primary skills
 */
function assignRole(skills: string[]): string {
  if (skills.length === 0) return 'General Assistant';

  const roleMap: Record<string, string> = {
    code_generation: 'Developer',
    code_review: 'Code Reviewer',
    testing: 'QA Engineer',
    debugging: 'Debugger',
    data_analysis: 'Data Analyst',
    data_visualization: 'Data Visualizer',
    content_generation: 'Content Creator',
    translation: 'Translator',
    summarization: 'Summarizer',
    research: 'Researcher',
    web_search: 'Research Assistant',
    email_processing: 'Email Handler',
    scheduling: 'Scheduler',
    security_analysis: 'Security Analyst',
    image_generation: 'Image Creator',
    natural_language_processing: 'NLP Specialist',
    report_generation: 'Report Writer',
    documentation_generation: 'Technical Writer',
    fact_checking: 'Fact Checker',
    monitoring: 'Monitor',
  };

  // Return the role for the first matched skill
  for (const skill of skills) {
    if (roleMap[skill]) {
      return roleMap[skill];
    }
  }

  // Fallback: capitalize first skill
  const firstSkill = skills[0] ?? 'assistant';
  return firstSkill
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

/**
 * Compose a team of agents for a given task
 */
export async function composeTeam(
  env: Env,
  request: ComposeRequest
): Promise<TeamComposition> {
  const startTime = Date.now();

  // Analyze task requirements
  const analysisStartTime = Date.now();
  const { skills, domains, teamSize: suggestedSize } = analyzeTaskKeywords(request.task);

  // Merge with explicit requirements
  const requiredSkills = [
    ...skills,
    ...(request.requiredSkills ?? []).map((s) => ({
      skill: s,
      priority: 'required' as const,
      reason: 'Explicitly required',
    })),
  ];

  const requiredDomains = [
    ...domains,
    ...(request.requiredDomains ?? []).map((d) => ({
      domain: d,
      priority: 'required' as const,
    })),
  ];

  const teamSize = request.teamSize ?? Math.min(suggestedSize, 5);

  // Extract workflow steps from task
  const workflowSteps = request.task
    .split(/[.;,]/)
    .map((s) => s.trim())
    .filter((s) => s.length > 10)
    .slice(0, 5);

  const analysis: TaskAnalysis = {
    task: request.task,
    requiredSkills,
    requiredDomains,
    suggestedTeamSize: teamSize,
    workflowSteps,
    analysisTimeMs: Date.now() - analysisStartTime,
  };

  // Search for candidate agents
  const searchService = createQdrantSearchService(env);

  // Build search filters
  const filters: Record<string, unknown> = {};
  if (request.chainIds && request.chainIds.length > 0) {
    filters.chainIds = request.chainIds;
  }
  if (request.requireMcp) {
    filters.mcp = true;
  }
  if (request.requireA2a) {
    filters.a2a = true;
  }

  // Get skill slugs for filtering
  const skillSlugs = requiredSkills.map((s) => s.skill);
  if (skillSlugs.length > 0) {
    filters.skills = skillSlugs;
  }

  const domainSlugs = requiredDomains.map((d) => d.domain);
  if (domainSlugs.length > 0) {
    filters.domains = domainSlugs;
  }

  // Search for candidates
  const searchResult = await searchService.search({
    query: request.task,
    limit: 100, // Get more candidates to filter
    filters: filters as Parameters<typeof searchService.search>[0]['filters'],
  });

  // Filter by reputation if specified
  let candidates = searchResult.results;
  if (request.minReputation !== undefined) {
    candidates = candidates.filter(
      (c) =>
        c.metadata?.reputation !== undefined &&
        c.metadata.reputation >= (request.minReputation ?? 0)
    );
  }

  // Score and rank candidates
  const scoredCandidates = candidates.map((candidate) => {
    const agentSkills = candidate.metadata?.skills ?? [];
    const agentDomains = candidate.metadata?.domains ?? [];

    const { score, matchedSkills, matchedDomains } = calculateAgentFitness(
      agentSkills,
      agentDomains,
      skillSlugs,
      domainSlugs
    );

    return {
      candidate,
      score,
      matchedSkills,
      matchedDomains,
    };
  });

  // Sort by score descending
  scoredCandidates.sort((a, b) => b.score - a.score);

  // Select team members ensuring skill coverage
  const team: TeamMember[] = [];
  const coveredSkills = new Set<string>();
  const coveredDomains = new Set<string>();

  for (const { candidate, score, matchedSkills, matchedDomains } of scoredCandidates) {
    if (team.length >= teamSize) break;

    // Skip if this agent doesn't add any new skills
    const newSkills = matchedSkills.filter((s) => !coveredSkills.has(s));
    const newDomains = matchedDomains.filter((d) => !coveredDomains.has(d));

    // Prefer agents that add new skills, but also include high-scoring agents
    if (newSkills.length === 0 && newDomains.length === 0 && score < 0.7) {
      continue;
    }

    // Add to team
    const role = assignRole(matchedSkills);
    team.push({
      agentId: candidate.agentId,
      chainId: candidate.chainId,
      name: candidate.name,
      description: candidate.description,
      role,
      contributedSkills: matchedSkills,
      contributedDomains: matchedDomains,
      fitnessScore: score,
      hasMcp: candidate.metadata?.hasMcp ?? false,
      hasA2a: candidate.metadata?.hasA2a ?? false,
    });

    // Track covered skills/domains
    for (const skill of matchedSkills) coveredSkills.add(skill);
    for (const domain of matchedDomains) coveredDomains.add(domain);
  }

  // Calculate skill gaps
  const skillGaps = skillSlugs.filter((s) => !coveredSkills.has(s));

  // Calculate team fitness score
  const coverageScore =
    skillSlugs.length > 0 ? 1 - skillGaps.length / skillSlugs.length : 1;
  const avgFitness =
    team.length > 0 ? team.reduce((sum, m) => sum + m.fitnessScore, 0) / team.length : 0;
  const teamFitnessScore = coverageScore * 0.6 + avgFitness * 0.4;

  return {
    analysis,
    team,
    teamFitnessScore,
    coveredSkills: Array.from(coveredSkills),
    skillGaps,
    coveredDomains: Array.from(coveredDomains),
    compositionTimeMs: Date.now() - startTime,
  };
}
