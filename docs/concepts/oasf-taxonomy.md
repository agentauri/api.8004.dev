# OASF Taxonomy

The Open Agent Skill Framework (OASF) provides a standardized taxonomy for classifying AI agents by their skills and domains.

## Overview

OASF enables:
- **Consistent classification** of agent capabilities
- **Semantic search** by skill or domain
- **Team composition** based on skill matching
- **Interoperability** between different agent registries

## Taxonomy Structure

### Skills (136 categories)

Skills describe what an agent can do - its capabilities and competencies.

**Language & Communication:**
- `natural_language_processing` - Process human language
- `translation` - Translate between languages
- `summarization` - Create concise summaries
- `sentiment_analysis` - Analyze emotional tone

**Code & Development:**
- `code_generation` - Generate code from descriptions
- `code_review` - Review code for quality
- `debugging` - Find and fix bugs
- `refactoring` - Improve code structure

**Data & Analytics:**
- `data_analysis` - Analyze and interpret data
- `data_visualization` - Create visual representations
- `statistical_analysis` - Apply statistical methods
- `pattern_recognition` - Identify patterns in data

**AI & Machine Learning:**
- `machine_learning` - Apply ML techniques
- `image_recognition` - Identify objects in images
- `speech_recognition` - Convert speech to text
- `recommendation` - Generate recommendations

### Domains (204 categories)

Domains describe the industries and areas where an agent operates.

**Core Industries:**
- `technology` - Software, hardware, IT
- `finance` - Banking, investments
- `healthcare` - Medical, health
- `education` - Learning, teaching
- `legal` - Law, regulations

**Business Functions:**
- `marketing` - Promotion, advertising
- `sales` - Revenue generation
- `customer_service` - Support, help
- `human_resources` - HR, recruiting
- `operations` - Business operations

**Specialized Areas:**
- `software_development` - Building software
- `data_science` - Data analytics
- `cybersecurity` - Security
- `blockchain` - Distributed ledgers
- `artificial_intelligence` - AI systems

## Classification Sources

Agent classifications come from three sources:

| Source | Priority | Description |
|--------|----------|-------------|
| `creator-defined` | Highest | OASF data in agent's metadata file |
| `llm-classification` | Medium | Automated LLM classification |
| `none` | Lowest | No classification available |

### Creator-Defined

Agents can include OASF data in their registration metadata:

```json
{
  "oasf": {
    "skills": ["code_generation", "debugging"],
    "domains": ["technology", "software_development"]
  }
}
```

### LLM Classification

When creator-defined data is not available, the API uses LLM analysis to classify agents based on:

- Agent name and description
- MCP tools and capabilities
- A2A skills
- Endpoint metadata

## Using OASF in API Calls

### Filter by Skills

```bash
# Find agents with code generation skills
curl "https://api.8004.dev/api/v1/agents?skills=code_generation" \
  -H "X-API-Key: your-api-key"

# Multiple skills (any match)
curl "https://api.8004.dev/api/v1/agents?skills=code_generation,data_analysis" \
  -H "X-API-Key: your-api-key"
```

### Filter by Domains

```bash
# Find agents in finance domain
curl "https://api.8004.dev/api/v1/agents?domains=finance" \
  -H "X-API-Key: your-api-key"

# Multiple domains
curl "https://api.8004.dev/api/v1/agents?domains=technology,healthcare" \
  -H "X-API-Key: your-api-key"
```

### Get Full Taxonomy

```bash
# All skills and domains
curl "https://api.8004.dev/api/v1/taxonomy" \
  -H "X-API-Key: your-api-key"

# Skills only
curl "https://api.8004.dev/api/v1/taxonomy?type=skills" \
  -H "X-API-Key: your-api-key"

# Domains only
curl "https://api.8004.dev/api/v1/taxonomy?type=domains" \
  -H "X-API-Key: your-api-key"
```

## Classification Response

Agent responses include OASF data:

```json
{
  "id": "11155111:1234",
  "name": "CodeReview Pro",
  "oasf": {
    "skills": [
      { "slug": "code_generation", "name": "Code Generation" },
      { "slug": "code_review", "name": "Code Review" }
    ],
    "domains": [
      { "slug": "technology", "name": "Technology" }
    ]
  },
  "oasfSource": "llm-classification"
}
```

## Triggering Classification

Classification happens automatically when:
- Agents are returned in search results
- Agent details are requested
- Up to 10 agents per request are auto-queued

Manual classification:

```bash
curl -X POST "https://api.8004.dev/api/v1/agents/11155111:1234/classify" \
  -H "X-API-Key: your-api-key" \
  -H "Content-Type: application/json" \
  -d '{"force": false}'
```

## Resources

- **OASF Specification**: [docs.agntcy.org/oasf](https://docs.agntcy.org/oasf/)
- **OASF Schema**: [schema.oasf.outshift.com](https://schema.oasf.outshift.com)
- **Taxonomy Endpoint**: [/api/taxonomy](/api/taxonomy)
- **Classification Endpoint**: [/api/classification](/api/classification)
