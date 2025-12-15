/**
 * OASF Taxonomy data (aligned with official OASF schema)
 * @module lib/oasf/taxonomy
 * @see https://github.com/agntcy/oasf
 */

import type { TaxonomyCategory, TaxonomyData, TaxonomyType } from '@/types';

/**
 * OASF Schema version
 */
export const OASF_VERSION = '1.0.0';

/**
 * Skill taxonomy categories (15 official categories)
 * Based on official OASF schema - flat structure, no hierarchies
 * @see https://github.com/agntcy/oasf
 */
export const SKILL_TAXONOMY: TaxonomyCategory[] = [
  {
    id: 1,
    slug: 'natural_language_processing',
    name: 'Natural Language Processing',
    description: 'Text understanding, generation, and language-related capabilities',
  },
  {
    id: 2,
    slug: 'images_computer_vision',
    name: 'Images / Computer Vision',
    description: 'Image processing, recognition, and visual understanding',
  },
  {
    id: 3,
    slug: 'audio',
    name: 'Audio',
    description: 'Audio processing, speech recognition, and sound analysis',
  },
  {
    id: 4,
    slug: 'tabular_text',
    name: 'Tabular / Text',
    description: 'Structured data processing and text extraction',
  },
  {
    id: 5,
    slug: 'analytical_skills',
    name: 'Analytical Skills',
    description: 'Data analysis, statistical processing, and insight generation',
  },
  {
    id: 6,
    slug: 'retrieval_augmented_generation',
    name: 'Retrieval Augmented Generation',
    description: 'Knowledge retrieval, RAG pipelines, and information synthesis',
  },
  {
    id: 7,
    slug: 'multi_modal',
    name: 'Multi-modal',
    description: 'Processing and generating content across multiple modalities',
  },
  {
    id: 8,
    slug: 'security_privacy',
    name: 'Security & Privacy',
    description: 'Security analysis, privacy protection, and threat detection',
  },
  {
    id: 9,
    slug: 'data_engineering',
    name: 'Data Engineering',
    description: 'Data pipelines, transformation, and infrastructure',
  },
  {
    id: 10,
    slug: 'agent_orchestration',
    name: 'Agent Orchestration',
    description: 'Multi-agent coordination, workflow automation, and task delegation',
  },
  {
    id: 11,
    slug: 'evaluation_monitoring',
    name: 'Evaluation & Monitoring',
    description: 'Performance evaluation, quality monitoring, and metrics tracking',
  },
  {
    id: 12,
    slug: 'devops_mlops',
    name: 'DevOps / MLOps',
    description: 'Development operations, ML operations, and deployment automation',
  },
  {
    id: 13,
    slug: 'governance_compliance',
    name: 'Governance & Compliance',
    description: 'Regulatory compliance, policy enforcement, and governance frameworks',
  },
  {
    id: 14,
    slug: 'tool_interaction',
    name: 'Tool Interaction',
    description: 'API integration, tool usage, and external system interaction',
  },
  {
    id: 15,
    slug: 'advanced_reasoning_planning',
    name: 'Advanced Reasoning & Planning',
    description: 'Complex reasoning, strategic planning, and decision making',
  },
];

/**
 * Domain taxonomy categories (24 official categories)
 * Based on official OASF schema - flat structure, no hierarchies
 * @see https://github.com/agntcy/oasf
 */
