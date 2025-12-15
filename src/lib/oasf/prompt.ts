/**
 * OASF Classification prompt builder
 * @module lib/oasf/prompt
 */

import type { AgentClassificationInput } from '@/types';
import { DOMAIN_TAXONOMY, OASF_VERSION, SKILL_TAXONOMY } from './taxonomy';

/**
 * Format taxonomy list for prompt (flat structure - no hierarchy)
 */
function formatTaxonomyList(
  categories: Array<{
    slug: string;
    name: string;
    description?: string;
  }>
): string {
  return categories.map((category) => `- ${category.slug}: ${category.name}`).join('\n');
}

/**
 * Build classification prompt for an agent
 */
export function buildClassificationPrompt(agent: AgentClassificationInput): string {
  const skillList = formatTaxonomyList(SKILL_TAXONOMY);
  const domainList = formatTaxonomyList(DOMAIN_TAXONOMY);

  const mcpToolsSection =
    agent.mcpTools && agent.mcpTools.length > 0
      ? `MCP Tools: ${agent.mcpTools.join(', ')}`
      : 'MCP Tools: None';

  const a2aSkillsSection =
    agent.a2aSkills && agent.a2aSkills.length > 0
      ? `A2A Skills: ${agent.a2aSkills.join(', ')}`
      : 'A2A Skills: None';

  return `You are an expert at classifying AI agents according to the OASF (Open Agentic Schema Framework) taxonomy v${OASF_VERSION}.

Analyze the following agent and classify it according to the taxonomy categories provided below.

## Agent Information

Name: ${agent.name}
Description: ${agent.description}
${mcpToolsSection}
${a2aSkillsSection}

## Available Skill Categories (15 categories)

${skillList}

## Available Domain Categories (24 categories)

${domainList}

## Classification Rules

1. Assign 1-5 most relevant skills that describe what the agent CAN DO
2. Assign 1-3 most relevant domains that describe WHERE the agent operates
3. Use ONLY the exact slugs from the lists above (no subcategories, no modifications)
4. Provide a confidence score (0.0-1.0) for each classification
5. Consider both the description AND the tools/skills when classifying
6. If unsure between categories, prefer the one with broader applicability

## Response Format

Return a JSON object with this exact structure:

\`\`\`json
{
  "skills": [
    {"slug": "skill_slug", "confidence": 0.95, "reasoning": "Brief explanation"}
  ],
  "domains": [
    {"slug": "domain_slug", "confidence": 0.85, "reasoning": "Brief explanation"}
  ]
}
\`\`\`

Important:
- Use ONLY slugs from the taxonomy lists above (exact match required)
- Confidence should be between 0.0 and 1.0
- Include reasoning for each classification
- Ensure skills and domains arrays are not empty

CRITICAL: Respond with ONLY the JSON object. No explanations, no markdown code blocks, no additional text before or after.
Your response must start with { and end with }

Classify this agent now:`;
}
