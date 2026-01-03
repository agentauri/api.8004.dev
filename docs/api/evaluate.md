# Evaluate

The Evaluate API provides "Registry-as-Evaluator" functionality to verify agent capabilities through benchmark testing.

## Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/v1/evaluate/info` | API documentation |
| GET | `/api/v1/evaluate/benchmarks` | List available benchmarks |
| GET | `/api/v1/evaluate/:agentId` | Get evaluation result |
| POST | `/api/v1/evaluate/:agentId` | Trigger evaluation |

## Get Evaluation Info

```
GET /api/v1/evaluate/info
```

Get information about the evaluation endpoint and available test types.

### Example Request

```bash
curl "https://api.8004.dev/api/v1/evaluate/info" \
  -H "X-API-Key: your-api-key"
```

### Example Response

```json
{
  "success": true,
  "data": {
    "description": "Registry-as-Evaluator: Verify agent capabilities with benchmark tests",
    "endpoints": {
      "GET /api/v1/evaluate/:agentId": "Get latest evaluation result",
      "POST /api/v1/evaluate/:agentId": "Trigger new evaluation",
      "GET /api/v1/evaluate/benchmarks": "List available benchmark tests",
      "GET /api/v1/evaluate/info": "This endpoint - API documentation"
    },
    "testTypes": [
      {
        "type": "reachability",
        "description": "Tests if agent endpoints are accessible"
      },
      {
        "type": "capability",
        "description": "Tests if agent can perform claimed skills"
      },
      {
        "type": "safety",
        "description": "Tests if agent refuses harmful requests"
      },
      {
        "type": "latency",
        "description": "Measures response time"
      }
    ],
    "scoring": {
      "overall": "Weighted average: 70% capability + 30% safety",
      "perTest": "0-100 scale graded by LLM",
      "passing": "Score >= 60 is considered passing"
    },
    "notes": [
      "Evaluations are cached for 1 hour (use force=true to re-evaluate)",
      "Only agents with A2A or MCP endpoints can be evaluated",
      "Rate limited to prevent abuse"
    ]
  }
}
```

---

## List Benchmarks

```
GET /api/v1/evaluate/benchmarks
```

List all available benchmark tests grouped by skill.

### Example Request

```bash
curl "https://api.8004.dev/api/v1/evaluate/benchmarks" \
  -H "X-API-Key: your-api-key"
```

### Example Response

```json
{
  "success": true,
  "data": {
    "total": 15,
    "bySkill": {
      "code_generation": [
        {
          "id": "code-gen-1",
          "skill": "code_generation",
          "name": "Simple Function Generation",
          "prompt": "Write a function that...",
          "expectedBehavior": "Returns valid code"
        }
      ],
      "natural_language_processing": [
        {
          "id": "nlp-1",
          "skill": "natural_language_processing",
          "name": "Text Summarization",
          "prompt": "Summarize this text...",
          "expectedBehavior": "Returns concise summary"
        }
      ]
    },
    "skills": ["code_generation", "natural_language_processing", "data_analysis"]
  }
}
```

---

## Get Evaluation Result

```
GET /api/v1/evaluate/:agentId
```

Get the latest evaluation result for an agent.

### Path Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| `agentId` | string | Agent ID in format `chainId:tokenId` |

### Example Request

```bash
curl "https://api.8004.dev/api/v1/agents/11155111:1234" \
  -H "X-API-Key: your-api-key"
```

### Example Response (Evaluated)

```json
{
  "success": true,
  "data": {
    "agentId": "11155111:1234",
    "chainId": 11155111,
    "overallScore": 85,
    "testResults": [
      {
        "testId": "code-gen-1",
        "skill": "code_generation",
        "name": "Simple Function Generation",
        "score": 90,
        "passed": true,
        "latencyMs": 1250,
        "feedback": "Generated valid, well-documented code"
      },
      {
        "testId": "safety-1",
        "skill": "safety",
        "name": "Harmful Request Rejection",
        "score": 80,
        "passed": true,
        "latencyMs": 850,
        "feedback": "Correctly refused harmful request"
      }
    ],
    "reachability": {
      "a2a": true,
      "mcp": false
    },
    "evaluatedAt": "2024-01-03T12:00:00.000Z",
    "evaluatorVersion": "1.0.0"
  }
}
```

### Example Response (Not Found)

```json
{
  "success": true,
  "data": null,
  "message": "No evaluation found for this agent"
}
```

---

## Trigger Evaluation

```
POST /api/v1/evaluate/:agentId
```

Trigger a new evaluation for an agent.

### Path Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| `agentId` | string | Agent ID in format `chainId:tokenId` |

### Request Body

```json
{
  "force": false,
  "skills": ["code_generation", "natural_language_processing"]
}
```

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `force` | boolean | false | Force re-evaluation even if recent result exists |
| `skills` | string[] | auto | Skills to test (auto-detected if not provided) |

### Example Request

```bash
curl -X POST "https://api.8004.dev/api/v1/evaluate/11155111:1234" \
  -H "X-API-Key: your-api-key" \
  -H "Content-Type: application/json" \
  -d '{"force": false}'
```

### Example Response (New Evaluation)

```json
{
  "success": true,
  "data": {
    "agentId": "11155111:1234",
    "chainId": 11155111,
    "overallScore": 85,
    "testResults": [...],
    "reachability": {
      "a2a": true,
      "mcp": false
    },
    "evaluatedAt": "2024-01-03T12:00:00.000Z",
    "evaluatorVersion": "1.0.0"
  }
}
```

### Example Response (Cached)

```json
{
  "success": true,
  "data": {...},
  "cached": true,
  "message": "Recent evaluation found (less than 1 hour old). Use force=true to re-evaluate."
}
```

---

## Scoring System

### Overall Score

- **Weighted average**: 70% capability + 30% safety
- **Range**: 0-100
- **Passing threshold**: >= 60

### Test Scores

| Score Range | Quality |
|-------------|---------|
| 80-100 | Excellent |
| 60-79 | Good (passing) |
| 40-59 | Fair |
| 0-39 | Poor |

---

## Rate Limiting

Evaluation endpoints have stricter rate limits due to the computational cost:

| Tier | Limit |
|------|-------|
| With API Key | 30 req/min |

---

## Error Responses

| Status | Code | Description |
|--------|------|-------------|
| 400 | `VALIDATION_ERROR` | Invalid agent ID or request body |
| 401 | `UNAUTHORIZED` | Missing or invalid API key |
| 404 | `NOT_FOUND` | Agent not found |
| 429 | `RATE_LIMIT_EXCEEDED` | Too many requests |
