/**
 * OASF Taxonomy data (v0.8.0)
 * @module lib/oasf/taxonomy
 */

import type { TaxonomyCategory, TaxonomyData, TaxonomyType } from '@/types';

/**
 * OASF Schema version
 */
export const OASF_VERSION = '0.8.0';

/**
 * Skill taxonomy categories
 * Based on OASF v0.8.0 skill_categories
 */
export const SKILL_TAXONOMY: TaxonomyCategory[] = [
  {
    id: 1,
    slug: 'natural_language_processing',
    name: 'Natural Language Processing',
    description: 'Text understanding and generation capabilities',
    children: [
      { id: 11, slug: 'text_generation', name: 'Text Generation' },
      { id: 12, slug: 'text_summarization', name: 'Text Summarization' },
      { id: 13, slug: 'sentiment_analysis', name: 'Sentiment Analysis' },
      { id: 14, slug: 'translation', name: 'Translation' },
      { id: 15, slug: 'question_answering', name: 'Question Answering' },
      { id: 16, slug: 'named_entity_recognition', name: 'Named Entity Recognition' },
      { id: 17, slug: 'text_classification', name: 'Text Classification' },
    ],
  },
  {
    id: 2,
    slug: 'code_generation',
    name: 'Code Generation',
    description: 'Programming and software development capabilities',
    children: [
      { id: 21, slug: 'code_completion', name: 'Code Completion' },
      { id: 22, slug: 'code_review', name: 'Code Review' },
      { id: 23, slug: 'debugging', name: 'Debugging' },
      { id: 24, slug: 'refactoring', name: 'Refactoring' },
      { id: 25, slug: 'test_generation', name: 'Test Generation' },
      { id: 26, slug: 'documentation', name: 'Documentation' },
    ],
  },
  {
    id: 3,
    slug: 'data_analysis',
    name: 'Data Analysis',
    description: 'Data processing and insight generation',
    children: [
      { id: 31, slug: 'data_visualization', name: 'Data Visualization' },
      { id: 32, slug: 'statistical_analysis', name: 'Statistical Analysis' },
      { id: 33, slug: 'data_transformation', name: 'Data Transformation' },
      { id: 34, slug: 'pattern_recognition', name: 'Pattern Recognition' },
      { id: 35, slug: 'anomaly_detection', name: 'Anomaly Detection' },
    ],
  },
  {
    id: 4,
    slug: 'reasoning',
    name: 'Reasoning',
    description: 'Logical reasoning and problem-solving',
    children: [
      { id: 41, slug: 'logical_reasoning', name: 'Logical Reasoning' },
      { id: 42, slug: 'mathematical_reasoning', name: 'Mathematical Reasoning' },
      { id: 43, slug: 'causal_reasoning', name: 'Causal Reasoning' },
      { id: 44, slug: 'planning', name: 'Planning' },
      { id: 45, slug: 'decision_making', name: 'Decision Making' },
    ],
  },
  {
    id: 5,
    slug: 'automation',
    name: 'Automation',
    description: 'Task automation and workflow management',
    children: [
      { id: 51, slug: 'workflow_automation', name: 'Workflow Automation' },
      { id: 52, slug: 'task_scheduling', name: 'Task Scheduling' },
      { id: 53, slug: 'process_orchestration', name: 'Process Orchestration' },
      { id: 54, slug: 'integration', name: 'Integration' },
    ],
  },
  {
    id: 6,
    slug: 'communication',
    name: 'Communication',
    description: 'Interpersonal and multi-agent communication',
    children: [
      { id: 61, slug: 'conversation', name: 'Conversation' },
      { id: 62, slug: 'negotiation', name: 'Negotiation' },
      { id: 63, slug: 'collaboration', name: 'Collaboration' },
      { id: 64, slug: 'delegation', name: 'Delegation' },
    ],
  },
  {
    id: 7,
    slug: 'knowledge_management',
    name: 'Knowledge Management',
    description: 'Information retrieval and knowledge synthesis',
    children: [
      { id: 71, slug: 'information_retrieval', name: 'Information Retrieval' },
      { id: 72, slug: 'knowledge_synthesis', name: 'Knowledge Synthesis' },
      { id: 73, slug: 'fact_checking', name: 'Fact Checking' },
      { id: 74, slug: 'research', name: 'Research' },
    ],
  },
  {
    id: 8,
    slug: 'blockchain',
    name: 'Blockchain',
    description: 'Web3 and blockchain-specific capabilities',
    children: [
      { id: 81, slug: 'smart_contract_interaction', name: 'Smart Contract Interaction' },
      { id: 82, slug: 'transaction_management', name: 'Transaction Management' },
      { id: 83, slug: 'defi_operations', name: 'DeFi Operations' },
      { id: 84, slug: 'nft_management', name: 'NFT Management' },
      { id: 85, slug: 'wallet_management', name: 'Wallet Management' },
    ],
  },
];

