# OASF Agent Classification Service - Technical Specification

## Overview

This document specifies the requirements for a backend service that automatically classifies ERC-8004 agents according to the OASF (Open Agentic Schema Framework) taxonomy. The service will analyze agent metadata and descriptions using AI to assign appropriate skill and domain classifications.

## Problem Statement

ERC-8004 agents registered on-chain contain metadata (name, description, capabilities) but lack standardized OASF taxonomy classification. The OASF v0.8.0 taxonomy provides hierarchical categories for:

- **Skills**: Technical capabilities (e.g., `natural_language_processing`, `code_generation`)
- **Domains**: Application areas (e.g., `finance/trading`, `healthcare`)

Currently, the 8004.dev explorer cannot filter agents by skills/domains because this classification data doesn't exist.

## Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                        OASF Classification Service                   │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────────────────┐ │
│  │  Agent      │    │    LLM      │    │    Classification       │ │
│  │  Ingestion  │───▶│  Classifier │───▶│    Storage              │ │
│  │  Worker     │    │             │    │    (PostgreSQL/Redis)   │ │
│  └─────────────┘    └─────────────┘    └─────────────────────────┘ │
│         ▲                                          │                │
│         │                                          ▼                │
│  ┌─────────────┐                        ┌─────────────────────────┐ │
│  │  Subgraph   │                        │    REST API             │ │
│  │  Listener   │                        │    /api/v1/classify     │ │
│  └─────────────┘                        └─────────────────────────┘ │
│                                                    │                │
└────────────────────────────────────────────────────│────────────────┘
                                                     │
                                                     ▼
                                          ┌─────────────────────┐
                                          │   8004.dev Frontend │
                                          └─────────────────────┘
```

## Core Components

### 1. Agent Ingestion Worker

**Purpose**: Listen for new agent registrations and queue them for classification.

**Data Sources**:
- The Graph subgraph for ERC-8004 agents
- Direct RPC event listeners (backup)

**Required Agent Data**:
```typescript
interface AgentData {
  agentId: string;        // Format: "chainId:tokenId"
  chainId: number;
  name: string;
  description: string;
  mcpTools?: string[];    // MCP tool names
  a2aSkills?: string[];   // A2A skill names
  mcpPrompts?: string[];
  mcpResources?: string[];
  metadataUri?: string;   // For fetching extended metadata
}
```

**Behavior**:
- Poll subgraph every 5 minutes for new/updated agents
- Queue agents for classification
- Handle retries with exponential backoff

### 2. LLM Classifier

**Purpose**: Analyze agent metadata and assign OASF taxonomy classifications.

**Input**: Agent metadata (name, description, capabilities)

**Output**:
```typescript
interface ClassificationResult {
  agentId: string;
  skills: SkillClassification[];
  domains: DomainClassification[];
  confidence: number;        // 0-1 overall confidence
  classifiedAt: string;      // ISO timestamp
  modelVersion: string;      // e.g., "claude-3-5-sonnet-20241022"
}

interface SkillClassification {
  slug: string;              // e.g., "natural_language_processing/text_generation"
  confidence: number;        // 0-1
  reasoning?: string;        // Why this classification was chosen
}

interface DomainClassification {
  slug: string;              // e.g., "finance/trading"
  confidence: number;        // 0-1
  reasoning?: string;
}
```

**Classification Prompt Template**:
```
You are an expert at classifying AI agents according to the OASF taxonomy.

Given the following agent metadata:
- Name: {name}
- Description: {description}
- MCP Tools: {mcpTools}
- A2A Skills: {a2aSkills}

Classify this agent according to the OASF v0.8.0 taxonomy.

Available Skill Categories:
{skillTaxonomyTree}

Available Domain Categories:
{domainTaxonomyTree}

Rules:
1. Assign 1-5 most relevant skills
2. Assign 1-3 most relevant domains
3. Use the most specific category that applies
4. Provide confidence scores (0-1) for each classification
5. If unsure, assign parent category rather than guessing specific child

Return JSON in this format:
{
  "skills": [{"slug": "category/subcategory", "confidence": 0.95, "reasoning": "..."}],
  "domains": [{"slug": "domain/subdomain", "confidence": 0.85, "reasoning": "..."}]
}
```

**Recommended Model**: Claude 3.5 Sonnet or Claude 3 Haiku (for cost efficiency)

### 3. Classification Storage

**Database Schema** (PostgreSQL):

```sql
CREATE TABLE agent_classifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id VARCHAR(100) NOT NULL UNIQUE,  -- "chainId:tokenId"
  chain_id INTEGER NOT NULL,
  skills JSONB NOT NULL,                   -- SkillClassification[]
  domains JSONB NOT NULL,                  -- DomainClassification[]
  confidence DECIMAL(3,2) NOT NULL,
  model_version VARCHAR(100) NOT NULL,
  classified_at TIMESTAMP WITH TIME ZONE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

  CONSTRAINT valid_confidence CHECK (confidence >= 0 AND confidence <= 1)
);

-- Indexes for filtering
CREATE INDEX idx_classifications_skills ON agent_classifications USING GIN (skills);
CREATE INDEX idx_classifications_domains ON agent_classifications USING GIN (domains);
CREATE INDEX idx_classifications_chain_id ON agent_classifications (chain_id);
CREATE INDEX idx_classifications_confidence ON agent_classifications (confidence);
```

**Cache Layer** (Redis):
```
Key: oasf:agent:{agentId}
Value: JSON ClassificationResult
TTL: 24 hours
```

### 4. REST API

**Base URL**: `https://oasf-classifier.example.com/api/v1`

#### Endpoints

**GET /classify/{agentId}**

Get classification for a specific agent.