export const DOMAIN_TAXONOMY: TaxonomyCategory[] = [
  {
    id: 1,
    slug: 'technology',
    name: 'Technology',
    description: 'Software, IT, and technology services',
  },
  {
    id: 2,
    slug: 'finance_business',
    name: 'Finance and Business',
    description: 'Financial services, banking, and business operations',
  },
  {
    id: 3,
    slug: 'life_science',
    name: 'Life Science',
    description: 'Biotechnology, pharmaceuticals, and life sciences research',
  },
  {
    id: 4,
    slug: 'trust_safety',
    name: 'Trust and Safety',
    description: 'Content moderation, safety systems, and trust frameworks',
  },
  {
    id: 5,
    slug: 'human_resources',
    name: 'Human Resources',
    description: 'HR management, recruitment, and workforce operations',
  },
  {
    id: 6,
    slug: 'education',
    name: 'Education',
    description: 'Learning, training, and educational services',
  },
  {
    id: 7,
    slug: 'industrial_manufacturing',
    name: 'Industrial Manufacturing',
    description: 'Manufacturing, production, and industrial processes',
  },
  {
    id: 8,
    slug: 'transportation',
    name: 'Transportation',
    description: 'Logistics, mobility, and transportation services',
  },
  {
    id: 9,
    slug: 'healthcare',
    name: 'Healthcare',
    description: 'Medical services, patient care, and health systems',
  },
  {
    id: 10,
    slug: 'legal',
    name: 'Legal',
    description: 'Legal services, compliance, and regulatory affairs',
  },
  {
    id: 11,
    slug: 'agriculture',
    name: 'Agriculture',
    description: 'Farming, agtech, and agricultural sciences',
  },
  {
    id: 12,
    slug: 'energy',
    name: 'Energy',
    description: 'Energy production, utilities, and power systems',
  },
  {
    id: 13,
    slug: 'media_entertainment',
    name: 'Media and Entertainment',
    description: 'Media production, entertainment, and creative industries',
  },
  {
    id: 14,
    slug: 'real_estate',
    name: 'Real Estate',
    description: 'Property management, real estate services, and construction',
  },
  {
    id: 15,
    slug: 'hospitality_tourism',
    name: 'Hospitality and Tourism',
    description: 'Hotels, travel, and tourism services',
  },
  {
    id: 16,
    slug: 'telecommunications',
    name: 'Telecommunications',
    description: 'Telecom services, networks, and communications infrastructure',
  },
  {
    id: 17,
    slug: 'environmental_science',
    name: 'Environmental Science',
    description: 'Environmental research, sustainability, and climate science',
  },
  {
    id: 18,
    slug: 'government_public_sector',
    name: 'Government and Public Sector',
    description: 'Government services, public administration, and civic operations',
  },
  {
    id: 19,
    slug: 'research_development',
    name: 'Research and Development',
    description: 'Scientific research, R&D, and innovation',
  },
  {
    id: 20,
    slug: 'retail_ecommerce',
    name: 'Retail and E-commerce',
    description: 'Retail operations, e-commerce, and consumer services',
  },
  {
    id: 21,
    slug: 'social_services',
    name: 'Social Services',
    description: 'Social welfare, community services, and non-profit operations',
  },
  {
    id: 22,
    slug: 'sports_fitness',
    name: 'Sports and Fitness',
    description: 'Sports, athletics, and fitness services',
  },
  {
    id: 23,
    slug: 'insurance',
    name: 'Insurance',
    description: 'Insurance services, risk management, and actuarial operations',
  },
  {
    id: 24,
    slug: 'marketing_advertising',
    name: 'Marketing and Advertising',
    description: 'Marketing services, advertising, and brand management',
  },
];

/**
 * Get all skill slugs (flat list - no hierarchy)
 */
export function getAllSkillSlugs(): string[] {
  return SKILL_TAXONOMY.map((category) => category.slug);
}

/**
 * Get all domain slugs (flat list - no hierarchy)
 */
export function getAllDomainSlugs(): string[] {
  return DOMAIN_TAXONOMY.map((category) => category.slug);
}

/**
 * Validate a skill slug
 */
export function validateSkillSlug(slug: string): boolean {
  return getAllSkillSlugs().includes(slug);
}

/**
 * Validate a domain slug
 */
export function validateDomainSlug(slug: string): boolean {
  return getAllDomainSlugs().includes(slug);
}

/**
 * Get taxonomy data by type
 */
export function getTaxonomy(type: TaxonomyType): TaxonomyData {
  const base = { version: OASF_VERSION };

  switch (type) {
    case 'skill':
      return { ...base, skills: SKILL_TAXONOMY };
    case 'domain':
      return { ...base, domains: DOMAIN_TAXONOMY };
    default:
      return { ...base, skills: SKILL_TAXONOMY, domains: DOMAIN_TAXONOMY };
  }
}

/**
 * Mapping from old slugs to new OASF slugs
 * Used for migrating existing classifications
 */
