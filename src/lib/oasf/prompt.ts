/**
 * OASF Classification prompt builder
 * @module lib/oasf/prompt
 */

import type { AgentClassificationInput } from '@/types';
import { DOMAIN_TAXONOMY, OASF_VERSION, SKILL_TAXONOMY } from './taxonomy';

/**
 * Format taxonomy tree for prompt
 */
function formatTaxonomyTree(
  categories: Array<{
    slug: string;
    name: string;
    children?: Array<{ slug: string; name: string }>;
  }>
): string {
  const lines: string[] = [];

  for (const category of categories) {
    lines.push(`- ${category.slug}: ${category.name}`);
    if (category.children) {
      for (const child of category.children) {
        lines.push(`  - ${category.slug}/${child.slug}: ${child.name}`);
      }
    }
  }

  return lines.join('\n');
}

/**
 * Build classification prompt for an agent
 */
export function buildClassificationPrompt(agent: AgentClassificationInput): string {
  const skillTree = formatTaxonomyTree(SKILL_TAXONOMY);
  const domainTree = formatTaxonomyTree(DOMAIN_TAXONOMY);

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

## Available Skill Categories

${skillTree}

## Available Domain Categories

${domainTree}

## Classification Rules

1. Assign 1-5 most relevant skills that describe what the agent CAN DO
2. Assign 1-3 most relevant domains that describe WHERE the agent operates
3. Use the most specific subcategory when applicable (e.g., "natural_language_processing/text_generation" instead of just "natural_language_processing")
4. Provide a confidence score (0.0-1.0) for each classification
5. If the agent's capabilities are unclear, use the parent category with lower confidence
6. Consider both the description AND the tools/skills when classifying

## Response Format

Return a JSON object with this exact structure:

\`\`\`json
{
  "skills": [
    {"slug": "category/subcategory", "confidence": 0.95, "reasoning": "Brief explanation"}
  ],
  "domains": [
    {"slug": "domain/subdomain", "confidence": 0.85, "reasoning": "Brief explanation"}
  ]
}
\`\`\`

Important:
- Use only slugs from the taxonomy above
- Confidence should be between 0.0 and 1.0
- Include reasoning for each classification
- Ensure skills and domains arrays are not empty

Classify this agent now:`;
}
