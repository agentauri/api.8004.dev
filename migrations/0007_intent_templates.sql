-- Intent Templates Migration
-- Pre-defined workflows for multi-agent orchestration
-- Each template defines steps with required skills/capabilities

-- Intent templates table
CREATE TABLE IF NOT EXISTS intent_templates (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  category TEXT NOT NULL,           -- e.g., 'data-pipeline', 'content-creation', 'research'
  is_active INTEGER DEFAULT 1,
  is_featured INTEGER DEFAULT 0,
  usage_count INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

-- Template steps (ordered list of roles in the workflow)
CREATE TABLE IF NOT EXISTS intent_template_steps (
  id TEXT PRIMARY KEY,
  template_id TEXT NOT NULL,
  step_order INTEGER NOT NULL,       -- 1, 2, 3... (execution order)
  role TEXT NOT NULL,                -- e.g., 'data_fetcher', 'analyzer', 'summarizer'
  description TEXT,
  required_skills TEXT,              -- JSON array of skill slugs
  required_input_modes TEXT,         -- JSON array of input modes
  required_output_modes TEXT,        -- JSON array of output modes
  optional_skills TEXT,              -- JSON array of nice-to-have skills
  min_reputation INTEGER DEFAULT 0,  -- Minimum reputation score
  require_mcp INTEGER DEFAULT 0,     -- Require MCP support
  require_a2a INTEGER DEFAULT 0,     -- Require A2A support
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (template_id) REFERENCES intent_templates(id) ON DELETE CASCADE,
  UNIQUE(template_id, step_order)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_intent_templates_category ON intent_templates(category);
CREATE INDEX IF NOT EXISTS idx_intent_templates_featured ON intent_templates(is_featured) WHERE is_featured = 1;
CREATE INDEX IF NOT EXISTS idx_intent_template_steps_template ON intent_template_steps(template_id);

-- Pre-defined templates
-- 1. Data Analysis Pipeline
INSERT OR IGNORE INTO intent_templates (id, name, description, category, is_featured)
VALUES (
  'data-analysis-pipeline',
  'Data Analysis Pipeline',
  'Fetch data, analyze it, and generate a report with visualizations',
  'data-pipeline',
  1
);

INSERT OR IGNORE INTO intent_template_steps (id, template_id, step_order, role, description, required_skills, required_output_modes)
VALUES (
  'data-analysis-1',
  'data-analysis-pipeline',
  1,
  'data_fetcher',
  'Fetches data from external sources',
  '["web_search", "data_collection", "api_integration"]',
  '["application/json", "text/csv"]'
);

INSERT OR IGNORE INTO intent_template_steps (id, template_id, step_order, role, description, required_skills, required_input_modes, required_output_modes)
VALUES (
  'data-analysis-2',
  'data-analysis-pipeline',
  2,
  'analyzer',
  'Analyzes the data and extracts insights',
  '["data_analysis", "statistical_analysis"]',
  '["application/json", "text/csv"]',
  '["application/json", "text/plain"]'
);

INSERT OR IGNORE INTO intent_template_steps (id, template_id, step_order, role, description, required_skills, required_input_modes)
VALUES (
  'data-analysis-3',
  'data-analysis-pipeline',
  3,
  'report_generator',
  'Generates a human-readable report',
  '["report_generation", "data_visualization"]',
  '["application/json", "text/plain"]'
);

-- 2. Content Creation Workflow
INSERT OR IGNORE INTO intent_templates (id, name, description, category, is_featured)
VALUES (
  'content-creation',
  'Content Creation Workflow',
  'Research a topic, write content, and translate to multiple languages',
  'content-creation',
  1
);

INSERT OR IGNORE INTO intent_template_steps (id, template_id, step_order, role, description, required_skills, required_output_modes)
VALUES (
  'content-creation-1',
  'content-creation',
  1,
  'researcher',
  'Researches the topic and gathers information',
  '["web_search", "research", "fact_checking"]',
  '["text/plain", "application/json"]'
);

INSERT OR IGNORE INTO intent_template_steps (id, template_id, step_order, role, description, required_skills, required_input_modes, required_output_modes)
VALUES (
  'content-creation-2',
  'content-creation',
  2,
  'writer',
  'Creates the content based on research',
  '["content_generation", "copywriting"]',
  '["text/plain", "application/json"]',
  '["text/plain", "text/markdown"]'
);

INSERT OR IGNORE INTO intent_template_steps (id, template_id, step_order, role, description, required_skills, required_input_modes)
VALUES (
  'content-creation-3',
  'content-creation',
  3,
  'translator',
  'Translates the content to other languages',
  '["translation", "localization"]',
  '["text/plain", "text/markdown"]'
);

-- 3. Code Review Pipeline
INSERT OR IGNORE INTO intent_templates (id, name, description, category, is_featured)
VALUES (
  'code-review-pipeline',
  'Code Review Pipeline',
  'Analyze code, find bugs, check security, and generate documentation',
  'development',
  1
);

INSERT OR IGNORE INTO intent_template_steps (id, template_id, step_order, role, description, required_skills, require_mcp, required_output_modes)
VALUES (
  'code-review-1',
  'code-review-pipeline',
  1,
  'code_fetcher',
  'Fetches code from repository',
  '["code_analysis", "git_operations"]',
  1,
  '["text/plain", "application/json"]'
);

INSERT OR IGNORE INTO intent_template_steps (id, template_id, step_order, role, description, required_skills, required_input_modes, required_output_modes)
VALUES (
  'code-review-2',
  'code-review-pipeline',
  2,
  'security_analyzer',
  'Analyzes code for security vulnerabilities',
  '["security_analysis", "vulnerability_scanning"]',
  '["text/plain"]',
  '["application/json"]'
);

INSERT OR IGNORE INTO intent_template_steps (id, template_id, step_order, role, description, required_skills, required_input_modes, required_output_modes)
VALUES (
  'code-review-3',
  'code-review-pipeline',
  3,
  'code_reviewer',
  'Reviews code quality and suggests improvements',
  '["code_review", "code_quality"]',
  '["text/plain"]',
  '["text/plain", "text/markdown"]'
);

INSERT OR IGNORE INTO intent_template_steps (id, template_id, step_order, role, description, required_skills, required_input_modes)
VALUES (
  'code-review-4',
  'code-review-pipeline',
  4,
  'doc_generator',
  'Generates documentation for the code',
  '["documentation_generation", "code_documentation"]',
  '["text/plain"]'
);

-- 4. Customer Support Workflow
INSERT OR IGNORE INTO intent_templates (id, name, description, category)
VALUES (
  'customer-support',
  'Customer Support Workflow',
  'Handle customer queries with sentiment analysis and escalation',
  'customer-service'
);

INSERT OR IGNORE INTO intent_template_steps (id, template_id, step_order, role, description, required_skills, required_output_modes)
VALUES (
  'customer-support-1',
  'customer-support',
  1,
  'sentiment_analyzer',
  'Analyzes customer sentiment and urgency',
  '["sentiment_analysis", "natural_language_processing"]',
  '["application/json"]'
);

INSERT OR IGNORE INTO intent_template_steps (id, template_id, step_order, role, description, required_skills, required_input_modes, required_output_modes)
VALUES (
  'customer-support-2',
  'customer-support',
  2,
  'knowledge_agent',
  'Finds relevant information to answer the query',
  '["web_search", "knowledge_base", "qa"]',
  '["application/json", "text/plain"]',
  '["text/plain"]'
);

INSERT OR IGNORE INTO intent_template_steps (id, template_id, step_order, role, description, required_skills, required_input_modes, require_a2a)
VALUES (
  'customer-support-3',
  'customer-support',
  3,
  'responder',
  'Crafts and sends the response',
  '["content_generation", "email_processing"]',
  '["text/plain"]',
  1
);