Response:
```json
{
  "agentId": "11155111:123",
  "skills": [
    {"slug": "natural_language_processing/text_generation", "confidence": 0.95},
    {"slug": "code_generation", "confidence": 0.82}
  ],
  "domains": [
    {"slug": "technology/software_development", "confidence": 0.90}
  ],
  "confidence": 0.89,
  "classifiedAt": "2025-03-01T12:00:00Z",
  "modelVersion": "claude-3-5-sonnet-20241022"
}
```

Status Codes:
- `200`: Classification found
- `404`: Agent not yet classified
- `202`: Classification in progress (queued)

**POST /classify**

Request classification for an agent (if not already classified).

Request:
```json
{
  "agentId": "11155111:123",
  "force": false  // Set true to re-classify
}
```

Response:
```json
{
  "status": "queued" | "already_classified",
  "agentId": "11155111:123",
  "estimatedTime": 30  // seconds
}
```

**POST /search**

Search agents by OASF classification.

Request:
```json
{
  "skills": ["natural_language_processing", "code_generation"],
  "domains": ["finance"],
  "skillMode": "any" | "all",
  "domainMode": "any" | "all",
  "minConfidence": 0.7,
  "chainIds": [11155111, 84532],
  "limit": 20,
  "cursor": "..."
}
```

Response:
```json
{
  "results": [
    {
      "agentId": "11155111:123",
      "skills": [...],
      "domains": [...],
      "confidence": 0.89
    }
  ],
  "total": 42,
  "hasMore": true,
  "nextCursor": "..."
}
```

**GET /taxonomy**

Get the full OASF taxonomy tree.

Response:
```json
{
  "version": "0.8.0",
  "skills": [
    {
      "id": 1,
      "slug": "natural_language_processing",
      "name": "Natural Language Processing",
      "children": [...]
    }
  ],
  "domains": [...]
}
```

**GET /health**

Health check endpoint.

## OASF Taxonomy Reference

The service must implement OASF v0.8.0 taxonomy. Full taxonomy available at:
https://docs.agntcy.org/oasf/open-agentic-schema-framework/

Key skill categories:
- `natural_language_processing` (text_generation, sentiment_analysis, translation, ...)
- `code_generation` (code_completion, debugging, refactoring, ...)
- `data_analysis` (visualization, statistical_analysis, ...)
- `image_processing` (image_generation, object_detection, ...)
- `automation` (workflow_automation, task_scheduling, ...)

Key domain categories:
- `finance` (trading, banking, insurance, ...)
- `healthcare` (diagnosis, patient_care, ...)
- `technology` (software_development, cybersecurity, ...)
- `business` (marketing, sales, hr, ...)
- `education` (tutoring, assessment, ...)

## Integration with 8004.dev

### Environment Variables

```bash
# 8004.dev .env.local
OASF_CLASSIFIER_API_URL=https://oasf-classifier.example.com/api/v1
OASF_CLASSIFIER_API_KEY=xxx  # If auth required
```

### Frontend Integration Points

1. **Search Filters**: Re-enable TaxonomyFilter components when API is available
2. **Agent Detail Page**: Show classified skills/domains
3. **Search Provider**: Add OASF filtering to subgraph-provider

### Code Changes Required (8004.dev)

```typescript
// src/lib/oasf/client.ts - New file
export async function getAgentClassification(agentId: string) {
  const response = await fetch(
    `${process.env.OASF_CLASSIFIER_API_URL}/classify/${agentId}`
  );
  if (!response.ok) return null;
  return response.json();
}

export async function searchByOASF(params: OASFSearchParams) {
  const response = await fetch(
    `${process.env.OASF_CLASSIFIER_API_URL}/search`,
    { method: 'POST', body: JSON.stringify(params) }
  );
  return response.json();
}
```

## Performance Requirements

| Metric | Target |
|--------|--------|
| Classification latency | < 5 seconds per agent |
| API response time (cached) | < 100ms |
| API response time (search) | < 500ms |
| Throughput | 1000 classifications/hour |
| Cache hit rate | > 95% |

## Security Considerations

1. **Rate Limiting**: 100 requests/minute per IP
2. **API Authentication**: Optional API key for write operations
3. **Input Validation**: Sanitize agent descriptions before LLM processing
4. **Prompt Injection**: Guard against malicious agent descriptions

## Cost Estimation

Assuming Claude 3.5 Sonnet pricing:
- ~1000 tokens/classification (input + output)
- Cost per classification: ~$0.003
- 10,000 agents: ~$30
- Monthly re-classification (10% updates): ~$3

Recommended: Use Claude 3 Haiku for bulk processing ($0.0003/classification)

## Deployment Recommendations

1. **Infrastructure**: Cloudflare Workers + D1/Turso or AWS Lambda + RDS
2. **Caching**: Redis/Upstash for hot cache
3. **Queue**: SQS, Cloudflare Queues, or BullMQ
4. **Monitoring**: Datadog/Grafana for API metrics

## Timeline Estimate

| Phase | Duration | Deliverables |
|-------|----------|--------------|
| Setup & Architecture | 1 week | Database, API scaffold, CI/CD |
| LLM Integration | 1 week | Classifier, prompt tuning |
| API Development | 1 week | All endpoints, caching |
| Testing & Integration | 1 week | E2E tests, 8004.dev integration |

**Total**: 4 weeks for MVP

## Open Questions

1. Should classifications be stored on-chain (ERC-8004 extension)?
2. Human review workflow for low-confidence classifications?
3. Multi-language support for agent descriptions?
4. Feedback loop for improving classifications over time?

## Contact

For questions about this specification or 8004.dev integration:
- 8004.dev Repository: [link]
- OASF Documentation: https://docs.agntcy.org/oasf/

---

*Document Version: 1.0*
*Last Updated: December 2025*