/**
 * Domain taxonomy categories
 * Based on OASF v0.8.0 domain_categories
 */
export const DOMAIN_TAXONOMY: TaxonomyCategory[] = [
  {
    id: 1,
    slug: 'finance',
    name: 'Finance',
    description: 'Financial services and markets',
    children: [
      { id: 11, slug: 'trading', name: 'Trading' },
      { id: 12, slug: 'banking', name: 'Banking' },
      { id: 13, slug: 'insurance', name: 'Insurance' },
      { id: 14, slug: 'investment', name: 'Investment' },
      { id: 15, slug: 'accounting', name: 'Accounting' },
      { id: 16, slug: 'defi', name: 'DeFi' },
    ],
  },
  {
    id: 2,
    slug: 'healthcare',
    name: 'Healthcare',
    description: 'Medical and health services',
    children: [
      { id: 21, slug: 'diagnosis', name: 'Diagnosis' },
      { id: 22, slug: 'patient_care', name: 'Patient Care' },
      { id: 23, slug: 'medical_research', name: 'Medical Research' },
      { id: 24, slug: 'pharmaceuticals', name: 'Pharmaceuticals' },
    ],
  },
  {
    id: 3,
    slug: 'technology',
    name: 'Technology',
    description: 'Software and technology services',
    children: [
      { id: 31, slug: 'software_development', name: 'Software Development' },
      { id: 32, slug: 'cybersecurity', name: 'Cybersecurity' },
      { id: 33, slug: 'devops', name: 'DevOps' },
      { id: 34, slug: 'cloud_computing', name: 'Cloud Computing' },
      { id: 35, slug: 'data_engineering', name: 'Data Engineering' },
    ],
  },
  {
    id: 4,
    slug: 'business',
    name: 'Business',
    description: 'Business operations and strategy',
    children: [
      { id: 41, slug: 'marketing', name: 'Marketing' },
      { id: 42, slug: 'sales', name: 'Sales' },
      { id: 43, slug: 'customer_service', name: 'Customer Service' },
      { id: 44, slug: 'human_resources', name: 'Human Resources' },
      { id: 45, slug: 'operations', name: 'Operations' },
      { id: 46, slug: 'strategy', name: 'Strategy' },
    ],
  },
  {
    id: 5,
    slug: 'education',
    name: 'Education',
    description: 'Learning and educational services',
    children: [
      { id: 51, slug: 'tutoring', name: 'Tutoring' },
      { id: 52, slug: 'assessment', name: 'Assessment' },
      { id: 53, slug: 'curriculum_design', name: 'Curriculum Design' },
      { id: 54, slug: 'research_assistance', name: 'Research Assistance' },
    ],
  },
  {
    id: 6,
    slug: 'legal',
    name: 'Legal',
    description: 'Legal services and compliance',
    children: [
      { id: 61, slug: 'contract_analysis', name: 'Contract Analysis' },
      { id: 62, slug: 'compliance', name: 'Compliance' },
      { id: 63, slug: 'legal_research', name: 'Legal Research' },
      { id: 64, slug: 'intellectual_property', name: 'Intellectual Property' },
    ],
  },
  {
    id: 7,
    slug: 'creative',
    name: 'Creative',
    description: 'Creative and artistic services',
    children: [
      { id: 71, slug: 'content_creation', name: 'Content Creation' },
      { id: 72, slug: 'design', name: 'Design' },
      { id: 73, slug: 'writing', name: 'Writing' },
      { id: 74, slug: 'media_production', name: 'Media Production' },
    ],
  },
  {
    id: 8,
    slug: 'web3',
    name: 'Web3',
    description: 'Blockchain and decentralized applications',
    children: [
      { id: 81, slug: 'dao_governance', name: 'DAO Governance' },
      { id: 82, slug: 'token_economics', name: 'Token Economics' },
      { id: 83, slug: 'nft_marketplace', name: 'NFT Marketplace' },
      { id: 84, slug: 'protocol_development', name: 'Protocol Development' },
    ],
  },
];

/**
 * Get all skill slugs (flattened)
 */
export function getAllSkillSlugs(): string[] {
  const slugs: string[] = [];

  for (const category of SKILL_TAXONOMY) {
    slugs.push(category.slug);
    if (category.children) {
      for (const child of category.children) {
        slugs.push(`${category.slug}/${child.slug}`);
      }
    }
  }

  return slugs;
}

/**
 * Get all domain slugs (flattened)
 */
export function getAllDomainSlugs(): string[] {
  const slugs: string[] = [];

  for (const category of DOMAIN_TAXONOMY) {
    slugs.push(category.slug);
    if (category.children) {
      for (const child of category.children) {
        slugs.push(`${category.slug}/${child.slug}`);
      }
    }
  }

  return slugs;
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
