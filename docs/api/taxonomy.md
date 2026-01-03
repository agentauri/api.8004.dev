# Taxonomy

The Taxonomy API provides access to the OASF (Open Agent Skill Framework) taxonomy tree, including all available skills and domains.

## Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/v1/taxonomy` | Get OASF taxonomy tree |

## Get Taxonomy

```
GET /api/v1/taxonomy
```

Retrieve the OASF taxonomy including skills and/or domains.

### Query Parameters

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `type` | string | all | `skills`, `domains`, or `all` |

### Example Request (All)

```bash
curl "https://api.8004.dev/api/v1/taxonomy" \
  -H "X-API-Key: your-api-key"
```

### Example Request (Skills Only)

```bash
curl "https://api.8004.dev/api/v1/taxonomy?type=skills" \
  -H "X-API-Key: your-api-key"
```

### Example Response

```json
{
  "success": true,
  "data": {
    "version": "0.8.0",
    "skills": [
      {
        "slug": "natural_language_processing",
        "name": "Natural Language Processing",
        "description": "Process and understand human language"
      },
      {
        "slug": "code_generation",
        "name": "Code Generation",
        "description": "Generate code from natural language descriptions"
      },
      {
        "slug": "data_analysis",
        "name": "Data Analysis",
        "description": "Analyze and interpret data patterns"
      },
      {
        "slug": "translation",
        "name": "Translation",
        "description": "Translate text between languages"
      },
      {
        "slug": "summarization",
        "name": "Summarization",
        "description": "Create concise summaries of content"
      }
    ],
    "domains": [
      {
        "slug": "technology",
        "name": "Technology",
        "description": "Software, hardware, and IT"
      },
      {
        "slug": "finance",
        "name": "Finance",
        "description": "Banking, investments, and economics"
      },
      {
        "slug": "healthcare",
        "name": "Healthcare",
        "description": "Medical and health-related"
      },
      {
        "slug": "education",
        "name": "Education",
        "description": "Learning and teaching"
      },
      {
        "slug": "legal",
        "name": "Legal",
        "description": "Law and legal services"
      }
    ]
  }
}
```

---

## Skills

The OASF taxonomy includes **136 skills** organized into categories:

### Language & Communication

| Slug | Name |
|------|------|
| `natural_language_processing` | Natural Language Processing |
| `translation` | Translation |
| `summarization` | Summarization |
| `text_generation` | Text Generation |
| `sentiment_analysis` | Sentiment Analysis |
| `dialogue_management` | Dialogue Management |

### Code & Development

| Slug | Name |
|------|------|
| `code_generation` | Code Generation |
| `code_review` | Code Review |
| `debugging` | Debugging |
| `code_analysis` | Code Analysis |
| `refactoring` | Refactoring |
| `documentation` | Documentation |

### Data & Analytics

| Slug | Name |
|------|------|
| `data_analysis` | Data Analysis |
| `data_visualization` | Data Visualization |
| `data_collection` | Data Collection |
| `statistical_analysis` | Statistical Analysis |
| `pattern_recognition` | Pattern Recognition |

### AI & Machine Learning

| Slug | Name |
|------|------|
| `machine_learning` | Machine Learning |
| `image_recognition` | Image Recognition |
| `speech_recognition` | Speech Recognition |
| `recommendation` | Recommendation |
| `classification` | Classification |

---

## Domains

The OASF taxonomy includes **204 domains** covering:

### Core Industries

| Slug | Name |
|------|------|
| `technology` | Technology |
| `finance` | Finance |
| `healthcare` | Healthcare |
| `education` | Education |
| `legal` | Legal |
| `retail` | Retail |
| `manufacturing` | Manufacturing |

### Business Functions

| Slug | Name |
|------|------|
| `marketing` | Marketing |
| `sales` | Sales |
| `customer_service` | Customer Service |
| `human_resources` | Human Resources |
| `operations` | Operations |
| `supply_chain` | Supply Chain |

### Specialized Areas

| Slug | Name |
|------|------|
| `software_development` | Software Development |
| `data_science` | Data Science |
| `cybersecurity` | Cybersecurity |
| `blockchain` | Blockchain |
| `artificial_intelligence` | Artificial Intelligence |

---

## Using Taxonomy in Filters

Use skill and domain slugs to filter agents:

```bash
# Filter by skills
curl "https://api.8004.dev/api/v1/agents?skills=code_generation,data_analysis" \
  -H "X-API-Key: your-api-key"

# Filter by domains
curl "https://api.8004.dev/api/v1/agents?domains=technology,finance" \
  -H "X-API-Key: your-api-key"

# Combine both
curl "https://api.8004.dev/api/v1/agents?skills=code_generation&domains=technology" \
  -H "X-API-Key: your-api-key"
```

---

## OASF Source

The taxonomy is based on the **Open Agent Skill Framework (OASF)** specification:

- **Version**: 0.8.0
- **Source**: [schema.oasf.outshift.com](https://schema.oasf.outshift.com)
- **Documentation**: [docs.agntcy.org/oasf](https://docs.agntcy.org/oasf/)

---

## Caching

Taxonomy data is cached for 1 hour as it rarely changes.

---

## Error Responses

| Status | Code | Description |
|--------|------|-------------|
| 400 | `VALIDATION_ERROR` | Invalid type parameter |
| 401 | `UNAUTHORIZED` | Missing or invalid API key |
| 429 | `RATE_LIMIT_EXCEEDED` | Too many requests |
