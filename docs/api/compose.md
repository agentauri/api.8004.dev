# Compose

The Compose API enables building teams of complementary AI agents for complex tasks. It analyzes task requirements and selects agents with optimal skill coverage.

## Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/v1/compose` | Build a team of agents |
| GET | `/api/v1/compose/info` | API documentation |

## Build Team

```
POST /api/v1/compose
```

Analyze a task and build a team of complementary agents to accomplish it.

### Request Body

```json
{
  "task": "Build a data pipeline that collects financial data, analyzes trends, and generates reports",
  "teamSize": 3,
  "requiredSkills": ["data_analysis"],
  "requiredDomains": ["finance"],
  "minReputation": 50,
  "requireMcp": true,
  "requireA2a": false,
  "chainIds": [11155111]
}
```

### Request Parameters

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `task` | string | Yes | - | Task description (10-2000 chars) |
| `teamSize` | integer | No | auto | Preferred team size (1-10) |
| `requiredSkills` | string[] | No | - | OASF skills that must be covered |
| `requiredDomains` | string[] | No | - | OASF domains that must be covered |
| `minReputation` | number | No | - | Minimum agent reputation (0-100) |
| `requireMcp` | boolean | No | - | Only include MCP agents |
| `requireA2a` | boolean | No | - | Only include A2A agents |
| `chainIds` | integer[] | No | - | Filter by chain IDs |

### Example Request

```bash
curl -X POST "https://api.8004.dev/api/v1/compose" \
  -H "X-API-Key: your-api-key" \
  -H "Content-Type: application/json" \
  -d '{
    "task": "Build a customer support chatbot with sentiment analysis and ticket routing",
    "teamSize": 3,
    "requireMcp": true
  }'
```

### Example Response

```json
{
  "success": true,
  "data": {
    "analysis": {
      "task": "Build a customer support chatbot with sentiment analysis and ticket routing",
      "requiredSkills": [
        {
          "skill": "natural_language_processing",
          "priority": "required",
          "reason": "Core capability for chatbot interactions"
        },
        {
          "skill": "sentiment_analysis",
          "priority": "required",
          "reason": "Needed for sentiment detection"
        },
        {
          "skill": "classification",
          "priority": "important",
          "reason": "For ticket routing and categorization"
        }
      ],
      "suggestedTeamSize": 3,
      "complexity": "medium"
    },
    "team": [
      {
        "agentId": "11155111:123",
        "name": "ChatBot Pro",
        "role": "Primary Conversational Agent",
        "contributedSkills": ["natural_language_processing", "dialogue_management"],
        "contributedDomains": ["customer_service"],
        "fitnessScore": 0.92,
        "reputationScore": 90
      },
      {
        "agentId": "11155111:456",
        "name": "SentimentAI",
        "role": "Sentiment Analyzer",
        "contributedSkills": ["sentiment_analysis", "emotion_detection"],
        "contributedDomains": ["technology"],
        "fitnessScore": 0.88,
        "reputationScore": 84
      },
      {
        "agentId": "11155111:789",
        "name": "TicketRouter",
        "role": "Classification Specialist",
        "contributedSkills": ["classification", "routing"],
        "contributedDomains": ["customer_service"],
        "fitnessScore": 0.85,
        "reputationScore": 80
      }
    ],
    "teamFitnessScore": 0.88,
    "coveredSkills": [
      "natural_language_processing",
      "sentiment_analysis",
      "classification",
      "dialogue_management"
    ],
    "skillGaps": [],
    "coveredDomains": ["customer_service", "technology"],
    "compositionTimeMs": 1250
  }
}
```

---

## Get Compose Info

```
GET /api/v1/compose/info
```

Get documentation about the compose endpoint including request schema and examples.

### Example Request

```bash
curl "https://api.8004.dev/api/v1/compose/info" \
  -H "X-API-Key: your-api-key"
```

### Example Response

```json
{
  "success": true,
  "data": {
    "description": "Build a team of complementary agents for a given task",
    "endpoint": "POST /api/v1/compose",
    "requestSchema": {
      "task": {
        "type": "string",
        "required": true,
        "minLength": 10,
        "maxLength": 2000,
        "description": "Task or goal description"
      },
      "teamSize": {
        "type": "number",
        "required": false,
        "min": 1,
        "max": 10,
        "default": "auto-detected",
        "description": "Preferred team size"
      }
    },
    "example": {
      "request": {
        "task": "Build a data pipeline that collects financial data, analyzes trends, and generates reports",
        "teamSize": 3,
        "requiredDomains": ["finance"],
        "minReputation": 50
      }
    },
    "notes": [
      "Team composition uses semantic search and skill matching",
      "Skill requirements are auto-detected from task description",
      "Team members are selected to maximize skill coverage",
      "Each member is assigned a role based on their primary skills"
    ]
  }
}
```

---

## Response Fields

### Analysis Object

| Field | Type | Description |
|-------|------|-------------|
| `task` | string | Original task description |
| `requiredSkills` | array | Auto-detected skill requirements |
| `suggestedTeamSize` | integer | Recommended team size |
| `complexity` | string | Task complexity (low/medium/high) |

### Team Member Object

| Field | Type | Description |
|-------|------|-------------|
| `agentId` | string | Agent identifier |
| `name` | string | Agent name |
| `role` | string | Assigned role in team |
| `contributedSkills` | string[] | Skills this agent brings |
| `contributedDomains` | string[] | Domains this agent covers |
| `fitnessScore` | number | Fit score for this task (0-1) |
| `reputationScore` | number | Agent reputation (0-100) |

### Summary Fields

| Field | Type | Description |
|-------|------|-------------|
| `teamFitnessScore` | number | Overall team fitness (0-1) |
| `coveredSkills` | string[] | All skills covered by team |
| `skillGaps` | string[] | Required skills not covered |
| `coveredDomains` | string[] | All domains covered |
| `compositionTimeMs` | number | Processing time in ms |

---

## Rate Limiting

Compose endpoints have stricter rate limits due to computational costs:

| Tier | Limit |
|------|-------|
| With API Key | 100 req/min |

---

## Error Responses

| Status | Code | Description |
|--------|------|-------------|
| 400 | `VALIDATION_ERROR` | Invalid request body |
| 401 | `UNAUTHORIZED` | Missing or invalid API key |
| 429 | `RATE_LIMIT_EXCEEDED` | Too many requests |
| 500 | `INTERNAL_ERROR` | Failed to compose team |