export const SKILL_MIGRATION_MAP: Record<string, string> = {
  // Direct mappings
  natural_language_processing: 'natural_language_processing',
  // Old hierarchical to flat
  'natural_language_processing/text_generation': 'natural_language_processing',
  'natural_language_processing/text_summarization': 'natural_language_processing',
  'natural_language_processing/sentiment_analysis': 'natural_language_processing',
  'natural_language_processing/translation': 'natural_language_processing',
  'natural_language_processing/question_answering': 'natural_language_processing',
  'natural_language_processing/named_entity_recognition': 'natural_language_processing',
  'natural_language_processing/text_classification': 'natural_language_processing',
  // Code generation → analytical_skills or tool_interaction
  code_generation: 'tool_interaction',
  'code_generation/code_completion': 'tool_interaction',
  'code_generation/code_review': 'analytical_skills',
  'code_generation/debugging': 'tool_interaction',
  'code_generation/refactoring': 'tool_interaction',
  'code_generation/test_generation': 'tool_interaction',
  'code_generation/documentation': 'natural_language_processing',
  // Data analysis → analytical_skills
  data_analysis: 'analytical_skills',
  'data_analysis/data_visualization': 'analytical_skills',
  'data_analysis/statistical_analysis': 'analytical_skills',
  'data_analysis/data_transformation': 'data_engineering',
  'data_analysis/pattern_recognition': 'analytical_skills',
  'data_analysis/anomaly_detection': 'analytical_skills',
  // Reasoning → advanced_reasoning_planning
  reasoning: 'advanced_reasoning_planning',
  'reasoning/logical_reasoning': 'advanced_reasoning_planning',
  'reasoning/mathematical_reasoning': 'advanced_reasoning_planning',
  'reasoning/causal_reasoning': 'advanced_reasoning_planning',
  'reasoning/planning': 'advanced_reasoning_planning',
  'reasoning/decision_making': 'advanced_reasoning_planning',
  // Automation → agent_orchestration
  automation: 'agent_orchestration',
  'automation/workflow_automation': 'agent_orchestration',
  'automation/task_scheduling': 'agent_orchestration',
  'automation/process_orchestration': 'agent_orchestration',
  'automation/integration': 'tool_interaction',
  // Communication → natural_language_processing
  communication: 'natural_language_processing',
  'communication/conversation': 'natural_language_processing',
  'communication/negotiation': 'advanced_reasoning_planning',
  'communication/collaboration': 'agent_orchestration',
  'communication/delegation': 'agent_orchestration',
  // Knowledge management → retrieval_augmented_generation
  knowledge_management: 'retrieval_augmented_generation',
  'knowledge_management/information_retrieval': 'retrieval_augmented_generation',
  'knowledge_management/knowledge_synthesis': 'retrieval_augmented_generation',
  'knowledge_management/fact_checking': 'retrieval_augmented_generation',
  'knowledge_management/research': 'retrieval_augmented_generation',
  // Blockchain → tool_interaction (blockchain is a domain, not skill)
  blockchain: 'tool_interaction',
  'blockchain/smart_contract_interaction': 'tool_interaction',
  'blockchain/transaction_management': 'tool_interaction',
  'blockchain/defi_operations': 'tool_interaction',
  'blockchain/nft_management': 'tool_interaction',
  'blockchain/wallet_management': 'tool_interaction',
  // Multimedia → images_computer_vision or audio
  multimedia: 'multi_modal',
  'multimedia/video_processing': 'images_computer_vision',
  'multimedia/audio_processing': 'audio',
  'multimedia/image_processing': 'images_computer_vision',
  'multimedia/transcription': 'audio',
  'multimedia/media_conversion': 'multi_modal',
  'multimedia/highlight_extraction': 'multi_modal',
};

/**
 * Mapping from old domain slugs to new OASF domain slugs
 * Used for migrating existing classifications
 */
export const DOMAIN_MIGRATION_MAP: Record<string, string> = {
  // Direct mappings
  healthcare: 'healthcare',
  technology: 'technology',
  education: 'education',
  legal: 'legal',
  // Finance → finance_business
  finance: 'finance_business',
  'finance/trading': 'finance_business',
  'finance/banking': 'finance_business',
  'finance/insurance': 'insurance',
  'finance/investment': 'finance_business',
  'finance/accounting': 'finance_business',
  'finance/defi': 'finance_business',
  // Healthcare children
  'healthcare/diagnosis': 'healthcare',
  'healthcare/patient_care': 'healthcare',
  'healthcare/medical_research': 'life_science',
  'healthcare/pharmaceuticals': 'life_science',
  // Technology children
  'technology/software_development': 'technology',
  'technology/cybersecurity': 'technology',
  'technology/devops': 'technology',
  'technology/cloud_computing': 'technology',
  'technology/data_engineering': 'technology',
  'technology/media_production': 'media_entertainment',
  // Business → finance_business
  business: 'finance_business',
  'business/marketing': 'marketing_advertising',
  'business/sales': 'retail_ecommerce',
  'business/customer_service': 'retail_ecommerce',
  'business/human_resources': 'human_resources',
  'business/operations': 'finance_business',
  'business/strategy': 'finance_business',
  // Education children
  'education/tutoring': 'education',
  'education/assessment': 'education',
  'education/curriculum_design': 'education',
  'education/research_assistance': 'research_development',
  // Legal children
  'legal/contract_analysis': 'legal',
  'legal/compliance': 'legal',
  'legal/legal_research': 'legal',
  'legal/intellectual_property': 'legal',
  // Creative → media_entertainment
  creative: 'media_entertainment',
  'creative/content_creation': 'media_entertainment',
  'creative/design': 'media_entertainment',
  'creative/writing': 'media_entertainment',
  'creative/media_production': 'media_entertainment',
  // Web3 → technology
  web3: 'technology',
  'web3/dao_governance': 'technology',
  'web3/token_economics': 'finance_business',
  'web3/nft_marketplace': 'retail_ecommerce',
  'web3/protocol_development': 'technology',
};

/**
 * Migrate an old skill slug to new OASF format
 */
export function migrateSkillSlug(oldSlug: string): string | null {
  return SKILL_MIGRATION_MAP[oldSlug] || null;
}

/**
 * Migrate an old domain slug to new OASF format
 */
export function migrateDomainSlug(oldSlug: string): string | null {
  return DOMAIN_MIGRATION_MAP[oldSlug] || null;
}
